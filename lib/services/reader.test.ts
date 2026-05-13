import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveToReader, validateToken } from "./reader";

describe("reader service", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveToReader", () => {
    it("posts to /api/v3/save/ with Token auth and returns id+url", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "doc-123",
          url: "https://read.readwise.io/read/doc-123",
        }),
      } as Response);

      const result = await saveToReader("rwsk_abc", {
        url: "https://example.com/article",
        html: "<p>hi</p>",
        title: "Hi",
        tags: ["foo"],
        location: "new",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://readwise.io/api/v3/save/",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Token rwsk_abc",
            "Content-Type": "application/json",
          }),
        })
      );

      const body = JSON.parse(
        (vi.mocked(fetch).mock.calls[0][1]?.body as string) || "{}"
      );
      expect(body).toEqual({
        url: "https://example.com/article",
        html: "<p>hi</p>",
        title: "Hi",
        tags: ["foo"],
        location: "new",
      });

      expect(result).toEqual({
        id: "doc-123",
        url: "https://read.readwise.io/read/doc-123",
      });
    });

    it("throws with status code when Reader returns non-2xx", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as Response);

      await expect(
        saveToReader("bad", { url: "https://example.com/x" })
      ).rejects.toThrow("Reader API error: 401");
    });
  });

  describe("validateToken", () => {
    it("returns true when /auth/ responds 2xx", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
      await expect(validateToken("rwsk_abc")).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        "https://readwise.io/api/v2/auth/",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Token rwsk_abc",
          }),
        })
      );
    });

    it("returns false when /auth/ responds non-2xx", async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
      await expect(validateToken("bad")).resolves.toBe(false);
    });

    it("returns false when fetch throws", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("network"));
      await expect(validateToken("bad")).resolves.toBe(false);
    });
  });
});
