import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST, GET } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  emails: {
    id: "id",
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
    date: "date",
    subject: "subject",
    from: "from",
    to: "to",
    snippet: "snippet",
    hasUnsubscribe: "hasUnsubscribe",
    listId: "listId",
    isNoreply: "isNoreply",
    recipientCount: "recipientCount",
  },
  emailTags: {
    emailId: "emailId",
    tagId: "tagId",
    confidence: "confidence",
  },
  tags: {
    id: "id",
    name: "name",
    displayName: "displayName",
    color: "color",
    icon: "icon",
  },
}));

vi.mock("@/lib/services/classifier", () => ({
  classifyEmail: vi.fn(),
  CONFIDENCE_THRESHOLD: 0.7,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  inArray: vi.fn((col, vals) => ({ type: "inArray", col, vals })),
  desc: vi.fn((col) => ({ type: "desc", col })),
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ type: "sql", strings, values })),
    { raw: vi.fn((s: string) => s) }
  ),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { classifyEmail } from "@/lib/services/classifier";

// Helper: reads all NDJSON lines from a streaming Response
async function readNDJSONEvents(response: Response): Promise<Record<string, unknown>[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

const MOCK_EMAIL = {
  id: "email-1",
  userId: "user123",
  subject: "Hello",
  from: "sender@example.com",
  to: "me@example.com",
  snippet: "Hi there",
  hasUnsubscribe: false,
  listId: null,
  isNoreply: false,
  recipientCount: 1,
  archivedAt: null,
  deletedAt: null,
  date: new Date("2024-01-15"),
};

const MOCK_TAG = { id: "tag-1", name: "newsletter", displayName: "Newsletter", color: null, icon: null };

function mockSelectChains({
  classifiedIds = [] as { emailId: string }[],
  emailsToClassify = [MOCK_EMAIL],
  allTags = [MOCK_TAG],
} = {}) {
  // Call 1: get classified email IDs — chain: .from().innerJoin().where()
  const chain1Where = vi.fn().mockResolvedValue(classifiedIds);
  const chain1InnerJoin = vi.fn(() => ({ where: chain1Where }));
  const chain1From = vi.fn(() => ({ innerJoin: chain1InnerJoin }));

  // Call 2: get emails to classify — chain: .from().where().orderBy().limit()
  const chain2Limit = vi.fn().mockResolvedValue(emailsToClassify);
  const chain2OrderBy = vi.fn(() => ({ limit: chain2Limit }));
  const chain2Where = vi.fn(() => ({ orderBy: chain2OrderBy }));
  const chain2From = vi.fn(() => ({ where: chain2Where }));

  // Call 3: get all tags — chain: .from()
  const chain3From = vi.fn().mockResolvedValue(allTags);

  vi.mocked(db.select)
    .mockReturnValueOnce({ from: chain1From } as any)
    .mockReturnValueOnce({ from: chain2From } as any)
    .mockReturnValueOnce({ from: chain3From } as any);

  // Mock insert chain
  const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
  vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

  return { mockOnConflictDoNothing };
}

describe("POST /api/emails/classify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 500 when OpenAI key is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    vi.mocked(auth).mockResolvedValue({ user: { id: "user123" } } as any);

    const request = new Request("http://localhost/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it("streams start, progress, and done events", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user123" } } as any);
    mockSelectChains();

    vi.mocked(classifyEmail).mockResolvedValue({
      tag: "newsletter",
      confidence: 0.9,
      source: "ai",
    } as any);

    const request = new Request("http://localhost/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");

    const events = await readNDJSONEvents(response);

    const startEvent = events.find((e) => e.type === "start");
    const progressEvents = events.filter((e) => e.type === "progress");
    const doneEvent = events.find((e) => e.type === "done");

    expect(startEvent).toBeDefined();
    expect(startEvent!.total).toBe(1);

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0].emailId).toBe("email-1");
    expect(progressEvents[0].tag).toBe("newsletter");

    expect(doneEvent).toBeDefined();
    expect(doneEvent!.classified).toBe(1);
    expect(doneEvent!.total).toBe(1);
  });

  it("classified count only increments when confidence meets threshold", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user123" } } as any);

    const lowConfidenceEmail = { ...MOCK_EMAIL, id: "email-2" };
    mockSelectChains({ emailsToClassify: [MOCK_EMAIL, lowConfidenceEmail] });

    vi.mocked(classifyEmail)
      .mockResolvedValueOnce({ tag: "newsletter", confidence: 0.9, source: "ai" } as any) // above threshold
      .mockResolvedValueOnce({ tag: "newsletter", confidence: 0.3, source: "ai" } as any); // below threshold

    const request = new Request("http://localhost/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 }),
    });

    const response = await POST(request);
    const events = await readNDJSONEvents(response);

    const progressEvents = events.filter((e) => e.type === "progress");
    expect(progressEvents[0].classified).toBe(1); // first email classified
    expect(progressEvents[1].classified).toBe(1); // second didn't meet threshold

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent!.classified).toBe(1);
    expect(doneEvent!.total).toBe(2);
  });

  it("streams done with 0 when no unclassified emails exist", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user123" } } as any);

    // All emails already classified
    mockSelectChains({
      classifiedIds: [{ emailId: "email-1" }],
      emailsToClassify: [MOCK_EMAIL],
    });

    const request = new Request("http://localhost/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 }),
    });

    const response = await POST(request);
    const events = await readNDJSONEvents(response);

    // Only a done event — no start or progress since filtered list is empty
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeDefined();
    expect(doneEvent!.classified).toBe(0);
    expect(doneEvent!.total).toBe(0);
    expect(events.filter((e) => e.type === "progress")).toHaveLength(0);
  });

  it("continues processing remaining emails when one classification fails", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user123" } } as any);

    const email2 = { ...MOCK_EMAIL, id: "email-2" };
    mockSelectChains({ emailsToClassify: [MOCK_EMAIL, email2] });

    vi.mocked(classifyEmail)
      .mockRejectedValueOnce(new Error("OpenAI timeout"))
      .mockResolvedValueOnce({ tag: "newsletter", confidence: 0.9, source: "ai" } as any);

    const request = new Request("http://localhost/api/emails/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 50 }),
    });

    const response = await POST(request);
    const events = await readNDJSONEvents(response);

    const progressEvents = events.filter((e) => e.type === "progress");
    expect(progressEvents).toHaveLength(2);

    // First email errored — emitted with null tag
    expect(progressEvents[0].tag).toBeNull();
    // Second email succeeded
    expect(progressEvents[1].tag).toBe("newsletter");

    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent!.classified).toBe(1);
    expect(doneEvent!.total).toBe(2);
  });
});

describe("GET /api/emails/classify", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns tag counts and unclassified count", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user123" } } as any);

    const allTags = [MOCK_TAG];
    const tagCountResults = [{ tagId: "tag-1", count: 5 }];
    const allEmailIds = [{ id: "email-1" }, { id: "email-2" }, { id: "email-3" }];
    const classifiedEmailIds = [{ emailId: "email-1" }];

    let callCount = 0;
    vi.mocked(db.select).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // get all tags
        const from = vi.fn().mockResolvedValue(allTags);
        return { from } as any;
      }
      if (callCount === 2) {
        // aggregated tag counts
        const groupBy = vi.fn().mockResolvedValue(tagCountResults);
        const where = vi.fn(() => ({ groupBy }));
        const innerJoin = vi.fn(() => ({ where }));
        const from = vi.fn(() => ({ innerJoin }));
        return { from } as any;
      }
      if (callCount === 3) {
        // all email IDs
        const where = vi.fn().mockResolvedValue(allEmailIds);
        const from = vi.fn(() => ({ where }));
        return { from } as any;
      }
      if (callCount === 4) {
        // classified email IDs
        const where = vi.fn().mockResolvedValue(classifiedEmailIds);
        const innerJoin = vi.fn(() => ({ where }));
        const from = vi.fn(() => ({ innerJoin }));
        return { from } as any;
      }
      return { from: vi.fn().mockResolvedValue([]) } as any;
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tags).toHaveLength(1);
    expect(data.tags[0].name).toBe("newsletter");
    expect(data.tags[0].count).toBe(5);
    expect(data.unclassified).toBe(2); // 3 total - 1 classified
    expect(data.total).toBe(3);
  });
});
