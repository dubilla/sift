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
import {
  asanaTasks,
  classificationCorrections,
  crewTasks,
  emails,
  todoistTasks,
  userStats,
} from "@/db/schema";

const dialect = new PgDialect();
const NOW = new Date("2026-10-11T12:00:00Z");

type Fixtures = Map<unknown, unknown[]>;

// Each query is select().from(table).where(cond); resolve by table and record
// the rendered WHERE so tests can assert user scoping.
function mockDb(fixtures: Fixtures) {
  const wheres: { table: unknown; sql: string; params: unknown[] }[] = [];
  vi.mocked(db.select).mockImplementation((() => ({
    from: (table: unknown) => ({
      where: (cond: SQL) => {
        const { sql, params } = dialect.sqlToQuery(cond);
        wheres.push({ table, sql, params });
        return Promise.resolve(fixtures.get(table) ?? []);
      },
    }),
  })) as any);
  return wheres;
}

function request(query = "") {
  return new Request(`https://sift.test/api/diagnostics/health${query}`);
}

describe("GET /api/diagnostics/health", () => {
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
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("aggregates the caller's stats over the default 24h window", async () => {
    mockDb(
      new Map<unknown, unknown[]>([
        [userStats, [{ lastSyncedAt: new Date("2026-10-11T11:30:00Z") }]],
        [emails, [{ ingested: 40, tagged: 31 }]],
        [classificationCorrections, [{ count: 3 }]],
        [asanaTasks, [{ count: 2 }]],
        [todoistTasks, [{ count: 0 }]],
        [crewTasks, [{ count: 1 }]],
      ])
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      window: {
        since: "24h",
        from: "2026-10-10T12:00:00.000Z",
        to: "2026-10-11T12:00:00.000Z",
      },
      user_stats: { last_synced_at: "2026-10-11T11:30:00.000Z" },
      emails: { ingested: 40, tagged: 31, untagged: 9 },
      classification_corrections: 3,
      integration_tasks: { asana: 2, todoist: 0, crew: 1 },
      warnings: [],
    });
  });

  it("scopes every query to the caller and the requested window", async () => {
    const wheres = mockDb(new Map());

    const response = await GET(request("?since=7d"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.window.from).toBe("2026-10-04T12:00:00.000Z");
    expect(wheres.map((w) => w.table)).toEqual(
      expect.arrayContaining([
        userStats,
        emails,
        classificationCorrections,
        asanaTasks,
        todoistTasks,
        crewTasks,
      ])
    );
    for (const where of wheres) {
      expect(where.sql).toMatch(/"user_id" = \$1/);
      expect(where.params[0]).toBe("user-1");
      if (where.table !== userStats) {
        expect(where.params).toContain("2026-10-04T12:00:00.000Z");
      }
    }
  });

  it("counts emails by ingestion time, not send date", async () => {
    const wheres = mockDb(new Map());

    await GET(request());

    const emailWhere = wheres.find((w) => w.table === emails)!;
    expect(emailWhere.sql).toContain('"emails"."created_at" >=');
    expect(emailWhere.sql).not.toContain('"date"');
  });

  it("returns zeros and warnings for an account that has never synced", async () => {
    mockDb(new Map());

    const body = await (await GET(request())).json();

    expect(body.user_stats.last_synced_at).toBeNull();
    expect(body.emails).toEqual({ ingested: 0, tagged: 0, untagged: 0 });
    expect(body.classification_corrections).toBe(0);
    expect(body.integration_tasks).toEqual({ asana: 0, todoist: 0, crew: 0 });
    expect(body.warnings).toEqual(["No sync has ever completed for this account."]);
  });

  it("warns when emails are ingested but none are tagged", async () => {
    mockDb(
      new Map<unknown, unknown[]>([
        [userStats, [{ lastSyncedAt: new Date("2026-10-11T11:55:00Z") }]],
        [emails, [{ ingested: 12, tagged: 0 }]],
      ])
    );

    const body = await (await GET(request())).json();

    expect(body.emails).toEqual({ ingested: 12, tagged: 0, untagged: 12 });
    expect(body.warnings).toEqual([
      "12 emails ingested in the last 24h but none were tagged — classification may not be writing tags.",
    ]);
  });

  it("warns when the last sync is stale", async () => {
    mockDb(
      new Map<unknown, unknown[]>([
        [userStats, [{ lastSyncedAt: new Date("2026-10-11T02:00:00Z") }]],
      ])
    );

    const body = await (await GET(request())).json();

    expect(body.warnings).toEqual(["Last sync was more than 6h ago."]);
  });

  it.each(["abc", "24", "0h", "31d", "-1h", "1w"])(
    "rejects invalid since=%s with 400",
    async (since) => {
      mockDb(new Map());

      const response = await GET(request(`?since=${encodeURIComponent(since)}`));

      expect(response.status).toBe(400);
      expect(db.select).not.toHaveBeenCalled();
    }
  );

  it("returns 500 when a query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(db.select).mockImplementation((() => ({
      from: () => ({ where: () => Promise.reject(new Error("db down")) }),
    })) as any);

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to compute health" });
  });
});
