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
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
    date: "date",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ type: "and", args })),
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  desc: vi.fn((col) => ({ type: "desc", col })),
}));

import { auth } from "@/auth";
import { db } from "@/db";

describe("GET /api/emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user id", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {},
    } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns emails for authenticated user", async () => {
    const mockEmails = [
      {
        id: "1",
        userId: "user123",
        subject: "Test Email 1",
        from: "sender1@example.com",
        snippet: "Test snippet 1",
        date: new Date("2024-01-15"),
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "2",
        userId: "user123",
        subject: "Test Email 2",
        from: "sender2@example.com",
        snippet: "Test snippet 2",
        date: new Date("2024-01-14"),
        archivedAt: null,
        deletedAt: null,
      },
    ];

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue(mockEmails);
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.emails).toHaveLength(2);
    expect(data.emails[0].id).toBe("1");
    expect(data.emails[0].subject).toBe("Test Email 1");
    expect(data.emails[1].id).toBe("2");
  });

  it("filters out archived emails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockOrderBy = vi.fn(() => ({ limit: mockLimit }));
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    await GET();

    expect(mockWhere).toHaveBeenCalledWith(
      expect.objectContaining({ type: "and" })
    );
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("Database connection failed");
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch emails");
  });
});
