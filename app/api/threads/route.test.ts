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
    threadId: "threadId",
    subject: "subject",
    from: "from",
    snippet: "snippet",
    date: "date",
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
    id: "id",
  },
  emailTags: {
    emailId: "emailId",
    tagId: "tagId",
    confidence: "confidence",
  },
  tags: {
    id: "id",
    name: "name",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  inArray: vi.fn((col, vals) => ({ type: "inArray", col, vals })),
  notExists: vi.fn((subq) => ({ type: "notExists", subq })),
  max: vi.fn((col) => ({ type: "max", col })),
  count: vi.fn(() => ({ type: "count" })),
  sql: vi.fn((strings, ...values) => ({
    type: "sql",
    strings,
    values,
  })),
}));

import { auth } from "@/auth";
import { db } from "@/db";

describe("GET /api/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns threads grouped by threadId", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockThreads = [
      {
        threadId: "thread-1",
        subject: "Test Subject 1",
        from: "sender1@example.com",
        snippet: "This is snippet 1",
        date: new Date("2024-01-15"),
        messageCount: 3,
      },
      {
        threadId: "thread-2",
        subject: "Test Subject 2",
        from: "sender2@example.com",
        snippet: "This is snippet 2",
        date: new Date("2024-01-14"),
        messageCount: 1,
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockThreads);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toHaveLength(2);
    expect(data.threads[0].threadId).toBe("thread-1");
    expect(data.threads[0].subject).toBe("Test Subject 1");
    expect(data.threads[0].from).toBe("sender1@example.com");
    expect(data.threads[0].snippet).toBe("This is snippet 1");
    expect(data.threads[0].messageCount).toBe(3);
    expect(data.threads[1].threadId).toBe("thread-2");
  });

  it("returns threads with correct message counts", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockThreads = [
      {
        threadId: "thread-multi",
        subject: "Multi-message thread",
        from: "sender@example.com",
        snippet: "Latest message snippet",
        date: new Date("2024-01-15"),
        messageCount: 5,
      },
      {
        threadId: "thread-single",
        subject: "Single message thread",
        from: "sender@example.com",
        snippet: "Only message",
        date: new Date("2024-01-14"),
        messageCount: 1,
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockThreads);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads[0].messageCount).toBe(5);
    expect(data.threads[1].messageCount).toBe(1);
  });

  it("returns empty array when no threads found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockOffset = vi.fn().mockResolvedValue([]);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toEqual([]);
  });

  it("limits results to 100 threads", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // Create 100 mock threads
    const mockThreads = Array.from({ length: 100 }, (_, i) => ({
      threadId: `thread-${i}`,
      subject: `Subject ${i}`,
      from: `sender${i}@example.com`,
      snippet: `Snippet ${i}`,
      date: new Date(`2024-01-${String(15 - Math.floor(i / 30)).padStart(2, "0")}`),
      messageCount: Math.floor(Math.random() * 5) + 1,
    }));

    const mockOffset = vi.fn().mockResolvedValue(mockThreads);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toHaveLength(100);
    expect(mockLimit).toHaveBeenCalledWith(100);
  });

  it("returns threads ordered by latest date descending", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockThreads = [
      {
        threadId: "thread-newest",
        subject: "Newest",
        from: "sender@example.com",
        snippet: "Most recent",
        date: new Date("2024-01-20"),
        messageCount: 1,
      },
      {
        threadId: "thread-middle",
        subject: "Middle",
        from: "sender@example.com",
        snippet: "Middle",
        date: new Date("2024-01-15"),
        messageCount: 2,
      },
      {
        threadId: "thread-oldest",
        subject: "Oldest",
        from: "sender@example.com",
        snippet: "Oldest",
        date: new Date("2024-01-10"),
        messageCount: 1,
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockThreads);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads[0].threadId).toBe("thread-newest");
    expect(data.threads[1].threadId).toBe("thread-middle");
    expect(data.threads[2].threadId).toBe("thread-oldest");
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockOffset = vi.fn().mockRejectedValue(new Error("Database error"));
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const request = new Request("http://localhost/api/threads");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch threads");
  });

  it("applies notExists filter when tag=unclassified", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockThreads = [
      {
        threadId: "thread-unclassified",
        subject: "Unclassified Email",
        from: "sender@example.com",
        snippet: "No tag on this one",
        date: new Date("2024-01-15"),
        messageCount: 1,
        smartTag: null,
        smartTagIcon: null,
        smartTagColor: null,
      },
    ];

    const mockOffset = vi.fn().mockResolvedValue(mockThreads);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    // Mock subquery chain for notExists
    // Call order: db.select() for main query fires first (call 1), then
    // db.select() inside the notExists() argument fires second (call 2)
    const subqueryWhere = vi.fn().mockReturnValue({ type: "subquery" });
    const subqueryFrom = vi.fn(() => ({ where: subqueryWhere }));
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: mockFrom } as any)     // call 1: main threads query
      .mockReturnValueOnce({ from: subqueryFrom } as any); // call 2: notExists subquery

    const { notExists } = await import("drizzle-orm");

    const request = new Request("http://localhost/api/threads?tag=unclassified");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toHaveLength(1);
    expect(data.threads[0].threadId).toBe("thread-unclassified");

    // Verify notExists was called (the unclassified filter was applied)
    expect(notExists).toHaveBeenCalled();
  });

  it("returns empty array for unclassified filter when all emails are tagged", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockOffset = vi.fn().mockResolvedValue([]);
    const mockLimit = vi.fn(() => ({ offset: mockOffset }));
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockGroupBy = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    const subqueryWhere = vi.fn().mockReturnValue({ type: "subquery" });
    const subqueryFrom = vi.fn(() => ({ where: subqueryWhere }));
    vi.mocked(db.select)
      .mockReturnValueOnce({ from: mockFrom } as any)     // call 1: main threads query
      .mockReturnValueOnce({ from: subqueryFrom } as any); // call 2: notExists subquery

    const request = new Request("http://localhost/api/threads?tag=unclassified");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toEqual([]);
    expect(data.hasMore).toBe(false);
  });
});
