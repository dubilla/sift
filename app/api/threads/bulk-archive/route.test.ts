import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

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

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  emails: {
    id: "id",
    threadId: "threadId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
  },
  activityLog: {
    id: "id",
    userId: "userId",
    action: "action",
    emailId: "emailId",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  inArray: vi.fn((col, vals) => ({ type: "inArray", col, vals })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getValidAccessToken } from "@/lib/services/token";

global.fetch = vi.fn();

describe("/api/threads/bulk-archive", () => {
  const mockSession = {
    user: { id: "user-id", email: "test@example.com" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(global.fetch).mockReset();
  });

  it("should return 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1"] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 when threadIds is not an array", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: "not-an-array" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid thread IDs");
  });

  it("should return 400 when threadIds is empty", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: [] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Invalid thread IDs");
  });

  it("should return 404 when no emails found for threads", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);

    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue([]);

    vi.mocked(db.select).mockImplementation(mockSelect);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1", "thread2"] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("No emails found for the specified threads");
  });

  it("should successfully bulk archive threads", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("valid-token");

    const mockEmails = [
      { id: "internal-1", externalId: "gmail1" },
      { id: "internal-2", externalId: "gmail2" },
      { id: "internal-3", externalId: "gmail3" },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue(mockEmails);
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();
    const mockInsert = vi.fn().mockReturnThis();
    const mockValues = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db.select).mockImplementation(mockSelect);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    vi.mocked(db.update).mockImplementation(mockUpdate);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    vi.mocked(db.insert).mockImplementation(mockInsert);
    mockInsert.mockReturnValue({ values: mockValues });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1", "thread2"] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.archivedCount).toBe(3);
    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer valid-token",
        }),
        body: JSON.stringify({
          ids: ["gmail1", "gmail2", "gmail3"],
          removeLabelIds: ["INBOX"],
        }),
      })
    );
  });

  it("should use getValidAccessToken to handle token refresh", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("refreshed-token");

    const mockEmails = [{ id: "gmail1" }];

    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue(mockEmails);
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();
    const mockInsert = vi.fn().mockReturnThis();
    const mockValues = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db.select).mockImplementation(mockSelect);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    vi.mocked(db.update).mockImplementation(mockUpdate);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    vi.mocked(db.insert).mockImplementation(mockInsert);
    mockInsert.mockReturnValue({ values: mockValues });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1"] }),
    });

    await POST(request);

    expect(getValidAccessToken).toHaveBeenCalledWith("user-id");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer refreshed-token",
        }),
      })
    );
  });

  it("should handle Gmail API failures", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("valid-token");

    const mockEmails = [{ id: "gmail1" }];

    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue(mockEmails);
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();

    vi.mocked(db.select).mockImplementation(mockSelect);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    vi.mocked(db.update).mockImplementation(mockUpdate);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1"] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to bulk archive threads");
  });

  it("should batch requests for large numbers of emails", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("valid-token");

    // Create 2500 emails to test batching (should create 3 batches of 1000, 1000, 500)
    const mockEmails = Array.from({ length: 2500 }, (_, i) => ({
      id: `gmail${i}`,
    }));

    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue(mockEmails);
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();
    const mockInsert = vi.fn().mockReturnThis();
    const mockValues = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db.select).mockImplementation(mockSelect);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    vi.mocked(db.update).mockImplementation(mockUpdate);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    vi.mocked(db.insert).mockImplementation(mockInsert);
    mockInsert.mockReturnValue({ values: mockValues });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1"] }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.archivedCount).toBe(2500);
    // Should make 3 API calls for batches
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("should create activity log entries for all archived emails", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("valid-token");

    const mockEmails = [
      { id: "gmail1" },
      { id: "gmail2" },
    ];

    const mockSelect = vi.fn().mockReturnThis();
    const mockFrom = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockResolvedValue(mockEmails);
    const mockUpdate = vi.fn().mockReturnThis();
    const mockSet = vi.fn().mockReturnThis();
    const mockInsert = vi.fn().mockReturnThis();
    const mockValues = vi.fn().mockResolvedValue(undefined);

    vi.mocked(db.select).mockImplementation(mockSelect);
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });

    vi.mocked(db.update).mockImplementation(mockUpdate);
    mockUpdate.mockReturnValue({ set: mockSet });
    mockSet.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });

    vi.mocked(db.insert).mockImplementation(mockInsert);
    mockInsert.mockReturnValue({ values: mockValues });

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    const request = new NextRequest("http://localhost:3000/api/threads/bulk-archive", {
      method: "POST",
      body: JSON.stringify({ threadIds: ["thread1"] }),
    });

    await POST(request);

    expect(db.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          userId: "user-id",
          action: "archive",
          emailId: "gmail1",
        }),
        expect.objectContaining({
          userId: "user-id",
          action: "archive",
          emailId: "gmail2",
        }),
      ])
    );
  });
});
