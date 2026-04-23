import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  crewSettings: {
    userId: "userId",
    baseUrl: "baseUrl",
    apiToken: "apiToken",
  },
  crewTasks: {
    id: "id",
    userId: "userId",
    emailId: "emailId",
  },
  activityLog: {
    id: "id",
    userId: "userId",
    action: "action",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

vi.mock("@/lib/services/crew", () => ({
  createTask: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { createTask } from "@/lib/services/crew";

function mockSettingsFound(settings: { baseUrl: string; apiToken: string }) {
  const limit = vi.fn().mockResolvedValue([settings]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as any);
}

function mockSettingsMissing() {
  const limit = vi.fn().mockResolvedValue([]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  vi.mocked(db.select).mockReturnValue({ from } as any);
}

describe("POST /api/crew/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/crew/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when title is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);

    const request = new Request("http://localhost/api/crew/tasks", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Task title is required");
  });

  it("returns 403 when Crew is not connected", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockSettingsMissing();

    const request = new Request("http://localhost/api/crew/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Crew not connected");
  });

  it("creates task successfully", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockSettingsFound({
      baseUrl: "https://crew.example.com",
      apiToken: "token-abc",
    });

    vi.mocked(createTask).mockResolvedValue({
      id: "task-123",
      title: "Test",
      url: "https://crew.example.com/tasks/task-123",
    });

    const mockValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/crew/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: "Test",
        description: "desc",
        assignee: "agent",
        emailId: "email-1",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.task.id).toBe("task-123");
    expect(data.task.url).toBe("https://crew.example.com/tasks/task-123");
    expect(createTask).toHaveBeenCalledWith(
      "https://crew.example.com",
      "token-abc",
      {
        title: "Test",
        description: "desc",
        dueDate: undefined,
        assignee: "agent",
      }
    );
  });

  it("returns 500 when Crew API fails", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as any);
    mockSettingsFound({
      baseUrl: "https://crew.example.com",
      apiToken: "token-abc",
    });

    vi.mocked(createTask).mockRejectedValue(new Error("Crew API error: 500"));

    const request = new Request("http://localhost/api/crew/tasks", {
      method: "POST",
      body: JSON.stringify({ title: "Test" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create task");
  });
});
