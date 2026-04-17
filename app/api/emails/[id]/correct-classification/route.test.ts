import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  emails: {
    id: "id",
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
    from: "from",
    subject: "subject",
    snippet: "snippet",
    listId: "listId",
    isNoreply: "isNoreply",
    recipientCount: "recipientCount",
    hasUnsubscribe: "hasUnsubscribe",
  },
  emailTags: {
    emailId: "emailId",
    tagId: "tagId",
    source: "source",
    confidence: "confidence",
  },
  tags: {
    id: "id",
    name: "name",
    displayName: "displayName",
    icon: "icon",
  },
  classificationCorrections: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  ne: vi.fn((col, val) => ({ type: "ne", col, val })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

vi.mock("@/lib/services/similarity", () => ({
  areSimilar: vi.fn(),
  extractEmailAddress: vi.fn((from: string) => from),
  SIMILARITY_THRESHOLD: { HIGH: 0.8, MEDIUM: 0.6, LOW: 0.4 },
}));

import { auth } from "@/auth";
import { db } from "@/db";

function makeRequest(emailId: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/emails/${emailId}/correct-classification`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Helper to set up chained db.select() mock
function mockSelectChain(results: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(results),
  };
  return chain;
}

function mockInsertChain() {
  return {
    values: vi.fn().mockResolvedValue(undefined),
  };
}

function mockDeleteChain() {
  return {
    where: vi.fn().mockResolvedValue(undefined),
  };
}

describe("POST /api/emails/[id]/correct-classification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await POST(
      makeRequest("email1", { newTagId: "tag1" }),
      makeParams("email1")
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when newTagId is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user1" } } as any);

    const response = await POST(
      makeRequest("email1", {}),
      makeParams("email1")
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("newTagId is required");
  });

  it("returns 404 when email is not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user1" } } as any);

    const emailSelect = mockSelectChain([]);
    vi.mocked(db.select).mockReturnValue(emailSelect as any);

    const response = await POST(
      makeRequest("email1", { newTagId: "tag1" }),
      makeParams("email1")
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Email not found");
  });

  it("returns 404 when tag is not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user1" } } as any);

    const emailSelect = mockSelectChain([{ id: "email1", userId: "user1", from: "test@test.com" }]);
    const tagSelect = mockSelectChain([]);

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return emailSelect as any;
      return tagSelect as any;
    });

    const response = await POST(
      makeRequest("email1", { newTagId: "badtag" }),
      makeParams("email1")
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Tag not found");
  });

  it("applies to similar emails without re-correcting the original", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "user1" } } as any);

    const email = {
      id: "email1",
      userId: "user1",
      from: "sender@example.com",
      subject: "Test",
      snippet: "snippet",
      listId: null,
      isNoreply: false,
      recipientCount: 1,
      hasUnsubscribe: false,
    };
    const tag = { id: "tag1", name: "quick_action", displayName: "Quick Action", icon: "⚡" };
    const similarEmail = {
      id: "similar1",
      userId: "user1",
      from: "sender@example.com",
      subject: "Test 2",
      snippet: "snippet 2",
      listId: null,
      isNoreply: false,
      recipientCount: 1,
      hasUnsubscribe: false,
    };

    // Track all select calls
    const emailSelect = mockSelectChain([email]);
    const tagSelect = mockSelectChain([tag]);
    // db.select() for verifying similar email IDs belong to user
    const similarEmailsSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([similarEmail]),
    };
    // db.select() for getting current tags of similar email
    const currentTagsSelect = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ tagId: "old-tag", source: "llm", confidence: 0.75 }]),
    };

    let selectCall = 0;
    vi.mocked(db.select).mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return emailSelect as any;
      if (selectCall === 2) return tagSelect as any;
      if (selectCall === 3) return similarEmailsSelect as any;
      return currentTagsSelect as any;
    });

    vi.mocked(db.insert).mockReturnValue(mockInsertChain() as any);
    vi.mocked(db.delete).mockReturnValue(mockDeleteChain() as any);

    const response = await POST(
      makeRequest("email1", {
        newTagId: "tag1",
        applyToSimilarIds: ["similar1"],
      }),
      makeParams("email1")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.appliedCount).toBe(1);

    // Should only insert emailTags for the similar email, NOT re-insert for the original
    expect(db.insert).toHaveBeenCalledTimes(2); // emailTags + classificationCorrections for similar1
    expect(db.delete).toHaveBeenCalledTimes(1); // delete old tag for similar1 only
  });
});
