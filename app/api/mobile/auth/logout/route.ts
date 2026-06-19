import { getBearerToken, revokeMobileToken } from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (token) {
    await revokeMobileToken(token);
  }

  return NextResponse.json({ success: true });
}
