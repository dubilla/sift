import {
  exchangeMobileAuthCode,
  isAllowedMobileRedirectUri,
  mobileRedirectUri,
} from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code : "";
  const redirectUri =
    typeof body?.redirectUri === "string" ? body.redirectUri : mobileRedirectUri();
  const deviceName = typeof body?.deviceName === "string" ? body.deviceName : undefined;

  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  if (!isAllowedMobileRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "Invalid redirect URI" }, { status: 400 });
  }

  const session = await exchangeMobileAuthCode({ code, redirectUri, deviceName });
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  return NextResponse.json({
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    user: session.user,
  });
}
