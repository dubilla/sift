import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  accounts: {
    userId: "userId",
    access_token: "access_token",
  },
  emails: {
    id: "id",
    threadId: "threadId",
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
  },
  userStats: {
    userId: "userId",
    totalUnarchived: "totalUnarchived",
    updatedAt: "updatedAt",
  },
  activityLog: {
    id: "id",
  },
}));

vi.mock("@/lib/services/gmail", () => ({
  archiveEmail: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { archiveEmail } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";

describe("POST /api/threads/[threadId]/archive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await POST(new Request("http://localhost"), {
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

    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Thread not found or already archived");
  });

  it("returns 400 when no access token found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockRejectedValue(
      new Error("No account found for user")
    );

    const mockThreadEmails = [
      {
        id: "email-1",
        threadId: "thread-123",
        userId: "user123",
        subject: "Test",
        from: "sender@example.com",
        to: "recipient@example.com",
        snippet: "Test snippet",
        date: new Date(),
        archivedAt: null,
        deletedAt: null,
      },
    ];

    const mockWhere = vi.fn().mockResolvedValue(mockThreadEmails);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to archive thread");
  });

  it("archives all emails in thread successfully", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");

    const mockThreadEmails = [
      {
        id: "email-1",
        externalId: "gmail-1",
        threadId: "thread-123",
        userId: "user123",
        subject: "Test 1",
        from: "sender@example.com",
        to: "recipient@example.com",
        snippet: "Snippet 1",
        date: new Date(),
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "email-2",
        externalId: "gmail-2",
        threadId: "thread-123",
        userId: "user123",
        subject: "Test 2",
        from: "sender@example.com",
        to: "recipient@example.com",
        snippet: "Snippet 2",
        date: new Date(),
        archivedAt: null,
        deletedAt: null,
      },
    ];

    let callCount = 0;
    const mockSelectLimit = vi.fn().mockResolvedValue([
      { access_token: "mock-token" },
    ]);
    const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
    const mockSelectWhere2 = vi.fn().mockResolvedValue(mockThreadEmails);
    const mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return { where: mockSelectWhere2 };
      }
      return { where: mockSelectWhere };
    });

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(archiveEmail).mockResolvedValue(true);

    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
    vi.mocked(db.update).mockReturnValue({ set: mockUpdateSet } as any);

    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    // Mock for userStats select
    callCount = 0;
    const mockStatsLimit = vi.fn().mockResolvedValue([
      { totalUnarchived: 10 },
    ]);
    const mockStatsWhere = vi.fn(() => ({ limit: mockStatsLimit }));
    const mockStatsFrom = vi.fn(() => ({ where: mockStatsWhere }));

    vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);
    vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);
    vi.mocked(db.select).mockReturnValueOnce({ from: mockStatsFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.archivedCount).toBe(2);
    expect(archiveEmail).toHaveBeenCalledTimes(2);
    expect(archiveEmail).toHaveBeenCalledWith("mock-token", "gmail-1");
    expect(archiveEmail).toHaveBeenCalledWith("mock-token", "gmail-2");
  });

  it("returns 500 on Gmail API error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockThreadEmails = [
      {
        id: "email-1",
        threadId: "thread-123",
        userId: "user123",
        subject: "Test",
        from: "sender@example.com",
        to: "recipient@example.com",
        snippet: "Snippet",
        date: new Date(),
        archivedAt: null,
        deletedAt: null,
      },
    ];

    let callCount = 0;
    const mockSelectLimit = vi.fn().mockResolvedValue([
      { access_token: "mock-token" },
    ]);
    const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
    const mockSelectWhere2 = vi.fn().mockResolvedValue(mockThreadEmails);
    const mockFrom = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return { where: mockSelectWhere2 };
      }
      return { where: mockSelectWhere };
    });

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(archiveEmail).mockRejectedValue(new Error("Gmail API error"));

    const response = await POST(new Request("http://localhost"), {
      params: { threadId: "thread-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to archive thread");
  });
});
