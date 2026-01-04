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
  asanaTasks: {
    id: "id",
    userId: "userId",
    emailId: "emailId",
  },
  activityLog: {
    id: "id",
    userId: "userId",
    action: "action",
  },
  asanaSettings: {
    userId: "userId",
    asanaUserGid: "asanaUserGid",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
}));

vi.mock("@/lib/services/token", () => ({
  getValidAccessTokenForProvider: vi.fn(),
}));

vi.mock("@/lib/services/asana", () => ({
  createTask: vi.fn(),
  getCurrentUser: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { createTask, getCurrentUser } from "@/lib/services/asana";

describe("POST /api/asana/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({ name: "Test Task", workspaceGid: "ws123" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when task name is missing", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({ workspaceGid: "ws123" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Task name is required");
  });

  it("returns 400 when workspace is missing", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({ name: "Test Task" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Workspace is required");
  });

  it("creates task with assignee when asanaUserGid exists in settings", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockSettings = {
      userId: "user123",
      asanaUserGid: "asana-user-123",
    };

    const mockTask = {
      gid: "task123",
      name: "Test Task",
      permalink_url: "https://app.asana.com/0/task123",
    };

    const mockLimit = vi.fn().mockResolvedValue([mockSettings]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "asana-access-token"
    );
    vi.mocked(createTask).mockResolvedValue(mockTask as any);

    const mockValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Task",
        notes: "Test notes",
        workspaceGid: "ws123",
        projectGid: "proj123",
        emailId: "email123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.task.gid).toBe("task123");
    expect(createTask).toHaveBeenCalledWith("asana-access-token", {
      name: "Test Task",
      notes: "Test notes",
      projectGid: "proj123",
      workspaceGid: "ws123",
      dueOn: undefined,
      assigneeGid: "asana-user-123",
    });
  });

  it("fetches and stores asanaUserGid when not in settings", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockSettings = {
      userId: "user123",
      asanaUserGid: null,
    };

    const mockAsanaUser = {
      gid: "asana-user-456",
      name: "Test User",
      email: "test@example.com",
    };

    const mockTask = {
      gid: "task456",
      name: "Test Task",
      permalink_url: "https://app.asana.com/0/task456",
    };

    const mockLimit = vi.fn().mockResolvedValue([mockSettings]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "asana-access-token"
    );
    vi.mocked(getCurrentUser).mockResolvedValue(mockAsanaUser as any);
    vi.mocked(createTask).mockResolvedValue(mockTask as any);

    const mockSet = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

    const mockValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Task",
        workspaceGid: "ws123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(getCurrentUser).toHaveBeenCalledWith("asana-access-token");
    expect(createTask).toHaveBeenCalledWith("asana-access-token", {
      name: "Test Task",
      notes: undefined,
      projectGid: undefined,
      workspaceGid: "ws123",
      dueOn: undefined,
      assigneeGid: "asana-user-456",
    });
    expect(mockSet).toHaveBeenCalledWith({ asanaUserGid: "asana-user-456" });
  });

  it("creates task without assignee when getCurrentUser fails", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "asana-access-token"
    );
    vi.mocked(getCurrentUser).mockRejectedValue(
      new Error("Failed to get user")
    );

    const mockTask = {
      gid: "task789",
      name: "Test Task",
      permalink_url: "https://app.asana.com/0/task789",
    };

    vi.mocked(createTask).mockResolvedValue(mockTask as any);

    const mockValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Task",
        workspaceGid: "ws123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(createTask).toHaveBeenCalledWith("asana-access-token", {
      name: "Test Task",
      notes: undefined,
      projectGid: undefined,
      workspaceGid: "ws123",
      dueOn: undefined,
      assigneeGid: undefined,
    });
  });

  it("returns 403 when Asana is not connected", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessTokenForProvider).mockRejectedValue(
      new Error("No asana account found for user")
    );

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Task",
        workspaceGid: "ws123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Asana not connected");
  });

  it("returns 500 on task creation failure", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockLimit = vi.fn().mockResolvedValue([]);
    const mockWhere = vi.fn(() => ({ limit: mockLimit }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));

    vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);
    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "asana-access-token"
    );
    vi.mocked(createTask).mockRejectedValue(new Error("Asana API error"));

    const request = new Request("http://localhost/api/asana/tasks", {
      method: "POST",
      body: JSON.stringify({
        name: "Test Task",
        workspaceGid: "ws123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create task");
  });
});
