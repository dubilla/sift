import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql as rawSql, type SQL } from "drizzle-orm";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/lib/services/classifier", () => ({
  classifyEmail: vi.fn(),
  CONFIDENCE_THRESHOLD: 0.7,
}));

import { db } from "@/db";
import { classifyEmail } from "@/lib/services/classifier";
import { classifyEmailsBatch, classifyUntaggedBacklog, findUntaggedEmails } from "./classify-batch";

const dbMock = db as unknown as {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
};
const classifyEmailMock = vi.mocked(classifyEmail);

function mockEmail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "email-1",
    externalId: "ext-1",
    userId: "user-1",
    threadId: null,
    subject: "Hello",
    from: "sender@example.com",
    to: "user@example.com",
    snippet: "Snippet",
    date: new Date(),
    archivedAt: null,
    deletedAt: null,
    hasUnsubscribe: false,
    unsubscribeUrl: null,
    createdAt: new Date(),
    listId: null,
    isNoreply: false,
    recipientCount: 1,
    ...overrides,
  };
}

function mockTag(name: string, id = `tag-${name}`) {
  return {
    id,
    name,
    displayName: name,
    color: "#000",
    icon: null,
  };
}

// Build a chained select() result. classify-batch uses two select shapes:
//   db.select().from(emails).where(...)  -> emails for user
//   db.select().from(tags)                -> all tags
function queueSelect(emailRows: unknown[], tagRows: unknown[]) {
  dbMock.select
    .mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve(emailRows) }),
    })
    .mockReturnValueOnce({
      from: () => Promise.resolve(tagRows),
    });
}

function setupInsert() {
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  dbMock.insert.mockReturnValue({ values });
  return { values, onConflictDoNothing };
}

describe("classifyEmailsBatch", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
    classifyEmailMock.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("returns early when emailIds is empty without touching the DB", async () => {
    const result = await classifyEmailsBatch("user-1", []);

    expect(result).toEqual({ classified: 0, failed: 0, total: 0 });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
    expect(classifyEmailMock).not.toHaveBeenCalled();
  });

  it("returns early without classifying when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await classifyEmailsBatch("user-1", ["email-1"]);

    expect(result).toEqual({ classified: 0, failed: 1, total: 1 });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(classifyEmailMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("persists a tag when classification confidence meets threshold", async () => {
    const email = mockEmail({ id: "email-1" });
    const tag = mockTag("archivable");
    queueSelect([email], [tag]);
    const { values } = setupInsert();

    classifyEmailMock.mockResolvedValueOnce({
      tag: "archivable",
      confidence: 0.9,
      source: "rule",
      reason: "noreply",
    });

    const result = await classifyEmailsBatch("user-1", ["email-1"]);

    expect(result).toEqual({ classified: 1, failed: 0, total: 1 });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        emailId: "email-1",
        tagId: "tag-archivable",
        source: "rule",
        confidence: 0.9,
      })
    );
  });

  it("persists below-threshold results without counting them as classified", async () => {
    queueSelect([mockEmail()], [mockTag("archivable")]);
    const { values } = setupInsert();

    classifyEmailMock.mockResolvedValueOnce({
      tag: "archivable",
      confidence: 0.5,
      source: "llm",
      reason: "uncertain",
    });

    const result = await classifyEmailsBatch("user-1", ["email-1"]);

    expect(result).toEqual({ classified: 0, failed: 0, total: 1 });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: "email-1", tagId: "tag-archivable", confidence: 0.5 })
    );
  });

  it("does not persist when tag is null", async () => {
    queueSelect([mockEmail()], [mockTag("archivable")]);
    const { values } = setupInsert();

    classifyEmailMock.mockResolvedValueOnce({
      tag: null,
      confidence: 0,
      source: "llm",
      reason: "failed",
    });

    const result = await classifyEmailsBatch("user-1", ["email-1"]);

    expect(result).toEqual({ classified: 0, failed: 1, total: 1 });
    expect(values).not.toHaveBeenCalled();
  });

  it("does not persist when classified tag is not in the tags table", async () => {
    queueSelect([mockEmail()], [mockTag("quick_action")]);
    const { values } = setupInsert();

    classifyEmailMock.mockResolvedValueOnce({
      tag: "archivable",
      confidence: 0.95,
      source: "rule",
      reason: "obvious",
    });

    const result = await classifyEmailsBatch("user-1", ["email-1"]);

    expect(result).toEqual({ classified: 0, failed: 1, total: 1 });
    expect(values).not.toHaveBeenCalled();
  });

  it("continues processing when a single email's classification throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    queueSelect(
      [mockEmail({ id: "email-1" }), mockEmail({ id: "email-2" })],
      [mockTag("archivable")]
    );
    const { values } = setupInsert();

    classifyEmailMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        tag: "archivable",
        confidence: 0.9,
        source: "rule",
        reason: "ok",
      });

    const result = await classifyEmailsBatch("user-1", ["email-1", "email-2"]);

    expect(result).toEqual({ classified: 1, failed: 1, total: 2 });
    expect(values).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ emailId: "email-2" })
    );
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns zero when DB lookup yields no rows for the given IDs", async () => {
    queueSelect([], []);
    const { values } = setupInsert();

    const result = await classifyEmailsBatch("user-1", ["email-missing"]);

    expect(result).toEqual({ classified: 0, failed: 0, total: 0 });
    expect(classifyEmailMock).not.toHaveBeenCalled();
    expect(values).not.toHaveBeenCalled();
  });
});

describe("classifyUntaggedBacklog", () => {
  const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
    classifyEmailMock.mockReset();
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  // Untagged query: db.select().from(emails).where(notExists(db.select()...)).orderBy().limit()
  // The notExists subquery's db.select() runs while building the outer .where() arg.
  function queueUntagged(rows: { id: string }[]) {
    const limit = vi.fn().mockResolvedValue(rows);
    dbMock.select
      .mockReturnValueOnce({
        from: () => ({ where: () => ({ orderBy: () => ({ limit }) }) }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => ({}) }),
      });
    return { limit };
  }

  it("classifies the newest untagged emails up to the batch size", async () => {
    const { limit } = queueUntagged([{ id: "email-1" }]);
    queueSelect([mockEmail({ id: "email-1" })], [mockTag("archivable")]);
    const { values } = setupInsert();
    classifyEmailMock.mockResolvedValueOnce({
      tag: "archivable",
      confidence: 0.9,
      source: "llm",
      reason: "newsletter",
    });

    const result = await classifyUntaggedBacklog("user-1");

    expect(limit).toHaveBeenCalledWith(25);
    expect(result).toEqual({ classified: 1, failed: 0, total: 1 });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ emailId: "email-1" }));
  });

  it("does nothing when there is no backlog", async () => {
    queueUntagged([]);

    const result = await classifyUntaggedBacklog("user-1");

    expect(result).toEqual({ classified: 0, failed: 0, total: 0 });
    expect(classifyEmailMock).not.toHaveBeenCalled();
  });
});

describe("findUntaggedEmails", () => {
  const dialect = new PgDialect();

  // Capture the outer query's where/orderBy so the predicate can be rendered
  function captureQuery() {
    const captured: { where?: SQL; orderBy?: unknown[] } = {};
    dbMock.select.mockReset();
    dbMock.select
      .mockReturnValueOnce({
        from: () => ({
          where: (where: SQL) => {
            captured.where = where;
            return {
              orderBy: (...orderBy: unknown[]) => {
                captured.orderBy = orderBy;
                return { limit: () => Promise.resolve([]) };
              },
            };
          },
        }),
      })
      .mockReturnValueOnce({
        from: () => ({ where: () => rawSql`(select 1)` }),
      });
    return captured;
  }

  it("pages strictly past the cursor, breaking date ties by id", async () => {
    const captured = captureQuery();
    const before = { date: new Date("2026-10-01T12:00:00Z"), id: "email-50" };

    await findUntaggedEmails("user-1", { limit: 50, before });

    const { sql, params } = dialect.sqlToQuery(captured.where!);
    expect(sql).toMatch(/\("emails"\."date" < \$\d+ or \("emails"\."date" = \$\d+ and "emails"\."id" < \$\d+\)\)/);
    expect(params).toContain("email-50");
    expect(captured.orderBy).toHaveLength(2);
  });

  it("has no cursor predicate on the first page", async () => {
    const captured = captureQuery();

    await findUntaggedEmails("user-1", { limit: 50 });

    const { sql } = dialect.sqlToQuery(captured.where!);
    expect(sql).not.toMatch(/"emails"\."date" </);
  });
});
