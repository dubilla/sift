import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

vi.mock("@/lib/mobile-auth", () => ({
  getCurrentSession: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: vi.fn() },
}));

import { GET } from "./route";
import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { asanaTasks, crewTasks, emails, emailTags, todoistTasks } from "@/db/schema";

const dialect = new PgDialect();
const NOW = new Date("2026-10-11T12:00:00Z");

// Chainable stand-in for the drizzle builder: resolves by table, records the
// rendered WHERE and limit so tests can assert filters and scoping.
function mockDb(fixtures: Map<unknown, unknown[]>) {
  const queries: { table: unknown; sql: string; params: unknown[]; limit?: number }[] = [];
  vi.mocked(db.select).mockImplementation((() => {
    const query: { table: unknown; sql: string; params: unknown[]; limit?: number } = {
      table: undefined,
      sql: "",
      params: [],
    };
    const chain: any = {
      from: (table: unknown) => {
        query.table = table;
        queries.push(query);
        return chain;
      },
      innerJoin: () => chain,
      where: (cond: SQL) => {
        Object.assign(query, dialect.sqlToQuery(cond));
        return chain;
      },
      orderBy: () => chain,
      limit: (n: number) => {
        query.limit = n;
        return chain;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(fixtures.get(query.table) ?? []).then(resolve, reject),
    };
    return chain;
  }) as any);
  return queries;
}

const emailRow = {
  id: "e1",
  externalId: "gmail-1",
  threadId: "t1",
  date: new Date("2026-10-11T10:00:00Z"),
  archivedAt: null,
  deletedAt: new Date("2026-10-11T11:00:00Z"),
  hasUnsubscribe: true,
  subject: "Secret subject",
  from: "boss@example.com",
  snippet: "Secret snippet",
};

function fixtures() {
  return new Map<unknown, unknown[]>([
    [emails, [emailRow]],
    [emailTags, [{ emailId: "e1", name: "archivable" }]],
    [asanaTasks, [{ emailId: "e1", id: "a1" }]],
    [todoistTasks, []],
    [crewTasks, [{ emailId: "e1", id: "c1" }]],
  ]);
}

const request = (query = "") => new Request(`https://sift.test/api/diagnostics/emails${query}`);

describe("GET /api/diagnostics/emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "user-1" } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without a token and never touches the db", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("scopes every query to the caller and returns summaries without content", async () => {
    const queries = mockDb(fixtures());

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emails).toEqual([
      {
        id: "e1",
        externalId: "gmail-1",
        threadId: "t1",
        date: "2026-10-11T10:00:00.000Z",
        archivedAt: null,
        deletedAt: "2026-10-11T11:00:00.000Z",
        tags: ["archivable"],
        hasUnsubscribe: true,
        tasks: { asana: ["a1"], todoist: [], crew: ["c1"] },
      },
    ]);
    expect(JSON.stringify(body)).not.toContain("Secret");
    expect(JSON.stringify(body)).not.toContain("boss@example.com");

    for (const table of [emails, asanaTasks, todoistTasks, crewTasks]) {
      const q = queries.find((x) => x.table === table)!;
      expect(q.params).toContain("user-1");
    }
    expect(queries.find((x) => x.table === emails)!.limit).toBe(50);
  });

  it("includes subject, from and snippet only with content=1", async () => {
    mockDb(fixtures());

    const body = await (await GET(request("?content=1"))).json();

    expect(body.emails[0]).toMatchObject({
      subject: "Secret subject",
      from: "boss@example.com",
      snippet: "Secret snippet",
    });
  });

  it("maps filters to SQL conditions and the limit", async () => {
    const queries = mockDb(fixtures());

    await GET(request("?since=7d&untagged=1&archived=1&deleted=1&limit=5"));

    const q = queries.find((x) => x.table === emails)!;
    expect(q.sql).toContain("not exists");
    expect(q.sql).toContain('"archived_at" is not null');
    expect(q.sql).toContain('"deleted_at" is not null');
    expect(q.limit).toBe(5);
    expect(q.params.map(String).some((p) => p.includes("2026-10-04"))).toBe(true);
  });

  it("omits filters when not requested", async () => {
    const queries = mockDb(fixtures());

    await GET(request());

    const q = queries.find((x) => x.table === emails)!;
    expect(q.sql).not.toContain("not exists");
    expect(q.sql).not.toContain("is not null");
  });

  it.each(["?since=abc", "?limit=0", "?limit=201", "?limit=x"])(
    "rejects invalid query %s with 400",
    async (query) => {
      mockDb(fixtures());
      const response = await GET(request(query));
      expect(response.status).toBe(400);
      expect(db.select).not.toHaveBeenCalled();
    }
  );

  it("skips follow-up queries when no emails match", async () => {
    const queries = mockDb(new Map());

    const body = await (await GET(request())).json();

    expect(body).toMatchObject({ count: 0, emails: [] });
    expect(queries).toHaveLength(1);
  });
});
