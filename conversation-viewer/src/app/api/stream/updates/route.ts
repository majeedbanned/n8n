import { requireApiAuth } from "@/lib/require-api-auth";
import { subscribeToAuditLogInserts } from "@/lib/realtime-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getHeartbeatMs(): number {
  const raw = process.env.STREAM_HEARTBEAT_MS;
  const parsed = raw ? Number(raw) : 15000;
  if (!Number.isFinite(parsed)) {
    return 15000;
  }
  return Math.min(Math.max(parsed, 1000), 60000);
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
  const userPhoneFilterRaw = url.searchParams.get("userPhone");
  const userPhoneFilter = userPhoneFilterRaw ? decodeURIComponent(userPhoneFilterRaw) : null;

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

      const unsubscribe = subscribeToAuditLogInserts((event) => {
        if (userPhoneFilter && event.userPhone !== userPhoneFilter) {
          return;
        }
        push("audit_log_insert", event);
      });

      push("heartbeat", { ts: new Date().toISOString() });

      const heartbeatInterval = setInterval(() => {
        push("heartbeat", { ts: new Date().toISOString() });
      }, getHeartbeatMs());

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        unsubscribe();
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
