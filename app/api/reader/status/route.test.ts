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
  readerSettings: {
    userId: "userId",
    accessToken: "accessToken",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

import { auth } from "@/auth";
import { db } from "@/db";

function mockSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("GET /api/reader/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET(new Request("http://localhost"));
    expect(res.status).toBe(401);
  });

  it("returns connected=false when no settings", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    mockSelect([]);
    const res = await GET(new Request("http://localhost"));
    expect(await res.json()).toEqual({ connected: false });
  });

  it("returns connected=true when token present", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    mockSelect([{ accessToken: "rwsk_x" }]);
    const res = await GET(new Request("http://localhost"));
    expect(await res.json()).toEqual({ connected: true });
  });

  it("returns connected=false when token empty", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    mockSelect([{ accessToken: "" }]);
    const res = await GET(new Request("http://localhost"));
    expect(await res.json()).toEqual({ connected: false });
  });
});
