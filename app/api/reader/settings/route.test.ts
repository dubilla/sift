import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, DELETE } from "./route";

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
  readerSettings: {
    userId: "userId",
    accessToken: "accessToken",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

vi.mock("@/lib/services/reader", () => ({
  validateToken: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { validateToken } from "@/lib/services/reader";

function mockSelect(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

describe("GET /api/reader/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns null settings when none stored", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    mockSelect([]);
    const res = await GET();
    const data = await res.json();
    expect(data.settings).toBeNull();
  });

  it("returns hasAccessToken=true (never the raw token)", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    mockSelect([{ userId: "u1", accessToken: "rwsk_secret" }]);
    const res = await GET();
    const data = await res.json();
    expect(data.settings).toEqual({ hasAccessToken: true });
    expect(JSON.stringify(data)).not.toContain("rwsk_secret");
  });
});

describe("POST /api/reader/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRequest(body: unknown) {
    return new Request("http://localhost/api/reader/settings", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(makeRequest({ accessToken: "x" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when token missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token fails validation against Readwise", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(validateToken).mockResolvedValue(false);
    const res = await POST(makeRequest({ accessToken: "bad" }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.error).toBe("Invalid Readwise access token");
  });

  it("upserts settings when token is valid", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(validateToken).mockResolvedValue(true);

    const onConflictDoUpdate = vi.fn().mockResolvedValue({});
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    vi.mocked(db.insert).mockReturnValue({ values } as never);

    const res = await POST(makeRequest({ accessToken: "rwsk_good" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(values).toHaveBeenCalledWith({
      userId: "u1",
      accessToken: "rwsk_good",
    });
  });
});

describe("DELETE /api/reader/settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("deletes by userId", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    const where = vi.fn().mockResolvedValue({});
    vi.mocked(db.delete).mockReturnValue({ where } as never);
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(where).toHaveBeenCalled();
  });
});
