import {
  isAllowedMobileRedirectUri,
  mobileRedirectUri,
  requestOrigin,
} from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri") || mobileRedirectUri();

  if (!isAllowedMobileRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "Invalid redirect URI" }, { status: 400 });
  }

  const origin = requestOrigin(request);
  const callbackUrl = new URL("/api/mobile/auth/callback", origin);
  callbackUrl.searchParams.set("redirect_uri", redirectUri);

  const signInUrl = new URL("/api/auth/signin", origin);
  signInUrl.searchParams.set("callbackUrl", callbackUrl.toString());

  return NextResponse.redirect(signInUrl);
}
