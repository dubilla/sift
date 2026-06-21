import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/mobile/auth/start", () => {
  it("uses forwarded host and protocol when present", async () => {
    const request = new Request(
      "http://0.0.0.0:3003/api/mobile/auth/start?redirect_uri=sift://auth/callback",
      {
        headers: {
          host: "0.0.0.0:3003",
          "x-forwarded-host": "sift.example.com",
          "x-forwarded-proto": "https",
        },
      }
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://sift.example.com/api/auth/signin?callbackUrl=https%3A%2F%2Fsift.example.com%2Fapi%2Fmobile%2Fauth%2Fcallback%3Fredirect_uri%3Dsift%253A%252F%252Fauth%252Fcallback"
    );
  });

  it("rejects unexpected mobile redirect URIs", async () => {
    const request = new Request(
      "https://sift.example.com/api/mobile/auth/start?redirect_uri=evil://callback"
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid redirect URI");
  });
});
