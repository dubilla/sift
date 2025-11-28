import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  emails: {
    id: "id",
    userId: "userId",
    archivedAt: "archivedAt",
    hasUnsubscribe: "hasUnsubscribe",
    unsubscribeUrl: "unsubscribeUrl",
  },
  activityLog: {
    id: "id",
  },
}));

vi.mock("@/lib/services/gmail", () => ({
  archiveEmail: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...args) => ({ type: "and", args })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { archiveEmail } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";

describe("POST /api/emails/[id]/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when email not found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Email not found or already archived");
  });

  it("returns 400 when email does not have unsubscribe information", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockEmail = {
      id: "email-123",
      externalId: "gmail-123",
      userId: "user123",
      hasUnsubscribe: false,
      unsubscribeUrl: null,
      archivedAt: null,
    };

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Email does not have unsubscribe information");
  });

  it("returns requiresMailto for mailto URLs", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockEmail = {
      id: "email-123",
      externalId: "gmail-123",
      userId: "user123",
      hasUnsubscribe: true,
      unsubscribeUrl: "mailto:unsubscribe@example.com",
      archivedAt: null,
    };

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(false);
    expect(data.requiresMailto).toBe(true);
    expect(data.mailtoUrl).toBe("mailto:unsubscribe@example.com");
  });

  it("successfully unsubscribes via https URL and archives email", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");

    const mockEmail = {
      id: "email-123",
      externalId: "gmail-123",
      userId: "user123",
      hasUnsubscribe: true,
      unsubscribeUrl: "https://example.com/unsubscribe",
      archivedAt: null,
    };

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(archiveEmail).mockResolvedValue(true);

    const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
    const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
    vi.mocked(db.update).mockReturnValue({ set: mockUpdateSet } as any);

    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    // Mock successful fetch to unsubscribe URL
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://example.com/unsubscribe",
      {
        method: "GET",
        redirect: "follow",
      }
    );
    expect(archiveEmail).toHaveBeenCalledWith("mock-token", "gmail-123");
  });

  it("returns 500 when unsubscribe request fails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockEmail = {
      id: "email-123",
      externalId: "gmail-123",
      userId: "user123",
      hasUnsubscribe: true,
      unsubscribeUrl: "https://example.com/unsubscribe",
      archivedAt: null,
    };

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    // Mock failed fetch to unsubscribe URL
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to unsubscribe");
  });

  it("returns 400 for unsupported URL format", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockEmail = {
      id: "email-123",
      externalId: "gmail-123",
      userId: "user123",
      hasUnsubscribe: true,
      unsubscribeUrl: "ftp://example.com/unsubscribe",
      archivedAt: null,
    };

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await POST(new Request("http://localhost"), {
      params: { id: "email-123" },
    });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Unsupported unsubscribe URL format");
  });
});
