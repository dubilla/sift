import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/mobile-auth";

export interface AuthedUser {
  id: string;
}

/**
 * The single, enforced way to authenticate an API route. Wrap a route handler
 * so the caller is resolved exactly once — accepting BOTH the web session
 * cookie and the mobile `sift_mobile_` bearer token (via `getCurrentSession`).
 *
 * Unauthenticated requests get a 401 before the handler runs; authenticated
 * ones receive the resolved `user` as the second argument, with the original
 * Next.js route context (e.g. `{ params }`) passed through as the third.
 *
 * Using this instead of calling `auth()` or `getCurrentSession()` directly in
 * each route guarantees no endpoint is accidentally web-only or missing its
 * 401 check. A test guard (`with-auth.guard.test.ts`) enforces it.
 *
 *   export const GET = withAuth(async (request, user) => { ... })
 *
 *   export const POST = withAuth(
 *     async (request, user, { params }: { params: { id: string } }) => { ... }
 *   )
 */
export function withAuth<Ctx = unknown>(
  handler: (
    request: Request,
    user: AuthedUser,
    context: Ctx
  ) => Response | Promise<Response>
): (request: Request, context?: Ctx) => Promise<Response> {
  // `context` is optional so callers (and tests) of non-dynamic routes can omit
  // it; Next.js always supplies it for dynamic routes, where the handler reads
  // `params` from it.
  return async (request, context) => {
    const session = await getCurrentSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handler(request, { id: session.user.id }, context as Ctx);
  };
}
