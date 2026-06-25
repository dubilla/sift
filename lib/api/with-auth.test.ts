import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mobile-auth", () => ({
  getCurrentSession: vi.fn(),
}));

import { withAuth, type AuthedUser } from "./with-auth";
import { getCurrentSession } from "@/lib/mobile-auth";

type Handler = (
  request: Request,
  user: AuthedUser,
  context: unknown
) => Promise<Response>;

describe("withAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without invoking the handler when unauthenticated", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    const handler = vi.fn();

    const wrapped = withAuth(handler);
    const res = await wrapped(new Request("http://localhost"), undefined);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler with the resolved user when authenticated", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "user-123" } });
    const handler = vi.fn(async (_request, user) =>
      NextResponseLike({ ok: true, userId: user.id })
    );

    const wrapped = withAuth(handler);
    const request = new Request("http://localhost");
    const res = await wrapped(request, undefined);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(request);
    expect(handler.mock.calls[0][1]).toEqual({ id: "user-123" });
    expect(await res.json()).toEqual({ ok: true, userId: "user-123" });
  });

  it("passes the Next.js route context (params) through to the handler", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "u1" } });
    const handler = vi.fn<Handler>(async () => new Response("ok"));

    const wrapped = withAuth(handler);
    const context = { params: { id: "abc" } };
    await wrapped(new Request("http://localhost"), context);

    expect(handler.mock.calls[0][2]).toBe(context);
  });

  it("resolves the session from the incoming request (mobile bearer or web)", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "u1" } });
    const handler = vi.fn(async () => new Response("ok"));

    const wrapped = withAuth(handler);
    const request = new Request("http://localhost", {
      headers: { authorization: "Bearer sift_mobile_xyz" },
    });
    await wrapped(request, undefined);

    expect(getCurrentSession).toHaveBeenCalledWith(request);
  });
});

function NextResponseLike(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}
