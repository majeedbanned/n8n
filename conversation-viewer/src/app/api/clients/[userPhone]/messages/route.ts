import { requireApiAuth } from "@/lib/require-api-auth";
import { listTranscriptEvents } from "@/lib/queries/conversations";
import { mapDbError } from "@/lib/db-error";
import { NextResponse } from "next/server";

type Params = {
  params: Promise<{ userPhone: string }>;
};

export async function GET(request: Request, { params }: Params) {
  const { unauthorized } = await requireApiAuth();
  if (unauthorized) {
    return unauthorized;
  }

  const { userPhone } = await params;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const afterAuditIdRaw = url.searchParams.get("afterAuditId");
  const afterAuditId = afterAuditIdRaw ? Number(afterAuditIdRaw) : undefined;

  try {
    const events = await listTranscriptEvents(
      decodeURIComponent(userPhone),
      decodeURIComponent(sessionId),
      Number.isFinite(afterAuditId) ? afterAuditId : undefined,
    );

    return NextResponse.json(events);
  } catch (error) {
    const mapped = mapDbError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
