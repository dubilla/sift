import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  readerSettings: {
    userId: "userId",
    accessToken: "accessToken",
  },
  emails: {
    id: "id",
    userId: "userId",
    deletedAt: "deletedAt",
  },
  activityLog: {
    id: "id",
    userId: "userId",
    action: "action",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

vi.mock("@/lib/services/reader", () => ({
  saveToReader: vi.fn(),
}));

vi.mock("@/lib/services/gmail", () => ({
  getFullEmail: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessTokenForProvider: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { saveToReader } from "@/lib/services/reader";
import { getFullEmail } from "@/lib/services/gmail";
import { getValidAccessTokenForProvider } from "@/lib/services/token";

function queueSelectResults(...resultBatches: unknown[][]) {
  const queue = [...resultBatches];
  vi.mocked(db.select).mockImplementation(() => {
    const rows = queue.shift() ?? [];
    const limit = vi.fn().mockResolvedValue(rows);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    return { from } as never;
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/reader/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/reader/save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeRequest({ emailId: "e1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when emailId missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 403 when Reader not connected", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    queueSelectResults([]);
    const res = await POST(makeRequest({ emailId: "e1" }));
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe("Readwise Reader not connected");
  });

  it("returns 404 when email is not owned by user", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    // first select: reader settings found
    // second select: email lookup returns no rows (different user / nonexistent)
    queueSelectResults([{ userId: "u1", accessToken: "rwsk_x" }], []);
    const res = await POST(makeRequest({ emailId: "e-other" }));
    expect(res.status).toBe(404);
  });

  it("saves email to Reader with threadId-based URL and sender domain tag", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    queueSelectResults(
      [{ userId: "u1", accessToken: "rwsk_x" }],
      [
        {
          id: "e1",
          userId: "u1",
          externalId: "gmail-msg-1",
          threadId: "gmail-thread-1",
          subject: "Hello",
          from: "Alice <alice@example.com>",
        },
      ]
    );
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue("google-token");
    vi.mocked(getFullEmail).mockResolvedValue({
      bodyHtml: "<p>hi</p>",
      bodyText: "hi",
    } as never);
    vi.mocked(saveToReader).mockResolvedValue({
      id: "doc-1",
      url: "https://read.readwise.io/read/doc-1",
    });
    const insertValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);

    const res = await POST(makeRequest({ emailId: "e1" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.document).toEqual({
      id: "doc-1",
      url: "https://read.readwise.io/read/doc-1",
    });
    expect(saveToReader).toHaveBeenCalledWith(
      "rwsk_x",
      expect.objectContaining({
        url: "https://mail.google.com/mail/u/0/#all/gmail-thread-1",
        html: "<p>hi</p>",
        title: "Hello",
        tags: ["example.com"],
        location: "new",
      })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        action: "save_to_reader",
        emailId: "e1",
      })
    );
  });

  it("falls back to wrapped bodyText when bodyHtml is empty", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    queueSelectResults(
      [{ userId: "u1", accessToken: "rwsk_x" }],
      [
        {
          id: "e1",
          userId: "u1",
          externalId: "gmail-msg-1",
          threadId: "gmail-thread-1",
          subject: "Plain",
          from: "bob@example.com",
        },
      ]
    );
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue("google-token");
    vi.mocked(getFullEmail).mockResolvedValue({
      bodyHtml: "",
      bodyText: "Hello <world>",
    } as never);
    vi.mocked(saveToReader).mockResolvedValue({
      id: "doc-1",
      url: "https://read.readwise.io/read/doc-1",
    });
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    } as never);

    await POST(makeRequest({ emailId: "e1" }));

    const call = vi.mocked(saveToReader).mock.calls[0][1];
    expect(call.html).toBe("<pre>Hello &lt;world&gt;</pre>");
  });

  it("returns 500 when Reader API fails", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    queueSelectResults(
      [{ userId: "u1", accessToken: "rwsk_x" }],
      [
        {
          id: "e1",
          userId: "u1",
          externalId: "gmail-msg-1",
          threadId: "gmail-thread-1",
          subject: "Hello",
          from: "alice@example.com",
        },
      ]
    );
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue("google-token");
    vi.mocked(getFullEmail).mockResolvedValue({
      bodyHtml: "<p>hi</p>",
      bodyText: "hi",
    } as never);
    vi.mocked(saveToReader).mockRejectedValue(new Error("Reader API error: 401"));

    const res = await POST(makeRequest({ emailId: "e1" }));
    expect(res.status).toBe(500);
  });
});
