import { requireApiAuth } from "@/lib/require-api-auth";
import { subscribeToAuditLogInserts } from "@/lib/realtime-events";
import { listTranscriptEvents } from "@/lib/queries/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const FALLBACK_LOOKBACK_AUDIT_IDS = 10;

function getHeartbeatMs(): number {
  const raw = process.env.STREAM_HEARTBEAT_MS;
  const parsed = raw ? Number(raw) : 15000;
  if (!Number.isFinite(parsed)) {
    return 15000;
  }
  return Math.min(Math.max(parsed, 1000), 60000);
}

function getFallbackPollMs(): number {
  const raw = process.env.STREAM_FALLBACK_POLL_MS;
  const parsed = raw ? Number(raw) : 30000;
  if (!Number.isFinite(parsed)) {
    return 30000;
  }
  return Math.min(Math.max(parsed, 5000), 300000);
}

function formatSse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(request: Request) {
  const { unauthorized } = await requireApiAuth();
  if (unauthorized) {
    return unauthorized;
  }

  const url = new URL(request.url);
  const userPhone = url.searchParams.get("userPhone");
  const sessionId = url.searchParams.get("sessionId");

  if (!userPhone || !sessionId) {
    return new Response(JSON.stringify({ error: "userPhone and sessionId are required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const afterAuditIdRaw = url.searchParams.get("afterAuditId");
  let afterAuditId = afterAuditIdRaw ? Number(afterAuditIdRaw) : 0;
  if (!Number.isFinite(afterAuditId)) {
    afterAuditId = 0;
  }

  const decodedUserPhone = decodeURIComponent(userPhone);
  const decodedSessionId = decodeURIComponent(sessionId);
  const normalizedUserPhone = decodedUserPhone.trim();

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let inFlight = false;
      let queued = false;

      const push = (event: string, payload: unknown) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(formatSse(event, payload)));
      };

      const fetchAndPush = async (requestedAfterAuditId?: number) => {
        if (closed) {
          return;
        }

        if (inFlight) {
          queued = true;
          return;
        }

        const boundedRequestedAfterAuditId =
          typeof requestedAfterAuditId === "number" && Number.isFinite(requestedAfterAuditId)
            ? Math.max(0, Math.min(requestedAfterAuditId, afterAuditId))
            : afterAuditId;

        inFlight = true;
        try {
          const events = await listTranscriptEvents(
            decodedUserPhone,
            decodedSessionId,
            boundedRequestedAfterAuditId,
          );

          if (events.length > 0) {
            afterAuditId = Math.max(afterAuditId, events[events.length - 1].auditId);
            push("message_batch", { afterAuditId, events });
          }
        } catch {
          push("message_batch", { afterAuditId, events: [], error: "poll_failed" });
        } finally {
          inFlight = false;
          if (queued && !closed) {
            queued = false;
            void fetchAndPush();
          }
        }
      };

      push("heartbeat", { ts: new Date().toISOString() });

      const unsubscribe = subscribeToAuditLogInserts((event) => {
        if ((event.userPhone ?? "").trim() !== normalizedUserPhone) {
          return;
        }

        const replayAfterAuditId = Math.max(Math.min(afterAuditId, event.id - 1), 0);
        void fetchAndPush(replayAfterAuditId);
      });

      const fallbackInterval = setInterval(() => {
        const replayAfterAuditId = Math.max(afterAuditId - FALLBACK_LOOKBACK_AUDIT_IDS, 0);
        void fetchAndPush(replayAfterAuditId);
      }, getFallbackPollMs());

      const heartbeatInterval = setInterval(() => {
        push("heartbeat", { ts: new Date().toISOString() });
      }, getHeartbeatMs());

      void fetchAndPush();

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe();
        clearInterval(fallbackInterval);
        clearInterval(heartbeatInterval);
        controller.close();
      };

      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
