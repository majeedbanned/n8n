"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClientNavItem, ClientStats, TranscriptEvent } from "@/types/conversation";

type StreamPayload = {
  afterAuditId: number;
  events: unknown;
};
type AuditInsertPayload = {
  id?: number;
  userPhone?: string | null;
  sessionId?: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function formatCount(value: number) {
  return value.toLocaleString();
}

function eventKey(event: TranscriptEvent) {
  return event.eventId;
}

function toFiniteNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeIncomingEvents(payload: unknown): TranscriptEvent[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const events: TranscriptEvent[] = [];

  for (const entry of payload) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const source = entry as Record<string, unknown>;
    const auditId = toFiniteNumber(source.auditId);
    const text = typeof source.text === "string" ? source.text : "";
    const createdAtSource = typeof source.createdAt === "string" ? source.createdAt : "";

    if (auditId === null || !text.trim()) {
      continue;
    }

    const parsedCreatedAt = new Date(createdAtSource);
    const createdAt = Number.isNaN(parsedCreatedAt.getTime()) ? new Date(0).toISOString() : parsedCreatedAt.toISOString();

    const sentimentScoreRaw = source.sentimentScore;
    const sentimentScore =
      sentimentScoreRaw === null || sentimentScoreRaw === undefined ? null : toFiniteNumber(sentimentScoreRaw);

    const role = source.role === "assistant" ? "assistant" : "user";
    const eventId = typeof source.eventId === "string" && source.eventId ? source.eventId : `${auditId}-${role === "user" ? "in" : "out"}`;

    events.push({
      eventId,
      auditId,
      role,
      text,
      createdAt,
      channel: typeof source.channel === "string" ? source.channel : null,
      intent: typeof source.intent === "string" ? source.intent : null,
      sentiment: typeof source.sentiment === "string" ? source.sentiment : null,
      sentimentScore,
      escalated: Boolean(source.escalated),
    });
  }

  return events;
}

function sameEvent(a: TranscriptEvent, b: TranscriptEvent): boolean {
  return (
    a.eventId === b.eventId &&
    a.auditId === b.auditId &&
    a.role === b.role &&
    a.text === b.text &&
    a.createdAt === b.createdAt &&
    a.channel === b.channel &&
    a.intent === b.intent &&
    a.sentiment === b.sentiment &&
    a.sentimentScore === b.sentimentScore &&
    a.escalated === b.escalated
  );
}

export function TranscriptViewer({
  userPhone,
  sessionId,
  initialEvents = [],
  clientNavItems = [],
  clientStats = null,
}: {
  userPhone: string;
  sessionId: string;
  initialEvents?: TranscriptEvent[];
  clientNavItems?: ClientNavItem[];
  clientStats?: ClientStats | null;
}) {
  const normalizedInitialEvents = useMemo(() => normalizeIncomingEvents(initialEvents), [initialEvents]);
  const initialLastAuditId = useMemo(
    () => normalizedInitialEvents.reduce((max, event) => Math.max(max, event.auditId), 0),
    [normalizedInitialEvents],
  );

  const [events, setEvents] = useState<TranscriptEvent[]>(normalizedInitialEvents);
  const [loading, setLoading] = useState(normalizedInitialEvents.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [draft, setDraft] = useState("");

  const lastAuditId = useRef(initialLastAuditId);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);

  const messageEndpoint = useMemo(() => {
    const params = new URLSearchParams({ sessionId });
    return `/api/clients/${encodeURIComponent(userPhone)}/messages?${params.toString()}`;
  }, [sessionId, userPhone]);

  const mergeEvents = useCallback((incoming: TranscriptEvent[]) => {
    if (!incoming.length) {
      return;
    }

    setEvents((previous) => {
      const next = [...previous];
      const indexByEventId = new Map<string, number>();
      for (let idx = 0; idx < previous.length; idx += 1) {
        indexByEventId.set(previous[idx].eventId, idx);
      }

      for (const item of incoming) {
        const existingIndex = indexByEventId.get(item.eventId);
        if (existingIndex === undefined) {
          next.push(item);
          indexByEventId.set(item.eventId, next.length - 1);
          continue;
        }

        if (!sameEvent(next[existingIndex], item)) {
          next[existingIndex] = item;
        }
      }

      next.sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          if (a.auditId === b.auditId) {
            return a.role === "user" ? -1 : 1;
          }
          return a.auditId - b.auditId;
        }
        return a.createdAt.localeCompare(b.createdAt);
      });

      return next;
    });
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(messageEndpoint, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || `Request failed (${response.status})`);
      }
      const data = normalizeIncomingEvents(await response.json());
      const ordered = [...data].sort((a, b) => {
        if (a.createdAt === b.createdAt) {
          if (a.auditId === b.auditId) {
            return a.role === "user" ? -1 : 1;
          }
          return a.auditId - b.auditId;
        }
        return a.createdAt.localeCompare(b.createdAt);
      });
      setEvents(ordered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load transcript");
    } finally {
      setLoading(false);
    }
  }, [messageEndpoint]);

  useEffect(() => {
    if (normalizedInitialEvents.length > 0) {
      return;
    }
    loadInitial();
  }, [loadInitial, normalizedInitialEvents.length]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list) {
      return;
    }

    list.scrollTop = list.scrollHeight;
  }, [events.length, loading, sessionId, userPhone]);

  useEffect(() => {
    lastAuditId.current = events.reduce((max, item) => Math.max(max, item.auditId), 0);
  }, [events]);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      setStreamState("connecting");

      const params = new URLSearchParams({
        userPhone,
        sessionId,
        afterAuditId: String(lastAuditId.current),
      });
      const source = new EventSource(`/api/stream/messages?${params.toString()}`);
      sourceRef.current = source;

      source.addEventListener("open", () => {
        setStreamState("live");
        setRetryCount(0);
      });

      source.addEventListener("heartbeat", (event) => {
        setLastHeartbeat(new Date().toISOString());
        if (event.data) {
          try {
            const payload = JSON.parse(event.data) as { ts?: string };
            if (payload.ts) {
              setLastHeartbeat(payload.ts);
            }
          } catch {
            // ignore malformed heartbeat payload
          }
        }
      });

      source.addEventListener("message_batch", (event) => {
        if (!event.data) {
          return;
        }

        const payload = JSON.parse(event.data) as StreamPayload;
        const incomingEvents = normalizeIncomingEvents(payload.events);
        if (incomingEvents.length > 0) {
          mergeEvents(incomingEvents);
        }
      });

      source.onerror = () => {
        setStreamState("reconnecting");
        source.close();

        if (cancelled) {
          return;
        }

        setRetryCount((count) => {
          const next = Math.min(count + 1, 6);
          const delay = Math.min(1000 * 2 ** next, 30000);
          reconnectTimer.current = setTimeout(connect, delay);
          return next;
        });
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (sourceRef.current) {
        sourceRef.current.close();
      }
    };
  }, [mergeEvents, sessionId, userPhone]);

  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const params = new URLSearchParams({ userPhone });
    const source = new EventSource(`/api/stream/updates?${params.toString()}`);

    const pullDelta = async () => {
      if (closed) {
        return;
      }

      try {
        const deltaParams = new URLSearchParams({
          sessionId,
          afterAuditId: String(lastAuditId.current),
        });
        const response = await fetch(
          `/api/clients/${encodeURIComponent(userPhone)}/messages?${deltaParams.toString()}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return;
        }

        const incoming = normalizeIncomingEvents(await response.json());
        if (incoming.length > 0) {
          mergeEvents(incoming);
        }
      } catch {}
    };

    const scheduleDeltaPull = () => {
      if (refreshTimer) {
        return;
      }

      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void pullDelta();
      }, 150);
    };

    source.addEventListener("audit_log_insert", (event) => {
      if (!event.data) {
        scheduleDeltaPull();
        return;
      }

      let payload: AuditInsertPayload | null = null;
      try {
        payload = JSON.parse(event.data) as AuditInsertPayload;
      } catch {
        payload = null;
      }

      if (payload?.sessionId && String(payload.sessionId) !== sessionId) {
        return;
      }

      scheduleDeltaPull();
    });

    return () => {
      closed = true;
      source.close();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }
    };
  }, [mergeEvents, sessionId, userPhone]);

  return (
    <section className="transcript-layout">
      <aside className="client-sidebar">
        <div className="client-sidebar-header">
          <p className="client-sidebar-kicker">Conversation Hub</p>
          <h2>Clients</h2>
          <p>Switch chats instantly.</p>
        </div>
        <nav className="client-sidebar-list">
          {clientNavItems.length === 0 ? <p className="muted">No clients found.</p> : null}
          {clientNavItems.map((item) => {
            const isActive = item.userPhone === userPhone;
            const href = `/clients/${encodeURIComponent(item.userPhone)}/sessions/${encodeURIComponent(item.latestSessionId)}`;

            return (
              <Link
                key={item.userPhone}
                href={href}
                className={`client-sidebar-item ${isActive ? "client-sidebar-item-active" : ""}`}
              >
                <span className="client-sidebar-item-dot" />
                <span className="client-sidebar-item-content">
                  <strong>{item.userPhone}</strong>
                  <span>{formatDate(item.lastInteractionAt)}</span>
                </span>
                <span className="client-sidebar-item-arrow">{">"}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="stack gap-lg">
        <div className="card transcript-summary-card">
          <div className="transcript-summary-head">
            <h1>Transcript</h1>
            <div className="inline-actions">
              <Link className="ghost-button" href={`/clients/${encodeURIComponent(userPhone)}`}>
                Back to sessions
              </Link>
              <button onClick={loadInitial}>Reload</button>
            </div>
          </div>
          <p className="muted">
            <strong>{userPhone}</strong> | Session: {sessionId}
          </p>
          {clientStats ? (
            <div className="stats-grid">
              <article className="stat-tile">
                <span>Total Messages</span>
                <strong>{formatCount(clientStats.totalMessages)}</strong>
              </article>
              <article className="stat-tile">
                <span>Sessions</span>
                <strong>{formatCount(clientStats.totalSessions)}</strong>
              </article>
              <article className="stat-tile">
                <span>Escalated</span>
                <strong>{formatCount(clientStats.escalatedCount)}</strong>
              </article>
              <article className="stat-tile">
                <span>Last Seen</span>
                <strong>{clientStats.lastInteractionAt ? formatDate(clientStats.lastInteractionAt) : "-"}</strong>
              </article>
            </div>
          ) : null}
          <p className="muted transcript-status-line">
            Stream: {streamState}
            {streamState !== "live" ? ` (${retryCount})` : ""}
            {lastHeartbeat ? ` | ${formatDate(lastHeartbeat)}` : ""}
          </p>
        </div>

        <div className="card chat-shell">
          <div ref={messageListRef} className="chat-window">
            {loading && events.length === 0 ? <p>Loading transcript...</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
            {!loading && !error && events.length === 0 ? <p>No messages in this session.</p> : null}
            {!error && events.length > 0
              ? events.map((event) => (
                  <div
                    key={eventKey(event)}
                    className={`chat-row ${event.role === "user" ? "chat-row-user" : "chat-row-assistant"}`}
                  >
                    <article className={`bubble ${event.role === "user" ? "bubble-user" : "bubble-assistant"}`}>
                      <header className="bubble-head">
                        <strong>{event.role === "user" ? "Client" : "Assistant"}</strong>
                        <span>{formatDate(event.createdAt)}</span>
                      </header>
                      <p>{event.text}</p>
                      <footer className="bubble-meta">
                        <span>Audit #{event.auditId}</span>
                        <span>Channel: {event.channel ?? "-"}</span>
                        <span>Intent: {event.intent ?? "-"}</span>
                        <span>Sentiment: {event.sentiment ?? "-"}</span>
                        <span>Escalated: {event.escalated ? "yes" : "no"}</span>
                      </footer>
                    </article>
                  </div>
                ))
              : null}
          </div>
          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <textarea
              className="chat-input"
              placeholder="Type a reply..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="chat-send" type="submit">
              Send
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
