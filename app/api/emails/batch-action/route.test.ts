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
  emails: {
    id: "id",
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
    externalId: "externalId",
  },
  activityLog: {},
  userSettings: { userId: "userId" },
  asanaSettings: { userId: "userId" },
  asanaTasks: {},
  todoistTasks: {},
  todoistSettings: { userId: "userId" },
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
  getValidAccessTokenForProvider: vi.fn(),
}));

vi.mock("@/lib/services/asana", () => ({
  createTask: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/services/todoist", () => ({
  createTask: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  inArray: vi.fn((col, vals) => ({ type: "inArray", col, vals })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getValidAccessToken } from "@/lib/services/token";

global.fetch = vi.fn();

const mockSession = {
  user: { id: "user-123", email: "test@example.com" },
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/emails/batch-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockDbForEmails(emailRows: unknown[]) {
  const mockWhere = vi.fn().mockResolvedValue(emailRows);
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
  vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

  const mockValues = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

  return { mockValues };
}

describe("POST /api/emails/batch-action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await POST(makeRequest({ actions: [] }));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when actions array is empty", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const response = await POST(makeRequest({ actions: [] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("actions array is required");
  });

  it("returns 400 when actions array is missing", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("actions array is required");
  });

  it("returns 400 when action type is invalid", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const response = await POST(
      makeRequest({
        actions: [{ emailId: "e1", action: "delete" }],
      })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Invalid action item");
  });

  it("returns 400 when too many actions", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const actions = Array.from({ length: 101 }, (_, i) => ({
      emailId: `e${i}`,
      action: "archive",
    }));

    const response = await POST(makeRequest({ actions }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Maximum 100 actions per batch");
  });

  it("archives emails using Gmail batchModify", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("gmail-token");

    mockDbForEmails([
      { id: "e1", externalId: "gmail-1", from: "a@b.com", subject: "Test" },
      { id: "e2", externalId: "gmail-2", from: "c@d.com", subject: "Test2" },
    ]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const response = await POST(
      makeRequest({
        actions: [
          { emailId: "e1", action: "archive" },
          { emailId: "e2", action: "archive" },
        ],
      })
    );
    const data = await response.json();

    expect(data.summary.succeeded).toBe(2);
    expect(data.summary.failed).toBe(0);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gmail-token",
        }),
      })
    );
  });

  it("reports failure when email not found", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("gmail-token");

    // DB returns no emails
    mockDbForEmails([]);

    const response = await POST(
      makeRequest({
        actions: [{ emailId: "nonexistent", action: "archive" }],
      })
    );
    const data = await response.json();

    expect(data.summary.succeeded).toBe(0);
    expect(data.summary.failed).toBe(1);
    expect(data.results[0].error).toBe("Email not found or already archived");
  });

  it("reports failure when email has no unsubscribe URL", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("gmail-token");

    mockDbForEmails([
      {
        id: "e1",
        externalId: "gmail-1",
        hasUnsubscribe: false,
        unsubscribeUrl: null,
      },
    ]);

    const response = await POST(
      makeRequest({
        actions: [{ emailId: "e1", action: "unsubscribe" }],
      })
    );
    const data = await response.json();

    expect(data.results[0].success).toBe(false);
    expect(data.results[0].error).toBe("No unsubscribe URL available");
  });

  it("returns requiresMailto for mailto unsubscribe links", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("gmail-token");

    mockDbForEmails([
      {
        id: "e1",
        externalId: "gmail-1",
        hasUnsubscribe: true,
        unsubscribeUrl: "mailto:unsub@example.com",
      },
    ]);

    const response = await POST(
      makeRequest({
        actions: [{ emailId: "e1", action: "unsubscribe" }],
      })
    );
    const data = await response.json();

    expect(data.results[0].success).toBe(false);
    expect(data.results[0].requiresMailto).toBe(true);
    expect(data.results[0].mailtoUrl).toBe("mailto:unsub@example.com");
  });

  it("handles mixed actions in one batch", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("gmail-token");

    mockDbForEmails([
      {
        id: "e1",
        externalId: "gmail-1",
        from: "a@b.com",
        subject: "Archive me",
        hasUnsubscribe: false,
        unsubscribeUrl: null,
      },
      {
        id: "e2",
        externalId: "gmail-2",
        from: "spam@co.com",
        subject: "Unsub me",
        hasUnsubscribe: true,
        unsubscribeUrl: "https://example.com/unsub",
      },
    ]);

    // Mock both the unsubscribe fetch and the Gmail batchModify fetch
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({ ok: true } as Response) // unsubscribe GET
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response); // batchModify

    const response = await POST(
      makeRequest({
        actions: [
          { emailId: "e1", action: "archive" },
          { emailId: "e2", action: "unsubscribe" },
        ],
      })
    );
    const data = await response.json();

    expect(data.summary.succeeded).toBe(2);
    expect(data.summary.failed).toBe(0);
    // Both should have been included in the batchModify call
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("logs activity for successful actions", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("gmail-token");

    const { mockValues } = mockDbForEmails([
      { id: "e1", externalId: "gmail-1", from: "a@b.com", subject: "Test" },
    ]);

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await POST(
      makeRequest({
        actions: [{ emailId: "e1", action: "archive" }],
      })
    );

    // insert is called for activity log
    expect(db.insert).toHaveBeenCalled();
  });
});
