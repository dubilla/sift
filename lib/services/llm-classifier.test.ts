import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { llmClassify } from "./llm-classifier";

const email = {
  id: "email-1",
  subject: "Weekly digest",
  from: "news@example.com",
  to: "me@example.com",
  snippet: "This week's highlights",
  hasUnsubscribe: true,
  listId: "list.example.com",
  isNoreply: true,
  recipientCount: 1,
};

const ok = () =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: '{"tag":"archivable","confidence":0.9,"reason":"newsletter"}' } }],
    }),
    { status: 200 }
  );

const error = (status: number, code: string, headers: Record<string, string> = { "retry-after-ms": "1" }) =>
  new Response(JSON.stringify({ error: { code } }), { status, headers });

describe("llmClassify (openai)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries rate limits and returns the eventual classification", async () => {
    fetchMock
      .mockResolvedValueOnce(error(429, "rate_limit_exceeded"))
      .mockResolvedValueOnce(error(429, "rate_limit_exceeded"))
      .mockResolvedValueOnce(ok());

    const result = await llmClassify(email, "key");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ tag: "archivable", confidence: 0.9 });
  });

  it("does not retry when credits are exhausted, and names the cause", async () => {
    fetchMock.mockImplementation(async () => error(429, "insufficient_quota"));

    const result = await llmClassify(email, "key");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.tag).toBeNull();
    expect(result.reason).toContain("insufficient_quota");
  });

  it("gives up after the retry limit", async () => {
    fetchMock.mockImplementation(async () => error(503, "server_error"));

    const result = await llmClassify(email, "key");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.tag).toBeNull();
  });

  it("does not retry other client errors", async () => {
    fetchMock.mockImplementation(async () => error(400, "invalid_request_error"));

    const result = await llmClassify(email, "key");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.tag).toBeNull();
  });

  it("retries network errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok());

    const result = await llmClassify(email, "key");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.tag).toBe("archivable");
  });

  it("honors retry-after in seconds, capped at 10s", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(error(429, "rate_limit_exceeded", { "retry-after": "60" }))
      .mockResolvedValueOnce(ok());

    const pending = llmClassify(email, "key");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    vi.useRealTimers();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.tag).toBe("archivable");
  });
});
