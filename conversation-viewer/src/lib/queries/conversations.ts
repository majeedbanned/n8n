import { pool } from "@/lib/db";
import {
  AuditRow,
  ClientNavItem,
  ClientStats,
  ClientSummary,
  SessionSummary,
  TranscriptEvent,
  UNSCOPED_SESSION_ID,
} from "@/types/conversation";

export type ClientFilters = {
  q?: string;
  channel?: string;
  from?: string;
  to?: string;
  escalated?: boolean;
};

function toIso(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function toNumber(value: unknown): number {
  return Number(value ?? 0);
}

function toMaybeNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function toTranscriptEvents(rows: AuditRow[]): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  for (const row of rows) {
    const auditId = toNumber(row.id);
    const createdAt = toIso(row.created_at) ?? new Date(0).toISOString();
    const sentimentScore = toMaybeNumber(row.sentiment_score);

    if (row.inbound_text && row.inbound_text.trim()) {
      events.push({
        eventId: `${auditId}-in`,
        auditId,
        role: "user",
        text: row.inbound_text,
        createdAt,
        channel: row.channel,
        intent: row.intent_classified,
        sentiment: row.sentiment,
        sentimentScore,
        escalated: Boolean(row.escalated),
      });
    }

    if (row.outbound_text && row.outbound_text.trim()) {
      events.push({
        eventId: `${auditId}-out`,
        auditId,
        role: "assistant",
        text: row.outbound_text,
        createdAt,
        channel: row.channel,
        intent: row.intent_classified,
        sentiment: row.sentiment,
        sentimentScore,
        escalated: Boolean(row.escalated),
      });
    }
  }

  events.sort((a, b) => {
    if (a.createdAt === b.createdAt) {
      if (a.auditId === b.auditId) {
        if (a.role === b.role) {
          return 0;
        }
        return a.role === "user" ? -1 : 1;
      }
      return a.auditId - b.auditId;
    }
    return a.createdAt.localeCompare(b.createdAt);
  });

  return events;
}

export async function listClients(filters: ClientFilters): Promise<ClientSummary[]> {
  const params: unknown[] = [];
  const where: string[] = ["a.user_phone IS NOT NULL", "a.user_phone <> ''"];

  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    where.push(`(a.user_phone ILIKE $${idx} OR COALESCE(a.inbound_text, '') ILIKE $${idx} OR COALESCE(a.outbound_text, '') ILIKE $${idx})`);
  }

  if (filters.channel) {
    params.push(filters.channel);
    where.push(`a.channel = $${params.length}`);
  }

  if (filters.from) {
    params.push(filters.from);
    where.push(`a.created_at >= $${params.length}::timestamptz`);
  }

  if (filters.to) {
    params.push(filters.to);
    where.push(`a.created_at <= $${params.length}::timestamptz`);
  }

  if (filters.escalated) {
    where.push("a.escalated = true");
  }

  const query = `
    WITH filtered AS (
      SELECT *
      FROM chat_audit_logs a
      WHERE ${where.join(" AND ")}
    ), grouped AS (
      SELECT
        f.user_phone,
        MAX(f.client_id) AS client_id,
        COUNT(*)::int AS total_audit_rows,
        COUNT(DISTINCT COALESCE(NULLIF(f.session_id, ''), '${UNSCOPED_SESSION_ID}'))::int AS total_sessions,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT f.channel), NULL)::text[] AS channels,
        COUNT(*) FILTER (WHERE f.escalated = true)::int AS escalated_count,
        AVG(f.sentiment_score) AS avg_sentiment,
        MAX(f.created_at) AS last_interaction_at
      FROM filtered f
      GROUP BY f.user_phone
    )
    SELECT
      g.user_phone,
      g.client_id,
      g.total_audit_rows,
      g.total_sessions,
      g.channels,
      g.escalated_count,
      g.avg_sentiment,
      g.last_interaction_at,
      l.inbound_text AS last_inbound_preview,
      l.outbound_text AS last_outbound_preview
    FROM grouped g
    LEFT JOIN LATERAL (
      SELECT inbound_text, outbound_text
      FROM filtered fx
      WHERE fx.user_phone = g.user_phone
      ORDER BY fx.created_at DESC, fx.id DESC
      LIMIT 1
    ) l ON true
    ORDER BY g.last_interaction_at DESC
    LIMIT 500;
  `;

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    userPhone: row.user_phone,
    clientId: row.client_id ?? null,
    totalAuditRows: toNumber(row.total_audit_rows),
    totalSessions: toNumber(row.total_sessions),
    channels: row.channels ?? [],
    escalatedCount: toNumber(row.escalated_count),
    avgSentiment: row.avg_sentiment === null ? null : Number(row.avg_sentiment),
    lastInteractionAt: toIso(row.last_interaction_at) ?? new Date(0).toISOString(),
    lastInboundPreview: row.last_inbound_preview ?? null,
    lastOutboundPreview: row.last_outbound_preview ?? null,
  }));
}

export async function listSessionsForClient(userPhone: string): Promise<SessionSummary[]> {
  const query = `
    WITH logs AS (
      SELECT
        COALESCE(NULLIF(a.session_id, ''), '${UNSCOPED_SESSION_ID}') AS session_key,
        MAX(a.channel) AS channel,
        COUNT(*)::int AS audit_rows,
        MIN(a.created_at) AS first_message_at,
        MAX(a.created_at) AS last_message_at,
        BOOL_OR(COALESCE(a.escalated, false)) AS escalated,
        AVG(a.sentiment_score) AS avg_sentiment
      FROM chat_audit_logs a
      WHERE a.user_phone = $1
      GROUP BY COALESCE(NULLIF(a.session_id, ''), '${UNSCOPED_SESSION_ID}')
    )
    SELECT
      l.session_key,
      COALESCE(cs.channel, l.channel) AS channel,
      COALESCE(cs.messages_count, l.audit_rows)::int AS messages_count,
      COALESCE(cs.session_start, l.first_message_at) AS session_start,
      COALESCE(cs.session_end, l.last_message_at) AS session_end,
      l.last_message_at,
      COALESCE(cs.escalated, l.escalated) AS escalated,
      COALESCE(cs.sentiment_avg, l.avg_sentiment) AS sentiment_avg
    FROM logs l
    LEFT JOIN chat_sessions cs ON cs.session_id = l.session_key
    ORDER BY l.last_message_at DESC;
  `;

  const result = await pool.query(query, [userPhone]);
  return result.rows.map((row) => ({
    sessionId: row.session_key,
    channel: row.channel ?? null,
    messagesCount: toNumber(row.messages_count),
    sessionStart: toIso(row.session_start),
    sessionEnd: toIso(row.session_end),
    lastMessageAt: toIso(row.last_message_at) ?? new Date(0).toISOString(),
    escalated: Boolean(row.escalated),
    sentimentAvg: row.sentiment_avg === null ? null : Number(row.sentiment_avg),
  }));
}

export async function listClientNavItems(limit = 500): Promise<ClientNavItem[]> {
  const query = `
    WITH latest_per_client AS (
      SELECT DISTINCT ON (a.user_phone)
        a.user_phone,
        COALESCE(NULLIF(a.session_id, ''), '${UNSCOPED_SESSION_ID}') AS latest_session_id,
        a.created_at AS last_interaction_at
      FROM chat_audit_logs a
      WHERE a.user_phone IS NOT NULL
        AND a.user_phone <> ''
      ORDER BY a.user_phone, a.created_at DESC, a.id DESC
    )
    SELECT
      l.user_phone,
      l.latest_session_id,
      l.last_interaction_at
    FROM latest_per_client l
    ORDER BY l.last_interaction_at DESC
    LIMIT $1;
  `;

  const result = await pool.query(query, [limit]);
  return result.rows.map((row) => ({
    userPhone: row.user_phone,
    latestSessionId: row.latest_session_id,
    lastInteractionAt: toIso(row.last_interaction_at) ?? new Date(0).toISOString(),
  }));
}

export async function getClientStats(userPhone: string): Promise<ClientStats> {
  const query = `
    SELECT
      a.user_phone,
      COUNT(*)::int AS total_audit_rows,
      COUNT(DISTINCT COALESCE(NULLIF(a.session_id, ''), '${UNSCOPED_SESSION_ID}'))::int AS total_sessions,
      SUM(
        (CASE WHEN COALESCE(BTRIM(a.inbound_text), '') <> '' THEN 1 ELSE 0 END) +
        (CASE WHEN COALESCE(BTRIM(a.outbound_text), '') <> '' THEN 1 ELSE 0 END)
      )::int AS total_messages,
      COUNT(*) FILTER (WHERE COALESCE(a.escalated, false) = true)::int AS escalated_count,
      AVG(a.sentiment_score) AS avg_sentiment,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT a.channel), NULL)::text[] AS channels,
      MIN(a.created_at) AS first_interaction_at,
      MAX(a.created_at) AS last_interaction_at
    FROM chat_audit_logs a
    WHERE a.user_phone = $1
    GROUP BY a.user_phone;
  `;

  const result = await pool.query(query, [userPhone]);
  if (result.rows.length === 0) {
    return {
      userPhone,
      totalAuditRows: 0,
      totalSessions: 0,
      totalMessages: 0,
      escalatedCount: 0,
      avgSentiment: null,
      channels: [],
      firstInteractionAt: null,
      lastInteractionAt: null,
    };
  }

  const row = result.rows[0];
  return {
    userPhone: row.user_phone,
    totalAuditRows: toNumber(row.total_audit_rows),
    totalSessions: toNumber(row.total_sessions),
    totalMessages: toNumber(row.total_messages),
    escalatedCount: toNumber(row.escalated_count),
    avgSentiment: row.avg_sentiment === null ? null : Number(row.avg_sentiment),
    channels: row.channels ?? [],
    firstInteractionAt: toIso(row.first_interaction_at),
    lastInteractionAt: toIso(row.last_interaction_at),
  };
}

export async function listAuditRowsForSession(
  userPhone: string,
  sessionId: string,
  afterAuditId?: number,
): Promise<AuditRow[]> {
  const params: unknown[] = [userPhone];
  const where = ["user_phone = $1"];

  if (sessionId === UNSCOPED_SESSION_ID) {
    where.push("(session_id IS NULL OR session_id = '')");
  } else {
    params.push(sessionId);
    where.push(`session_id = $${params.length}`);
  }

  if (typeof afterAuditId === "number" && Number.isFinite(afterAuditId)) {
    params.push(afterAuditId);
    where.push(`id > $${params.length}`);
  }

  const query = `
    SELECT
      id,
      channel,
      inbound_text,
      outbound_text,
      intent_classified,
      sentiment,
      sentiment_score,
      escalated,
      created_at
    FROM chat_audit_logs
    WHERE ${where.join(" AND ")}
    ORDER BY created_at ASC, id ASC;
  `;

  const result = await pool.query(query, params);
  return result.rows as AuditRow[];
}

export async function listTranscriptEvents(
  userPhone: string,
  sessionId: string,
  afterAuditId?: number,
): Promise<TranscriptEvent[]> {
  const rows = await listAuditRowsForSession(userPhone, sessionId, afterAuditId);
  return toTranscriptEvents(rows);
}
