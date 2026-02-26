import { requireApiAuth } from "@/lib/require-api-auth";
import { listSessionsForClient } from "@/lib/queries/conversations";
import { mapDbError } from "@/lib/db-error";
import { NextResponse } from "next/server";

type Params = {
  params: Promise<{ userPhone: string }>;
};

export async function GET(_: Request, { params }: Params) {
  const { unauthorized } = await requireApiAuth();
  if (unauthorized) {
    return unauthorized;
  }

  const { userPhone } = await params;
  try {
    const sessions = await listSessionsForClient(decodeURIComponent(userPhone));
    return NextResponse.json(sessions);
  } catch (error) {
    const mapped = mapDbError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
