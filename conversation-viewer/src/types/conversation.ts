export const UNSCOPED_SESSION_ID = "__unscoped__";

export type ClientSummary = {
  userPhone: string;
  clientId: number | null;
  totalAuditRows: number;
  totalSessions: number;
  channels: string[];
  escalatedCount: number;
  avgSentiment: number | null;
  lastInteractionAt: string;
  lastInboundPreview: string | null;
  lastOutboundPreview: string | null;
};

export type SessionSummary = {
  sessionId: string;
  channel: string | null;
  messagesCount: number;
  sessionStart: string | null;
  sessionEnd: string | null;
  lastMessageAt: string;
  escalated: boolean;
  sentimentAvg: number | null;
};

export type ClientNavItem = {
  userPhone: string;
  latestSessionId: string;
  lastInteractionAt: string;
};

export type ClientStats = {
  userPhone: string;
  totalAuditRows: number;
  totalSessions: number;
  totalMessages: number;
  escalatedCount: number;
  avgSentiment: number | null;
  channels: string[];
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
};

export type TranscriptEvent = {
  eventId: string;
  auditId: number;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  channel: string | null;
  intent: string | null;
  sentiment: string | null;
  sentimentScore: number | null;
  escalated: boolean;
};

export type AuditRow = {
  id: number | string;
  channel: string | null;
  inbound_text: string | null;
  outbound_text: string | null;
  intent_classified: string | null;
  sentiment: string | null;
  sentiment_score: number | string | null;
  escalated: boolean | null;
  created_at: string;
};
