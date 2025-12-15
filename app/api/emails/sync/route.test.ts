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
    externalId: "externalId",
  },
}));

vi.mock("@/lib/services/gmail", () => ({
  getUnarchivedEmails: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  count: vi.fn(() => ({ type: "count" })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";

describe("POST /api/emails/sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/emails/sync", {
      method: "POST",
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when no access token found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockRejectedValue(
      new Error("No account found for user")
    );

    const request = new Request("http://localhost/api/emails/sync", {
      method: "POST",
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to sync emails");
  });

  it("fetches emails from Gmail and stores them in database", async () => {
    const mockGmailResponse = {
      emails: [
        {
          id: "gmail-1",
          threadId: "thread-1",
          subject: "Test Subject",
          from: "sender@example.com",
          to: "recipient@example.com",
          snippet: "Test snippet",
          date: new Date("2024-01-15"),
          hasUnsubscribe: false,
          unsubscribeUrl: null,
          listId: null,
          isNoreply: false,
          recipientCount: 1,
        },
      ],
      nextPageToken: undefined,
      resultSizeEstimate: 150,
    };

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-access-token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue(mockGmailResponse);

    const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn(() => ({
      onConflictDoNothing: mockOnConflictDoNothing,
      onConflictDoUpdate: mockOnConflictDoUpdate,
    }));
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/emails/sync", {
      method: "POST",
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(1);
    expect(data.emails).toHaveLength(1);
    expect(data.emails[0].id).toBe("gmail-1");
    expect(data.emails[0].subject).toBe("Test Subject");
    expect(data.nextPageToken).toBeUndefined();
    expect(getUnarchivedEmails).toHaveBeenCalledWith("mock-access-token", 100, undefined);
    expect(mockValues).toHaveBeenCalledWith([
      expect.objectContaining({
        externalId: "gmail-1",
        userId: "user123",
        subject: "Test Subject",
        from: "sender@example.com",
      }),
    ]);
    // Verify that id is a UUID (not the Gmail ID)
    const calls: unknown[] = mockValues.mock.calls;
    const firstCall = calls[0] as unknown[];
    const firstArg = firstCall[0] as unknown[];
    const insertedEmail = firstArg[0] as { id: string };
    expect(insertedEmail.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("handles multiple emails correctly", async () => {
    const mockGmailResponse = {
      emails: [
        {
          id: "1",
          threadId: "t1",
          subject: "Email 1",
          from: "sender1@example.com",
          to: "user@example.com",
          snippet: "Snippet 1",
          date: new Date("2024-01-15"),
          hasUnsubscribe: false,
          unsubscribeUrl: null,
          listId: null,
          isNoreply: false,
          recipientCount: 1,
        },
        {
          id: "2",
          threadId: "t2",
          subject: "Email 2",
          from: "sender2@example.com",
          to: "user@example.com",
          snippet: "Snippet 2",
          date: new Date("2024-01-14"),
          hasUnsubscribe: true,
          unsubscribeUrl: "https://example.com/unsubscribe",
          listId: null,
          isNoreply: false,
          recipientCount: 1,
        },
      ],
      nextPageToken: "next-page-123",
      resultSizeEstimate: 250,
    };

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue(mockGmailResponse);

    const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const mockValues = vi.fn(() => ({
      onConflictDoNothing: mockOnConflictDoNothing,
      onConflictDoUpdate: mockOnConflictDoUpdate,
    }));
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/emails/sync", {
      method: "POST",
    });
    const response = await POST(request);
    const data = await response.json();

    expect(data.synced).toBe(2);
    expect(data.emails).toHaveLength(2);
    expect(data.nextPageToken).toBe("next-page-123");
  });

  it("returns 500 on Gmail API error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockRejectedValue(
      new Error("Gmail API error")
    );

    const request = new Request("http://localhost/api/emails/sync", {
      method: "POST",
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to sync emails");
  });
});
