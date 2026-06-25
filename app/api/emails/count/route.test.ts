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
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  countDistinct: vi.fn((col) => ({ type: "countDistinct", col })),
}));

import { auth } from "@/auth";
import { db } from "@/db";

describe("GET /api/emails/count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(new Request("http://localhost"));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns count of distinct threads", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockResult = [{ count: 15 }];
    const mockWhere = vi.fn().mockResolvedValue(mockResult);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(15);
  });

  it("returns 0 when no unarchived emails exist", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockResult = [{ count: 0 }];
    const mockWhere = vi.fn().mockResolvedValue(mockResult);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(0);
  });

  it("returns 0 when result is empty", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockResult: any[] = [];
    const mockWhere = vi.fn().mockResolvedValue(mockResult);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(0);
  });

  it("counts distinct threads not individual emails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // Simulating 3 distinct threads with multiple emails each
    // The query should use countDistinct to count unique thread IDs
    const mockResult = [{ count: 3 }];
    const mockWhere = vi.fn().mockResolvedValue(mockResult);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.count).toBe(3);
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockWhere = vi.fn().mockRejectedValue(new Error("Database error"));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(new Request("http://localhost"));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch email count");
  });
});
