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
  emails: { externalId: "externalId", userId: "userId", archivedAt: "archivedAt", deletedAt: "deletedAt" },
  emailTags: {},
  tags: {},
  userStats: { userId: "userId" },
}));

vi.mock("@/lib/services/gmail", () => ({
  getUnarchivedEmails: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("@/lib/services/classifier", () => ({
  classifyEmail: vi.fn(),
  CONFIDENCE_THRESHOLD: 0.7,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  count: vi.fn(() => "count_fn"),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings, values })),
    { raw: vi.fn((s: string) => s) }
  ),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getUnarchivedEmails } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";
import { classifyEmail } from "@/lib/services/classifier";

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
// 2. db.insert(emails).values().onConflictDoNothing() -> insert emails
// 3. db.select().from(tags) -> all tags (only if OPENAI_API_KEY set and emails > 0)
// 4. db.insert(emailTags).values().onConflictDoNothing() -> per classified email
// 5. db.select({count}).from(emails).where() -> count
// 6. db.update(userStats).set().where() -> update lastSyncedAt (if complete)

function setupDbMocks({ hasTags = true }: { hasTags?: boolean } = {}) {
  let selectCallCount = 0;

  vi.mocked(db.select).mockImplementation((...args: any[]) => {
    selectCallCount++;

    if (selectCallCount === 1) {
      // userStats query: .from(userStats).where(...)
      return {
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ lastSyncedAt: null, totalUnarchivedCount: 100 }]),
        })),
      } as any;
    }

    if (selectCallCount === 2 && hasTags) {
      // tags query: .from(tags) -> resolves directly
      return {
        from: vi.fn().mockResolvedValue([
          { id: "tag-arch", name: "archivable", displayName: "Archive" },
        ]),
      } as any;
    }

    // count query or other: .from(emails).where(...)
    return {
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([{ count: 50 }]),
      })),
    } as any;
  });

  const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
  vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn(() => ({ where: mockUpdateWhere }));
  vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

  return { mockValues, mockOnConflictDoNothing };
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

  it("syncs emails and auto-classifies them", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: undefined,
      resultSizeEstimate: 1,
    } as any);

    vi.mocked(classifyEmail).mockResolvedValue({
      tag: "archivable",
      confidence: 0.85,
      source: "rule",
      reason: "Transactional notification",
    });

    setupDbMocks();

    const request = new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.synced).toBe(1);
    expect(data.classified).toBe(1);
    expect(data.isComplete).toBe(true);
    expect(classifyEmail).toHaveBeenCalledTimes(1);
  });

  it("skips classification when OPENAI_API_KEY is not set", async () => {
    delete process.env.OPENAI_API_KEY;

    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: undefined,
      resultSizeEstimate: 1,
    } as any);

    setupDbMocks({ hasTags: false });

    const request = new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.synced).toBe(1);
    expect(data.classified).toBe(0);
    expect(classifyEmail).not.toHaveBeenCalled();
  });

  it("does not count low-confidence classifications", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail],
      nextPageToken: undefined,
      resultSizeEstimate: 1,
    } as any);

    vi.mocked(classifyEmail).mockResolvedValue({
      tag: "archivable",
      confidence: 0.5, // Below threshold of 0.7
      source: "llm",
      reason: "Not sure",
    });

    setupDbMocks();

    const request = new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.synced).toBe(1);
    expect(data.classified).toBe(0);
  });

  it("continues syncing when classification throws", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");

    const email2 = { ...mockGmailEmail, id: "gmail-2" };
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [mockGmailEmail, email2],
      nextPageToken: undefined,
      resultSizeEstimate: 2,
    } as any);

    vi.mocked(classifyEmail)
      .mockRejectedValueOnce(new Error("API timeout"))
      .mockResolvedValueOnce({
        tag: "archivable",
        confidence: 0.85,
        source: "rule",
        reason: "Test",
      });

    setupDbMocks();

    const request = new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.synced).toBe(2);
    expect(data.classified).toBe(1); // One succeeded, one failed
  });

  it("returns classified: 0 when no emails synced", async () => {
    vi.mocked(auth).mockResolvedValue(mockSession as any);
    vi.mocked(getValidAccessToken).mockResolvedValue("token");
    vi.mocked(getUnarchivedEmails).mockResolvedValue({
      emails: [],
      nextPageToken: undefined,
      resultSizeEstimate: 0,
    } as any);

    setupDbMocks({ hasTags: false });

    const request = new Request("http://localhost/api/emails/sync/background", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.synced).toBe(0);
    expect(data.classified).toBe(0);
    expect(classifyEmail).not.toHaveBeenCalled();
  });
});
