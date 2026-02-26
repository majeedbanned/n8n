import { requireApiAuth } from "@/lib/require-api-auth";
import { ClientFilters, listClients } from "@/lib/queries/conversations";
import { mapDbError } from "@/lib/db-error";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { unauthorized } = await requireApiAuth();
  if (unauthorized) {
    return unauthorized;
  }

  const params = request.nextUrl.searchParams;
  const filters: ClientFilters = {
    q: params.get("q") || undefined,
    channel: params.get("channel") || undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    escalated: params.get("escalated") === "true" ? true : undefined,
  };

  try {
    const clients = await listClients(filters);
    return NextResponse.json(clients);
  } catch (error) {
    const mapped = mapDbError(error);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
