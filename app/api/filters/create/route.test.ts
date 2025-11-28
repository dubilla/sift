import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  activityLog: {
    id: "id",
  },
}));

vi.mock("@/lib/services/gmail", () => ({
  createFilter: vi.fn(),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessToken: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { createFilter } from "@/lib/services/gmail";
import { getValidAccessToken } from "@/lib/services/token";

describe("POST /api/filters/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ senderEmail: "test@example.com" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when senderEmail is missing", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Sender email is required");
  });

  it("successfully creates filter without applying to existing emails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");
    vi.mocked(createFilter).mockResolvedValue({
      id: "filter-123",
      senderEmail: "newsletter@example.com",
      archived: 0,
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        senderEmail: "newsletter@example.com",
        applyToExisting: false,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.filterId).toBe("filter-123");
    expect(data.senderEmail).toBe("newsletter@example.com");
    expect(data.archivedCount).toBe(0);

    expect(getValidAccessToken).toHaveBeenCalledWith("user123");
    expect(createFilter).toHaveBeenCalledWith(
      "mock-token",
      "newsletter@example.com",
      false
    );
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user123",
        action: "create_filter",
      })
    );
  });

  it("successfully creates filter and applies to existing emails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");
    vi.mocked(createFilter).mockResolvedValue({
      id: "filter-123",
      senderEmail: "spam@example.com",
      archived: 15,
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        senderEmail: "spam@example.com",
        applyToExisting: true,
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.filterId).toBe("filter-123");
    expect(data.senderEmail).toBe("spam@example.com");
    expect(data.archivedCount).toBe(15);

    expect(createFilter).toHaveBeenCalledWith(
      "mock-token",
      "spam@example.com",
      true
    );
  });

  it("defaults applyToExisting to false when not provided", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");
    vi.mocked(createFilter).mockResolvedValue({
      id: "filter-123",
      senderEmail: "test@example.com",
      archived: 0,
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        senderEmail: "test@example.com",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createFilter).toHaveBeenCalledWith(
      "mock-token",
      "test@example.com",
      false
    );
  });

  it("returns 500 when filter creation fails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");
    vi.mocked(createFilter).mockRejectedValue(
      new Error("Gmail API error: Filter limit reached")
    );

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        senderEmail: "test@example.com",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create filter");
  });

  it("returns 500 when access token cannot be retrieved", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockRejectedValue(
      new Error("No account found for user")
    );

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        senderEmail: "test@example.com",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create filter");
  });

  it("logs activity for created filter", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessToken).mockResolvedValue("mock-token");
    vi.mocked(createFilter).mockResolvedValue({
      id: "filter-123",
      senderEmail: "test@example.com",
      archived: 0,
    });

    const mockValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        senderEmail: "test@example.com",
      }),
    });

    await POST(request);

    expect(db.insert).toHaveBeenCalled();
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user123",
        action: "create_filter",
      })
    );
  });
});
