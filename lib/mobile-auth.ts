import { createHash, randomBytes, timingSafeEqual } from "crypto";

const MOBILE_TOKEN_PREFIX = "sift_mobile_";
const MOBILE_CODE_TTL_MS = 5 * 60 * 1000;
const MOBILE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_REDIRECT_URI = "sift://auth/callback";

export interface CurrentUser {
  id: string;
}

export interface CurrentSession {
  user: CurrentUser;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function mobileRedirectUri(): string {
  return process.env.MOBILE_AUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI;
}

export function isAllowedMobileRedirectUri(redirectUri: string): boolean {
  return redirectUri === mobileRedirectUri();
}

export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");

  if (host) {
    return `${forwardedProto || inferProtocol(host)}://${host}`;
  }

  const configuredUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
  if (configuredUrl) {
    return new URL(configuredUrl).origin;
  }

  return new URL(request.url).origin;
}

function inferProtocol(host: string): "http" | "https" {
  return host.startsWith("localhost") || host.startsWith("127.0.0.1")
    ? "http"
    : "https";
}

export function mobileAuthCodeExpiresAt(): Date {
  return new Date(Date.now() + MOBILE_CODE_TTL_MS);
}

export function mobileSessionExpiresAt(): Date {
  return new Date(Date.now() + MOBILE_SESSION_TTL_MS);
}

export async function createMobileAuthCode(
  userId: string,
  redirectUri: string
): Promise<string> {
  const { db } = await import("@/db");
  const { mobileAuthCodes } = await import("@/db/schema");
  const code = randomToken();

  await db.insert(mobileAuthCodes).values({
    userId,
    codeHash: sha256(code),
    redirectUri,
    expiresAt: mobileAuthCodeExpiresAt(),
  });

  return code;
}

export async function exchangeMobileAuthCode({
  code,
  redirectUri,
  deviceName,
}: {
  code: string;
  redirectUri: string;
  deviceName?: string;
}): Promise<{
  token: string;
  expiresAt: Date;
  user: { id: string; name: string | null; email: string; image: string | null };
} | null> {
  const { db } = await import("@/db");
  const { mobileAuthCodes, mobileSessions, users } = await import("@/db/schema");
  const { and, eq, gt, isNull } = await import("drizzle-orm");
  const now = new Date();
  const codeHash = sha256(code);

  const claimedCodes = await db
    .update(mobileAuthCodes)
    .set({ usedAt: now })
    .where(
      and(
        eq(mobileAuthCodes.codeHash, codeHash),
        eq(mobileAuthCodes.redirectUri, redirectUri),
        gt(mobileAuthCodes.expiresAt, now),
        isNull(mobileAuthCodes.usedAt)
      )
    )
    .returning({
      userId: mobileAuthCodes.userId,
    });

  const claimedCode = claimedCodes[0];
  if (!claimedCode) return null;

  const userRows = await db
    .select({
      email: users.email,
      name: users.name,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, claimedCode.userId))
    .limit(1);

  const user = userRows[0];
  if (!user) return null;

  const token = `${MOBILE_TOKEN_PREFIX}${randomToken(48)}`;
  const expiresAt = mobileSessionExpiresAt();

  await db.insert(mobileSessions).values({
    userId: claimedCode.userId,
    tokenHash: sha256(token),
    deviceName,
    expiresAt,
  });

  return {
    token,
    expiresAt,
    user: {
      id: claimedCode.userId,
      name: user.name,
      email: user.email,
      image: user.image,
    },
  };
}

export async function revokeMobileToken(token: string): Promise<void> {
  const { db } = await import("@/db");
  const { mobileSessions } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  await db
    .update(mobileSessions)
    .set({ revokedAt: new Date() })
    .where(eq(mobileSessions.tokenHash, sha256(token)));
}

export function getBearerToken(request: Request | undefined): string | null {
  const authorization = request?.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice("Bearer ".length).trim();
  return token.startsWith(MOBILE_TOKEN_PREFIX) ? token : null;
}

export async function getSessionFromMobileToken(
  request: Request | undefined
): Promise<CurrentSession | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const { db } = await import("@/db");
  const { mobileSessions } = await import("@/db/schema");
  const { and, eq, gt, isNull } = await import("drizzle-orm");
  const tokenHash = sha256(token);
  const rows = await db
    .select({
      id: mobileSessions.id,
      userId: mobileSessions.userId,
      tokenHash: mobileSessions.tokenHash,
    })
    .from(mobileSessions)
    .where(
      and(
        eq(mobileSessions.tokenHash, tokenHash),
        gt(mobileSessions.expiresAt, new Date()),
        isNull(mobileSessions.revokedAt)
      )
    )
    .limit(1);

  const mobileSession = rows[0];
  if (!mobileSession || !safeEqual(mobileSession.tokenHash, tokenHash)) {
    return null;
  }

  await db
    .update(mobileSessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(mobileSessions.id, mobileSession.id));

  return { user: { id: mobileSession.userId } };
}

export async function getCurrentSession(
  request?: Request
): Promise<CurrentSession | null> {
  const mobileSession = await getSessionFromMobileToken(request);
  if (mobileSession) return mobileSession;

  const { auth } = await import("@/auth");
  const webSession = await auth();
  if (!webSession?.user?.id) return null;

  return { user: { id: webSession.user.id } };
}
