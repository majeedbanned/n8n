"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ClientSummary } from "@/types/conversation";

type Filters = {
  q: string;
  channel: string;
  from: string;
  to: string;
  escalated: boolean;
};

const defaultFilters: Filters = {
  q: "",
  channel: "",
  from: "",
  to: "",
  escalated: false,
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function ClientInbox() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.escalated) params.set("escalated", "true");
    return params.toString();
  }, [filters]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/clients?${queryString}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail || `Request failed (${response.status})`);
      }
      const data = (await response.json()) as ClientSummary[];
      setClients(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load clients");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  return (
    <section className="stack gap-lg">
      <div className="card">
        <h1>Client Inbox</h1>
        <p className="muted">Search and filter all clients seen in chat audit logs.</p>
        <div className="filters-grid">
          <label>
            Search
            <input
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
              placeholder="phone, inbound, outbound"
            />
          </label>
          <label>
            Channel
            <input
              value={filters.channel}
              onChange={(event) => setFilters((prev) => ({ ...prev, channel: event.target.value }))}
              placeholder="whatsapp / telegram / web / email"
            />
          </label>
          <label>
            From
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value }))}
            />
          </label>
          <label>
            To
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(event) => setFilters((prev) => ({ ...prev, to: event.target.value }))}
            />
          </label>
        </div>
        <label className="inline-toggle">
          <input
            type="checkbox"
            checked={filters.escalated}
            onChange={(event) => setFilters((prev) => ({ ...prev, escalated: event.target.checked }))}
          />
          Escalated only
        </label>
        <div className="inline-actions">
          <button onClick={loadClients}>Refresh</button>
          <button
            className="ghost-button"
            onClick={() => {
              setFilters(defaultFilters);
            }}
          >
            Reset
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? <p>Loading clients...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}
        {!loading && !error && clients.length === 0 ? <p>No clients found for selected filters.</p> : null}
        {!loading && !error && clients.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Sessions</th>
                  <th>Audit Rows</th>
                  <th>Channels</th>
                  <th>Escalated</th>
                  <th>Last Interaction</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.userPhone}>
                    <td>
                      <Link href={`/clients/${encodeURIComponent(client.userPhone)}`}>{client.userPhone}</Link>
                    </td>
                    <td>{client.totalSessions}</td>
                    <td>{client.totalAuditRows}</td>
                    <td>{client.channels.join(", ") || "-"}</td>
                    <td>{client.escalatedCount}</td>
                    <td>{formatDate(client.lastInteractionAt)}</td>
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
