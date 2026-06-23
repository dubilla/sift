import { NextResponse } from "next/server";
import type { ReauthRequiredError } from "@/lib/services/token";

/**
 * If `error` signals that a provider grant is dead (see {@link ReauthRequiredError}),
 * returns a 401 response carrying a machine-readable re-auth signal the client
 * (web or mobile) can act on. Otherwise returns null so the caller can fall
 * through to its generic error handling.
 *
 * Detection is by the stable `code` marker rather than `instanceof` so it stays
 * correct when the token module is mocked in tests or duplicated by bundling.
 */
export function reauthErrorResponse(error: unknown): NextResponse | null {
  if (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "REAUTH_REQUIRED"
  ) {
    const e = error as ReauthRequiredError;
    return NextResponse.json(
      {
        error: e.message,
        code: "REAUTH_REQUIRED",
        provider: e.provider,
      },
      { status: 401 }
    );
  }
  return null;
}
