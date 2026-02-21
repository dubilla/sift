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
  todoistTasks: {
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

vi.mock("@/lib/services/token", () => ({
  getValidAccessTokenForProvider: vi.fn(),
}));

vi.mock("@/lib/services/todoist", () => ({
  createTask: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { createTask } from "@/lib/services/todoist";

describe("POST /api/todoist/tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as any);

    const request = new Request("http://localhost/api/todoist/tasks", {
      method: "POST",
      body: JSON.stringify({ content: "Test Task" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 400 when task content is missing", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const request = new Request("http://localhost/api/todoist/tasks", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Task content is required");
  });

  it("creates task successfully", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockTask = {
      id: "task123",
      content: "Test Task",
      url: "https://todoist.com/app/task/task123",
    };

    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "todoist-access-token"
    );
    vi.mocked(createTask).mockResolvedValue(mockTask as any);

    const mockValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/todoist/tasks", {
      method: "POST",
      body: JSON.stringify({
        content: "Test Task",
        description: "Test description",
        projectId: "proj123",
        emailId: "email123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.task.id).toBe("task123");
    expect(data.task.url).toBe("https://todoist.com/app/task/task123");
    expect(createTask).toHaveBeenCalledWith("todoist-access-token", {
      content: "Test Task",
      description: "Test description",
      projectId: "proj123",
      dueDate: undefined,
    });
  });

  it("creates task without optional fields", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    const mockTask = {
      id: "task456",
      content: "Test Task",
      url: "https://todoist.com/app/task/task456",
    };

    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "todoist-access-token"
    );
    vi.mocked(createTask).mockResolvedValue(mockTask as any);

    const mockValues = vi.fn().mockResolvedValue({});
    vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

    const request = new Request("http://localhost/api/todoist/tasks", {
      method: "POST",
      body: JSON.stringify({
        content: "Test Task",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(createTask).toHaveBeenCalledWith("todoist-access-token", {
      content: "Test Task",
      description: undefined,
      projectId: undefined,
      dueDate: undefined,
    });
  });

  it("returns 403 when Todoist is not connected", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessTokenForProvider).mockRejectedValue(
      new Error("No todoist account found for user")
    );

    const request = new Request("http://localhost/api/todoist/tasks", {
      method: "POST",
      body: JSON.stringify({
        content: "Test Task",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Todoist not connected");
  });

  it("returns 500 on task creation failure", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user123" },
    } as any);

    vi.mocked(getValidAccessTokenForProvider).mockResolvedValue(
      "todoist-access-token"
    );
    vi.mocked(createTask).mockRejectedValue(new Error("Todoist API error"));

    const request = new Request("http://localhost/api/todoist/tasks", {
      method: "POST",
      body: JSON.stringify({
        content: "Test Task",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to create task");
  });
});
