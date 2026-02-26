import { requireApiAuth } from "@/lib/require-api-auth";
import { listTranscriptEvents } from "@/lib/queries/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const push = (event: string, payload: unknown) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(formatSse(event, payload)));
      };

      const poll = async () => {
        if (closed) {
          return;
        }

        try {
          const events = await listTranscriptEvents(
            decodeURIComponent(userPhone),
            decodeURIComponent(sessionId),
            afterAuditId,
          );

          if (events.length > 0) {
            afterAuditId = events[events.length - 1].auditId;
            push("message_batch", { afterAuditId, events });
          }
        } catch {
          push("message_batch", { afterAuditId, events: [], error: "poll_failed" });
        }
      };

      push("heartbeat", { ts: new Date().toISOString() });

      const pollInterval = setInterval(poll, 2000);
      const heartbeatInterval = setInterval(() => {
        push("heartbeat", { ts: new Date().toISOString() });
      }, 15000);

      poll();

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(pollInterval);
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
