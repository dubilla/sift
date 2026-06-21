import {
  createMobileAuthCode,
  getCurrentSession,
  isAllowedMobileRedirectUri,
  mobileRedirectUri,
} from "@/lib/mobile-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mobileCallbackResponse(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const callbackUrl = url.toString();
  const escapedCallbackUrl = escapeHtml(callbackUrl);

  return new NextResponse(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Return to Sift</title>
</head>
<body>
  <p>Returning to Sift...</p>
  <p><a href="${escapedCallbackUrl}">Open Sift</a></p>
  <script>
    window.location.replace(${JSON.stringify(callbackUrl)});
  </script>
</body>
</html>`,
    {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = url.searchParams.get("redirect_uri") || mobileRedirectUri();

  if (!isAllowedMobileRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "Invalid redirect URI" }, { status: 400 });
  }

  const session = await getCurrentSession(request);
  if (!session?.user?.id) {
    return mobileCallbackResponse(redirectUri, { error: "unauthorized" });
  }

  const code = await createMobileAuthCode(session.user.id, redirectUri);
  return mobileCallbackResponse(redirectUri, { code });
}
