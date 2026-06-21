import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import {
  createMobileAuthCode,
  getCurrentSession,
} from "@/lib/mobile-auth";

vi.mock("@/lib/mobile-auth", () => ({
  createMobileAuthCode: vi.fn(),
  getCurrentSession: vi.fn(),
  isAllowedMobileRedirectUri: vi.fn((redirectUri: string) => {
    return redirectUri === "sift://auth/callback";
  }),
  mobileRedirectUri: vi.fn(() => "sift://auth/callback"),
}));

describe("GET /api/mobile/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a mobile handoff page with an auth code", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue({
      user: { id: "user-123" },
    });
    vi.mocked(createMobileAuthCode).mockResolvedValue("mobile-code");

    const request = new Request(
      "https://sift.example.com/api/mobile/auth/callback?redirect_uri=sift://auth/callback"
    );

    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toContain("sift://auth/callback?code=mobile-code");
    expect(body).toContain("window.location.replace");
    expect(createMobileAuthCode).toHaveBeenCalledWith(
      "user-123",
      "sift://auth/callback"
    );
  });

  it("returns a mobile handoff page with an unauthorized error", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const request = new Request(
      "https://sift.example.com/api/mobile/auth/callback?redirect_uri=sift://auth/callback"
    );

    const response = await GET(request);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("sift://auth/callback?error=unauthorized");
    expect(createMobileAuthCode).not.toHaveBeenCalled();
  });

  it("rejects unexpected mobile redirect URIs", async () => {
    const request = new Request(
      "https://sift.example.com/api/mobile/auth/callback?redirect_uri=evil://callback"
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid redirect URI");
  });
});
