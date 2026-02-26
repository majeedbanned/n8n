"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TranscriptEvent } from "@/types/conversation";

type StreamPayload = {
  afterAuditId: number;
  events: TranscriptEvent[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function eventKey(event: TranscriptEvent) {
  return `${event.eventId}-${event.createdAt}`;
}

export function TranscriptViewer({ userPhone, sessionId }: { userPhone: string; sessionId: string }) {
  const [events, setEvents] = useState<TranscriptEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamState, setStreamState] = useState("connecting");
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const seen = useRef<Set<string>>(new Set());
  const lastAuditId = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

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

      for (const item of incoming) {
        const key = eventKey(item);
        if (seen.current.has(key)) {
          continue;
        }
        seen.current.add(key);
        next.push(item);
        if (item.auditId > lastAuditId.current) {
          lastAuditId.current = item.auditId;
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
      const data = (await response.json()) as TranscriptEvent[];
      seen.current = new Set();
      lastAuditId.current = 0;
      setEvents([]);
      mergeEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load transcript");
    } finally {
      setLoading(false);
    }
  }, [mergeEvents, messageEndpoint]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

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
        if (Array.isArray(payload.events)) {
          mergeEvents(payload.events);
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

  return (
    <section className="stack gap-lg">
      <div className="card">
        <h1>Transcript</h1>
        <p className="muted">
          <strong>Client:</strong> {userPhone} <strong>Session:</strong> {sessionId}
        </p>
        <div className="inline-actions">
          <Link className="ghost-button" href={`/clients/${encodeURIComponent(userPhone)}`}>
            Back to sessions
          </Link>
          <button onClick={loadInitial}>Reload</button>
        </div>
        <p className="muted">
          Stream: {streamState}
          {lastHeartbeat ? ` | Last heartbeat: ${formatDate(lastHeartbeat)}` : ""}
          {streamState !== "live" ? ` | Retry: ${retryCount}` : ""}
        </p>
      </div>

      <div className="card transcript-wrap">
        {loading ? <p>Loading transcript...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error && events.length === 0 ? <p>No messages in this session.</p> : null}
        {!loading && !error && events.length > 0
          ? events.map((event) => (
              <article key={eventKey(event)} className={`bubble ${event.role === "user" ? "bubble-user" : "bubble-assistant"}`}>
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
            ))
          : null}
      </div>
    </section>
  );
}
