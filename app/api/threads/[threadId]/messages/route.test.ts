import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  emails: {
    id: "id",
    externalId: "externalId",
    threadId: "threadId",
    userId: "userId",
    date: "date",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
  },
}));

vi.mock("@/lib/services/gmail", () => ({
  getFullEmail: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  asc: vi.fn((col) => ({ type: "asc", col })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getFullEmail } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";

describe("GET /api/threads/[threadId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when thread not found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockOrderBy = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Thread not found");
  });

  it("fetches thread messages using externalId for Gmail API", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");

    const mockThreadEmails = [
      {
        id: "uuid-1",
        externalId: "gmail-msg-1",
        date: new Date("2024-01-01"),
        archivedAt: null,
      },
      {
        id: "uuid-2",
        externalId: "gmail-msg-2",
        date: new Date("2024-01-02"),
        archivedAt: new Date("2024-01-03"),
      },
    ];

    const mockOrderBy = vi.fn().mockResolvedValue(mockThreadEmails);
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    vi.mocked(getFullEmail)
      .mockResolvedValueOnce({
        id: "gmail-msg-1",
        threadId: "thread-123",
        subject: "Test 1",
        from: "sender@example.com",
        to: "recipient@example.com",
        date: new Date("2024-01-01"),
        snippet: "Snippet 1",
        bodyHtml: "<p>HTML 1</p>",
        bodyText: "Text 1",
      })
      .mockResolvedValueOnce({
        id: "gmail-msg-2",
        threadId: "thread-123",
        subject: "Re: Test 1",
        from: "recipient@example.com",
        to: "sender@example.com",
        date: new Date("2024-01-02"),
        snippet: "Snippet 2",
        bodyHtml: "<p>HTML 2</p>",
        bodyText: "Text 2",
      });

    const response = await GET(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messages).toHaveLength(2);

    // Verify Gmail API was called with externalId, not internal UUID
    expect(getFullEmail).toHaveBeenCalledWith("mock-token", "gmail-msg-1");
    expect(getFullEmail).toHaveBeenCalledWith("mock-token", "gmail-msg-2");

    // Verify response includes internal UUID for client-side operations
    expect(data.messages[0].id).toBe("uuid-1");
    expect(data.messages[1].id).toBe("uuid-2");

    // Verify archivedAt is included
    expect(data.messages[0].archivedAt).toBeNull();
    expect(data.messages[1].archivedAt).toBe("2024-01-03T00:00:00.000Z");
  });

  it("returns 500 on Gmail API error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");

    const mockThreadEmails = [
      {
        id: "uuid-1",
        externalId: "gmail-msg-1",
        date: new Date("2024-01-01"),
        archivedAt: null,
      },
    ];

    const mockOrderBy = vi.fn().mockResolvedValue(mockThreadEmails);
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getFullEmail).mockRejectedValue(new Error("Gmail API error"));

    const response = await GET(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch thread messages");
  });

  it("returns 500 when access token cannot be retrieved", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockRejectedValue(
      new Error("No account found for user")
    );

    const mockThreadEmails = [
      {
        id: "uuid-1",
        externalId: "gmail-msg-1",
        date: new Date("2024-01-01"),
        archivedAt: null,
      },
    ];

    const mockOrderBy = vi.fn().mockResolvedValue(mockThreadEmails);
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch thread messages");
  });
});
