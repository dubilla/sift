import { afterEach, describe, expect, it, vi } from "vitest";
import { isAllowedMobileRedirectUri } from "./mobile-auth";

describe("isAllowedMobileRedirectUri", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows the configured mobile app redirect", () => {
    expect(isAllowedMobileRedirectUri("sift://auth/callback")).toBe(true);
  });

  it("allows the configured override instead of the default", () => {
    vi.stubEnv("MOBILE_AUTH_REDIRECT_URI", "siftdev://auth/callback");
    expect(isAllowedMobileRedirectUri("siftdev://auth/callback")).toBe(true);
    expect(isAllowedMobileRedirectUri("sift://auth/callback")).toBe(false);
  });

  it.each([
    "http://127.0.0.1:1024/callback",
    "http://127.0.0.1:53682/callback",
    "http://127.0.0.1:65535/callback",
  ])("allows the CLI loopback redirect %s", (uri) => {
    expect(isAllowedMobileRedirectUri(uri)).toBe(true);
  });

  it.each([
    // non-loopback hosts
    "http://evil.com:53682/callback",
    "http://127.0.0.1.evil.com:53682/callback",
    "http://127.0.0.2:53682/callback",
    "http://0.0.0.0:53682/callback",
    "http://10.0.0.1:53682/callback",
    "http://[::1]:53682/callback",
    "http://localhost:53682/callback",
    "http://127.0.0.1@evil.com:53682/callback",
    "http://user@127.0.0.1:53682/callback",
    "http://2130706433:53682/callback",
    // wrong scheme
    "https://127.0.0.1:53682/callback",
    "sift://127.0.0.1:53682/callback",
    // ports: missing, privileged, out of range, leading zero
    "http://127.0.0.1/callback",
    "http://127.0.0.1:80/callback",
    "http://127.0.0.1:1023/callback",
    "http://127.0.0.1:65536/callback",
    "http://127.0.0.1:099999/callback",
    "http://127.0.0.1:01024/callback",
    // path / query / fragment must be exact
    "http://127.0.0.1:53682/",
    "http://127.0.0.1:53682/callback/",
    "http://127.0.0.1:53682/callback/../evil",
    "http://127.0.0.1:53682/callback?next=https://evil.com",
    "http://127.0.0.1:53682/callback#x",
    " http://127.0.0.1:53682/callback",
    "http://127.0.0.1:53682/callback\n",
    "",
    "evil://callback",
  ])("rejects %j", (uri) => {
    expect(isAllowedMobileRedirectUri(uri)).toBe(false);
  });
});
