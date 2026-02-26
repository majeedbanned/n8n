"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SessionSummary } from "@/types/conversation";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

export function SessionList({ userPhone }: { userPhone: string }) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients/${encodeURIComponent(userPhone)}/sessions`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || `Request failed (${response.status})`);
      }
      setSessions((await response.json()) as SessionSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load sessions");
    } finally {
      setLoading(false);
    }
  }, [userPhone]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="stack gap-lg">
      <div className="card">
        <h1>Sessions for {userPhone}</h1>
        <div className="inline-actions">
          <Link className="ghost-button" href="/clients">
            Back to clients
          </Link>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <div className="card">
        {loading ? <p>Loading sessions...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error && sessions.length === 0 ? <p>No sessions found.</p> : null}
        {!loading && !error && sessions.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Channel</th>
                  <th>Messages</th>
                  <th>Escalated</th>
                  <th>Sentiment Avg</th>
                  <th>Last Message</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.sessionId}>
                    <td>
                      <Link
                        href={`/clients/${encodeURIComponent(userPhone)}/sessions/${encodeURIComponent(session.sessionId)}`}
                      >
                        {session.sessionId}
                      </Link>
                    </td>
                    <td>{session.channel ?? "-"}</td>
                    <td>{session.messagesCount}</td>
                    <td>{session.escalated ? "yes" : "no"}</td>
                    <td>{session.sentimentAvg ?? "-"}</td>
                    <td>{formatDate(session.lastMessageAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
