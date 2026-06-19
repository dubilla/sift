import {
  createMobileAuthCode,
  getCurrentSession,
  isAllowedMobileRedirectUri,
  mobileRedirectUri,
} from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function redirectWithResult(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri") || mobileRedirectUri();

  if (!isAllowedMobileRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "Invalid redirect URI" }, { status: 400 });
  }

  const session = await getCurrentSession(request);
  if (!session?.user?.id) {
    return redirectWithResult(redirectUri, { error: "unauthorized" });
  }

  const code = await createMobileAuthCode(session.user.id, redirectUri);
  return redirectWithResult(redirectUri, { code });
}
