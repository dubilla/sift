import { describe, it, expect, vi, beforeEach } from "vitest";
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
  activityLog,
  asanaTasks,
  classificationCorrections,
  crewTasks,
  emails,
  emailTags,
  tags,
  todoistTasks,
} from "@/db/schema";

const dialect = new PgDialect();

function mockDb(fixtures: Map<unknown, unknown[]>) {
  const queries: { table: unknown; sql: string; params: unknown[] }[] = [];
  vi.mocked(db.select).mockImplementation((() => {
    const query: { table: unknown; sql: string; params: unknown[] } = {
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
      limit: () => chain,
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(fixtures.get(query.table) ?? []).then(resolve, reject),
    };
    return chain;
  }) as any);
  return queries;
}

const at = (iso: string) => new Date(iso);

function fixtures() {
  return new Map<unknown, unknown[]>([
    [
      emails,
      [
        {
          id: "e1",
          externalId: "gmail-1",
          threadId: "t1",
          date: at("2026-10-11T10:00:00Z"),
          createdAt: at("2026-10-11T10:05:00Z"),
          archivedAt: null,
          deletedAt: null,
          hasUnsubscribe: false,
          subject: "Secret subject",
          from: "boss@example.com",
          snippet: "Secret snippet",
        },
      ],
    ],
    [
      emailTags,
      [{ name: "archivable", source: "llm", confidence: 0.9, classifiedAt: at("2026-10-11T10:06:00Z") }],
    ],
    [
      classificationCorrections,
      [
        {
          id: "c1",
          oldTagId: "tag-a",
          newTagId: "tag-b",
          oldSource: "llm",
          oldConfidence: 0.7,
          correctedAt: at("2026-10-11T11:00:00Z"),
          appliedToSimilar: false,
        },
      ],
    ],
    [
      tags,
      [
        { id: "tag-a", name: "archivable" },
        { id: "tag-b", name: "quick_action" },
      ],
    ],
    [activityLog, [{ id: "l1", action: "archive", createdAt: at("2026-10-11T12:00:00Z") }]],
    [
      asanaTasks,
      [
        {
          id: "at1",
          asanaTaskGid: "gid-1",
          asanaTaskUrl: "https://asana.test/1",
          taskName: "Secret task",
          createdAt: at("2026-10-11T10:30:00Z"),
        },
      ],
    ],
  ]);
}

const call = (id: string, query = "") =>
  GET(new Request(`https://sift.test/api/diagnostics/emails/${id}${query}`), { params: { id } });

describe("GET /api/diagnostics/emails/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue({ user: { id: "user-1" } });
  });

  it("returns 401 without a token and never touches the db", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    const response = await call("e1");

    expect(response.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns 404 when the email isn't the caller's (lookup is user-scoped)", async () => {
    // The user-scoped query finds nothing for another user's email.
    const queries = mockDb(new Map());

    const response = await call("someone-elses-email");

    expect(response.status).toBe(404);
    expect(queries).toHaveLength(1);
    expect(queries[0].table).toBe(emails);
    expect(queries[0].params).toContain("user-1");
    expect(queries[0].sql).toContain('"user_id"');
  });

  it("matches on id or externalId", async () => {
    const queries = mockDb(fixtures());

    await call("gmail-1");

    const q = queries.find((x) => x.table === emails)!;
    expect(q.sql).toContain('"id"');
    expect(q.sql).toContain('"external_id"');
    expect(q.params.filter((p) => p === "gmail-1")).toHaveLength(2);
  });

  it("returns tags, corrections, activity and tasks, scoped to the caller", async () => {
    const queries = mockDb(fixtures());

    const response = await call("e1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tags).toEqual([
      { name: "archivable", source: "llm", confidence: 0.9, classifiedAt: "2026-10-11T10:06:00.000Z" },
    ]);
    expect(body.corrections).toEqual([
      {
        id: "c1",
        oldTag: "archivable",
        newTag: "quick_action",
        oldSource: "llm",
        oldConfidence: 0.7,
        correctedAt: "2026-10-11T11:00:00.000Z",
        appliedToSimilar: false,
      },
    ]);
    expect(body.activity).toEqual([
      { id: "l1", action: "archive", createdAt: "2026-10-11T12:00:00.000Z" },
    ]);
    expect(body.integrationTasks).toEqual([
      {
        provider: "asana",
        id: "at1",
        taskId: "gid-1",
        url: "https://asana.test/1",
        createdAt: "2026-10-11T10:30:00.000Z",
      },
    ]);

    for (const table of [
      emails,
      classificationCorrections,
      activityLog,
      asanaTasks,
      todoistTasks,
      crewTasks,
    ]) {
      expect(queries.find((x) => x.table === table)!.params).toContain("user-1");
    }
  });

  it("redacts subject, from, snippet and task names unless content=1", async () => {
    mockDb(fixtures());

    const redacted = JSON.stringify(await (await call("e1")).json());
    expect(redacted).not.toContain("Secret");
    expect(redacted).not.toContain("boss@example.com");

    mockDb(fixtures());
    const body = await (await call("e1", "?content=1")).json();
    expect(body.email).toMatchObject({
      subject: "Secret subject",
      from: "boss@example.com",
      snippet: "Secret snippet",
    });
    expect(body.integrationTasks[0].taskName).toBe("Secret task");
  });
});
