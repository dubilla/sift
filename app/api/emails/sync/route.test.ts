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
  accounts: {
    userId: "userId",
    access_token: "access_token",
  },
  emails: {
    id: "id",
  },
}));

vi.mock("@/lib/services/gmail", () => ({
  getUnarchivedEmails: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getUnarchivedEmails } from "@/lib/services/gmail";

describe("POST /api/emails/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when no access token found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("No access token found");
  });

  it("fetches emails from Gmail and stores them in database", async () => {
    const mockGmailEmails = [
      {
        id: "gmail-1",
        threadId: "thread-1",
        subject: "Test Subject",
        from: "sender@example.com",
        to: "recipient@example.com",
        snippet: "Test snippet",
        date: new Date("2024-01-15"),
      },
    ];

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([
      { access_token: "mock-access-token" },
    ]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getUnarchivedEmails).mockResolvedValue(mockGmailEmails);

    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn(() => ({
      onConflictDoNothing: mockOnConflictDoNothing,
    }));
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(1);
    expect(data.emails).toHaveLength(1);
    expect(data.emails[0].id).toBe("gmail-1");
    expect(data.emails[0].subject).toBe("Test Subject");
    expect(getUnarchivedEmails).toHaveBeenCalledWith("mock-access-token", 100);
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "gmail-1",
        userId: "user123",
        subject: "Test Subject",
        from: "sender@example.com",
      }),
    ]);
  });

  it("handles multiple emails correctly", async () => {
    const mockGmailEmails = [
      {
        id: "1",
        threadId: "t1",
        subject: "Email 1",
        from: "sender1@example.com",
        to: "user@example.com",
        snippet: "Snippet 1",
        date: new Date("2024-01-15"),
      },
      {
        id: "2",
        threadId: "t2",
        subject: "Email 2",
        from: "sender2@example.com",
        to: "user@example.com",
        snippet: "Snippet 2",
        date: new Date("2024-01-14"),
      },
    ];

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([
      { access_token: "token" },
    ]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getUnarchivedEmails).mockResolvedValue(mockGmailEmails);

    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn(() => ({
      onConflictDoNothing: mockOnConflictDoNothing,
    }));
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const response = await POST();
    const data = await response.json();

    expect(data.synced).toBe(2);
    expect(data.emails).toHaveLength(2);
  });

  it("returns 500 on Gmail API error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([
      { access_token: "token" },
    ]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getUnarchivedEmails).mockRejectedValue(
      new Error("Gmail API error")
    );

    const response = await POST();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to sync emails");
  });
});
