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
    id: "id",
    userId: "userId",
    archivedAt: "archivedAt",
    deletedAt: "deletedAt",
    externalId: "externalId",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ type: "and", args })),
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  isNull: vi.fn((col) => ({ type: "isNull", col })),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessTokenForProvider: vi.fn(),
}));

vi.mock("@/lib/services/gmail", () => ({
  getFullEmail: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { getFullEmail } from "@/lib/services/gmail";

describe("GET /api/emails/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const response = await GET(
      new Request("http://localhost/api/emails/123"),
      { params: { id: "123" } }
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 401 when session has no user id", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: {},
    } as any);

    const response = await GET(
      new Request("http://localhost/api/emails/123"),
      { params: { id: "123" } }
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when email is not found", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(
      new Request("http://localhost/api/emails/nonexistent"),
      { params: { id: "nonexistent" } }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Email not found");
  });

  it("returns full email with body text and html", async () => {
    const mockEmail = {
      id: "email123",
      userId: "user123",
      externalId: "gmail123",
      subject: "Test Email",
      from: "sender@example.com",
      to: "recipient@example.com",
      snippet: "Test snippet",
      date: new Date("2024-01-15"),
      archivedAt: null,
      deletedAt: null,
    };

    const mockFullEmail = {
      bodyText: "Full email body text content",
      bodyHtml: "<p>Full email body html content</p>",
    };

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "mock-access-token"
    );
    vi.mocked(getFullEmail).mockResolvedValue(mockFullEmail as any);

    const response = await GET(
      new Request("http://localhost/api/emails/email123"),
      { params: { id: "email123" } }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.id).toBe("email123");
    expect(data.subject).toBe("Test Email");
    expect(data.from).toBe("sender@example.com");
    expect(data.bodyText).toBe("Full email body text content");
    expect(data.bodyHtml).toBe("<p>Full email body html content</p>");
    expect(getFullEmail).toHaveBeenCalledWith("mock-access-token", "gmail123");
  });

  it("returns 404 for email belonging to different user", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

    const response = await GET(
      new Request("http://localhost/api/emails/other-user-email"),
      { params: { id: "other-user-email" } }
    );
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Email not found");
  });

  it("returns 500 on database error", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("Database error");
    });

    const response = await GET(
      new Request("http://localhost/api/emails/123"),
      { params: { id: "123" } }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch email");
  });

  it("returns 500 on Gmail API error", async () => {
    const mockEmail = {
      id: "email123",
      userId: "user123",
      externalId: "gmail123",
      subject: "Test Email",
      from: "sender@example.com",
      snippet: "Test snippet",
      date: new Date("2024-01-15"),
    };

    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([mockEmail]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "mock-access-token"
    );
    vi.mocked(getFullEmail).mockRejectedValue(new Error("Gmail API error"));

    const response = await GET(
      new Request("http://localhost/api/emails/email123"),
      { params: { id: "email123" } }
    );
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch email");
  });
});
