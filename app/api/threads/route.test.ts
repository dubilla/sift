import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { GET } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { auth } from "@/auth";
import { db } from "@/db";

const dialect = new PgDialect();

// Compile the SQL passed to db.execute so tests can assert on the real query
function executedQuery() {
  const query = vi.mocked(db.execute).mock.calls[0][0] as SQL;
  return dialect.sqlToQuery(query);
}

function signIn(userId = "user123") {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as any);
}

describe("GET /api/threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(new Request("http://localhost/api/threads"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("returns threads from the query", async () => {
    signIn();
    const mockThreads = [
      {
        threadId: "thread-1",
        subject: "Test Subject 1",
        from: "sender1@example.com",
        snippet: "This is snippet 1",
        date: "2024-01-15T00:00:00.000Z",
        messageCount: 3,
        smartTag: "archivable",
      },
      {
        threadId: "thread-2",
        subject: "Test Subject 2",
        from: "sender2@example.com",
        snippet: "This is snippet 2",
        date: "2024-01-14T00:00:00.000Z",
        messageCount: 1,
        smartTag: null,
      },
    ];
    vi.mocked(db.execute).mockResolvedValue(mockThreads as any);

    const response = await GET(new Request("http://localhost/api/threads"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toEqual(mockThreads);
    expect(data.page).toBe(1);
    expect(data.limit).toBe(100);
    expect(data.hasMore).toBe(false);
  });

  it("scopes the query to the current user", async () => {
    signIn("user-abc");
    vi.mocked(db.execute).mockResolvedValue([] as any);

    await GET(new Request("http://localhost/api/threads"));

    expect(executedQuery().params).toContain("user-abc");
  });

  it("paginates with limit and offset from the query string", async () => {
    signIn();
    vi.mocked(db.execute).mockResolvedValue([] as any);

    await GET(new Request("http://localhost/api/threads?page=3&limit=20"));

    const { sql, params } = executedQuery();
    expect(sql).toMatch(/LIMIT \$\d+\s+OFFSET \$\d+/);
    expect(params).toEqual(expect.arrayContaining([20, 40]));
  });

  it("reports hasMore when a full page is returned", async () => {
    signIn();
    const fullPage = Array.from({ length: 2 }, (_, i) => ({ threadId: `t-${i}` }));
    vi.mocked(db.execute).mockResolvedValue(fullPage as any);

    const response = await GET(new Request("http://localhost/api/threads?limit=2"));
    const data = await response.json();

    expect(data.hasMore).toBe(true);
  });

  it("returns empty array when no threads found", async () => {
    signIn();
    vi.mocked(db.execute).mockResolvedValue([] as any);

    const response = await GET(new Request("http://localhost/api/threads"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.threads).toEqual([]);
    expect(data.hasMore).toBe(false);
  });

  it("filters by tag name with a confidence threshold", async () => {
    signIn();
    vi.mocked(db.execute).mockResolvedValue([] as any);

    await GET(new Request("http://localhost/api/threads?tag=archivable"));

    const { sql, params } = executedQuery();
    expect(sql).toMatch(/AND EXISTS \(/);
    expect(sql).toMatch(/t\.name = \$\d+/);
    expect(params).toContain("archivable");
  });

  it("filters to untagged emails when tag=unclassified", async () => {
    signIn();
    vi.mocked(db.execute).mockResolvedValue([] as any);

    await GET(new Request("http://localhost/api/threads?tag=unclassified"));

    const { sql, params } = executedQuery();
    expect(sql).toMatch(/AND NOT EXISTS \(/);
    expect(params).not.toContain("unclassified");
  });

  it("applies no tag filter by default", async () => {
    signIn();
    vi.mocked(db.execute).mockResolvedValue([] as any);

    await GET(new Request("http://localhost/api/threads"));

    expect(executedQuery().sql).not.toMatch(/EXISTS/);
  });

  it("returns 500 on database error", async () => {
    signIn();
    vi.mocked(db.execute).mockRejectedValue(new Error("Database error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(new Request("http://localhost/api/threads"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch threads");
  });
});
