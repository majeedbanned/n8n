import { authOptions } from "@/lib/auth-options";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function requireApiAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { session: null, unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { session, unauthorized: null };
}