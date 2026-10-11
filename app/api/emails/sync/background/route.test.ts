import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  emails: { id: "id", externalId: "externalId", userId: "userId", archivedAt: "archivedAt", deletedAt: "deletedAt" },
  userStats: { userId: "userId" },
}));

vi.mock("@/lib/services/gmail", () => ({
  getUnarchivedEmails: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/lib/services/classify-batch", () => ({
  classifyEmailsBatch: vi.fn(),
  classifyUntaggedBacklog: vi.fn(),
}));

vi.mock("@vercel/functions", () => ({
  waitUntil: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  count: vi.fn(() => "count_fn"),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";
import { classifyEmailsBatch, classifyUntaggedBacklog } from "@/lib/services/classify-batch";
import { waitUntil } from "@vercel/functions";

const mockSession = { user: { id: "user-123" } };

const mockGmailEmail = {
  id: "gmail-1",
  threadId: "thread-1",
  subject: "Order confirmation",
  from: "noreply@shop.com",
  to: "me@example.com",
  snippet: "Your order has been confirmed",
  date: new Date("2024-01-15"),
  hasUnsubscribe: false,
  unsubscribeUrl: null,
  listId: null,
  isNoreply: true,
  recipientCount: 1,
};

// The route calls db in this order:
// 1. db.select().from(userStats).where() -> stats
// 2. db.insert(emails).values().onConflictDoNothing().returning() -> inserted IDs
// 3. waitUntil(classifyEmailsBatch(insertedIds), then classifyUntaggedBacklog on the last page)
// 4. db.select({count}).from(emails).where() -> count
// 5. db.update(userStats).set().where() -> update lastSyncedAt (if complete)

function setupDbMocks({ insertedIds = ["email-1"] }: { insertedIds?: string[] } = {}) {
  let selectCallCount = 0;

  vi.mocked(db.select).mockImplementation(() => {
    selectCallCount++;

    if (selectCallCount === 1) {
      // userStats query: .from(userStats).where(...)
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ lastSyncedAt: null, totalUnarchivedCount: 100 }]),
        })),
      } as any;
    }

    // count query: .from(emails).where(...)
    return {
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count: 50 }]),
      })),
    } as any;
  });

  // onConflictDoNothing skips emails that already exist, so .returning() only
  // yields the rows actually inserted.
  const mockReturning = vi.fn().mockResolvedValue(insertedIds.map((id) => ({ id })));
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
  const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
  vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
  vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

  return { mockValues, mockOnConflictDoNothing };
}

function postSync() {
  return POST(
    new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    })
  );
}

describe("POST /api/emails/sync/background", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("syncs emails and classifies the newly inserted ones", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: undefined,
      resultSizeEstimate: 1,
    } as any);
    vi.mocked(classifyEmailsBatch).mockResolvedValue({ classified: 1, total: 1 });

    setupDbMocks({ insertedIds: ["email-1"] });

    const response = await postSync();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(1);
    expect(data.isComplete).toBe(true);
    expect(classifyEmailsBatch).toHaveBeenCalledWith("user-123", ["email-1"]);
    expect(waitUntil).toHaveBeenCalledTimes(1);
  });

  it("passes only the ids returned by the insert to classifyEmailsBatch", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail, { ...mockGmailEmail, id: "gmail-2" }],
      nextPageToken: undefined,
      resultSizeEstimate: 2,
    } as any);
    vi.mocked(classifyEmailsBatch).mockResolvedValue({ classified: 1, total: 1 });

    // gmail-1 already exists in the DB; only gmail-2 is inserted
    setupDbMocks({ insertedIds: ["email-2"] });

    const response = await postSync();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(2);
    expect(classifyEmailsBatch).toHaveBeenCalledWith("user-123", ["email-2"]);
  });

  it("still completes the sync when classification throws", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: undefined,
      resultSizeEstimate: 1,
    } as any);
    vi.mocked(classifyEmailsBatch).mockRejectedValue(new Error("DB down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    setupDbMocks();

    const response = await postSync();
    const data = await response.json();
    await vi.mocked(waitUntil).mock.calls[0][0];

    expect(response.status).toBe(200);
    expect(data.synced).toBe(1);
    expect(data.isComplete).toBe(true);
    expect(db.update).toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("Background sync classification failed:", expect.any(Error));
    consoleError.mockRestore();
  });

  it("catches up on the untagged backlog after new emails on the last page", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: undefined,
      resultSizeEstimate: 1,
    } as any);
    const order: string[] = [];
    vi.mocked(classifyEmailsBatch).mockImplementation(async () => {
      order.push("inserted");
      return { classified: 1, total: 1 };
    });
    vi.mocked(classifyUntaggedBacklog).mockImplementation(async () => {
      order.push("backlog");
      return { classified: 0, total: 0 };
    });

    setupDbMocks({ insertedIds: ["email-1"] });

    await postSync();
    await vi.mocked(waitUntil).mock.calls[0][0];

    expect(order).toEqual(["inserted", "backlog"]);
    expect(classifyUntaggedBacklog).toHaveBeenCalledWith("user-123");
  });

  it("runs backlog catch-up on a no-op sync", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [],
      nextPageToken: undefined,
      resultSizeEstimate: 0,
    } as any);
    vi.mocked(classifyEmailsBatch).mockResolvedValue({ classified: 0, total: 0 });
    vi.mocked(classifyUntaggedBacklog).mockResolvedValue({ classified: 0, total: 0 });

    setupDbMocks({ insertedIds: [] });

    const response = await postSync();
    const data = await response.json();
    await vi.mocked(waitUntil).mock.calls[0][0];

    expect(data.synced).toBe(0);
    expect(classifyUntaggedBacklog).toHaveBeenCalledWith("user-123");
  });

  it("skips classification on a mid-sync page with nothing new", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: "next-page",
      resultSizeEstimate: 1,
    } as any);

    setupDbMocks({ insertedIds: [] });

    await postSync();

    expect(waitUntil).not.toHaveBeenCalled();
    expect(classifyUntaggedBacklog).not.toHaveBeenCalled();
  });
});
