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
  activityLog: {
    userId: "userId",
    action: "action",
    createdAt: "createdAt",
  },
  userStats: {
    userId: "userId",
    totalUnarchivedCount: "totalUnarchivedCount",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
  gte: vi.fn((col, val) => ({ type: "gte", col, val })),
  countDistinct: vi.fn((col) => ({ type: "countDistinct", col })),
  count: vi.fn(() => ({ type: "count" })),
}));

import { auth } from "@/auth";
import { db } from "@/db";

describe("GET /api/stats", () => {
  const request = new Request("https://sift.test/api/stats");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns all stats when user is authenticated", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // Mock the queries in the order they're called
    const mockUnarchivedResult = [{ count: 42 }];
    const mockTodayResult = [{ count: 5 }];
    const mockWeekResult = [{ count: 23 }];
    const mockRecentResult = [{ count: 10 }]; // 10 emails in last 5 minutes = 2.0 emails/min
    const mockUserStatsResult = [{ totalUnarchivedCount: 50 }];

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockUnarchivedResult);
      if (callCount === 2) return Promise.resolve(mockTodayResult);
      if (callCount === 3) return Promise.resolve(mockWeekResult);
      if (callCount === 4) return Promise.resolve(mockRecentResult);
      if (callCount === 5) return Promise.resolve(mockUserStatsResult);
      return Promise.resolve([]);
    });

    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      totalUnarchived: 42,
      totalUnarchivedCount: 50,
      emailsInDatabase: 42,
      parsedToday: 5,
      parsedThisWeek: 23,
      velocity: 2.0,
    });
    expect(db.select).toHaveBeenCalledTimes(5);
  });

  it("returns zeros when no emails exist", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockEmptyResult = [{ count: 0 }];
    const mockEmptyUserStats = [{ totalUnarchivedCount: 0 }];

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 5) return Promise.resolve(mockEmptyUserStats);
      return Promise.resolve(mockEmptyResult);
    });
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      totalUnarchived: 0,
      totalUnarchivedCount: 0,
      emailsInDatabase: 0,
      parsedToday: 0,
      parsedThisWeek: 0,
      velocity: 0,
    });
  });

  it("handles empty result arrays", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      totalUnarchived: 0,
      totalUnarchivedCount: 0,
      emailsInDatabase: 0,
      parsedToday: 0,
      parsedThisWeek: 0,
      velocity: 0,
    });
  });

  it("calculates velocity correctly", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // Mock results: 25 emails in last 5 minutes = 5.0 emails/min
    const mockUnarchivedResult = [{ count: 100 }];
    const mockTodayResult = [{ count: 50 }];
    const mockWeekResult = [{ count: 150 }];
    const mockRecentResult = [{ count: 25 }];
    const mockUserStatsResult = [{ totalUnarchivedCount: 120 }];

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockUnarchivedResult);
      if (callCount === 2) return Promise.resolve(mockTodayResult);
      if (callCount === 3) return Promise.resolve(mockWeekResult);
      if (callCount === 4) return Promise.resolve(mockRecentResult);
      if (callCount === 5) return Promise.resolve(mockUserStatsResult);
      return Promise.resolve([]);
    });

    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.velocity).toBe(5.0);
  });

  it("rounds velocity to one decimal place", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // Mock results: 7 emails in last 5 minutes = 1.4 emails/min
    const mockUnarchivedResult = [{ count: 50 }];
    const mockTodayResult = [{ count: 10 }];
    const mockWeekResult = [{ count: 30 }];
    const mockRecentResult = [{ count: 7 }];
    const mockUserStatsResult = [{ totalUnarchivedCount: 55 }];

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockUnarchivedResult);
      if (callCount === 2) return Promise.resolve(mockTodayResult);
      if (callCount === 3) return Promise.resolve(mockWeekResult);
      if (callCount === 4) return Promise.resolve(mockRecentResult);
      if (callCount === 5) return Promise.resolve(mockUserStatsResult);
      return Promise.resolve([]);
    });

    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.velocity).toBe(1.4);
  });

  it("counts only archive actions, not other actions", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // All activity log queries should filter by action = 'archive'
    const mockUnarchivedResult = [{ count: 30 }];
    const mockTodayResult = [{ count: 8 }]; // only archive actions today
    const mockWeekResult = [{ count: 20 }]; // only archive actions this week
    const mockRecentResult = [{ count: 3 }]; // only archive actions in last 5 min
    const mockUserStatsResult = [{ totalUnarchivedCount: 35 }];

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockUnarchivedResult);
      if (callCount === 2) return Promise.resolve(mockTodayResult);
      if (callCount === 3) return Promise.resolve(mockWeekResult);
      if (callCount === 4) return Promise.resolve(mockRecentResult);
      if (callCount === 5) return Promise.resolve(mockUserStatsResult);
      return Promise.resolve([]);
    });

    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.parsedToday).toBe(8);
    expect(data.parsedThisWeek).toBe(20);
    expect(data.velocity).toBe(0.6);
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockWhere = vi.fn().mockRejectedValue(new Error("Database error"));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch stats");
  });

  it("handles partial database failures gracefully", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve([{ count: 10 }]);
      // Fail on second query
      return Promise.reject(new Error("Database connection lost"));
    });

    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch stats");
  });

  it("returns correct stats for user with high activity", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    // Simulating a power user
    const mockUnarchivedResult = [{ count: 5 }]; // almost done!
    const mockTodayResult = [{ count: 250 }]; // archived 250 today
    const mockWeekResult = [{ count: 1500 }]; // archived 1500 this week
    const mockRecentResult = [{ count: 50 }]; // 50 in last 5 min = 10.0/min
    const mockUserStatsResult = [{ totalUnarchivedCount: 10 }];

    let callCount = 0;
    const mockWhere = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockUnarchivedResult);
      if (callCount === 2) return Promise.resolve(mockTodayResult);
      if (callCount === 3) return Promise.resolve(mockWeekResult);
      if (callCount === 4) return Promise.resolve(mockRecentResult);
      if (callCount === 5) return Promise.resolve(mockUserStatsResult);
      return Promise.resolve([]);
    });

    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      totalUnarchived: 5,
      totalUnarchivedCount: 10,
      emailsInDatabase: 5,
      parsedToday: 250,
      parsedThisWeek: 1500,
      velocity: 10.0,
    });
  });
});
