import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTask } from "./crew";

describe("crew service", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createTask", () => {
    it("posts to /api/v1/tasks with bearer token and returns task with URL", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ task: { id: "task-abc", title: "Test" } }),
      } as Response);

      const result = await createTask(
        "https://crew.example.com",
        "my-api-key",
        { title: "Test", description: "desc" }
      );

      expect(fetch).toHaveBeenCalledWith(
        "https://crew.example.com/api/v1/tasks",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer my-api-key",
            "Content-Type": "application/json",
          }),
        })
      );

      const call = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse((call[1]?.body as string) || "{}");
      expect(body).toEqual({
        title: "Test",
        description: "desc",
        dueDate: undefined,
        assignee: "user",
      });

      expect(result).toEqual({
        id: "task-abc",
        title: "Test",
        url: "https://crew.example.com/tasks/task-abc",
      });
    });

    it("strips trailing slash from baseUrl when constructing URLs", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ task: { id: "task-1", title: "T" } }),
      } as Response);

      const result = await createTask("https://crew.example.com/", "key", {
        title: "T",
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://crew.example.com/api/v1/tasks",
        expect.anything()
      );
      expect(result.url).toBe("https://crew.example.com/tasks/task-1");
    });

    it("defaults assignee to 'user' when not provided", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ task: { id: "t", title: "T" } }),
      } as Response);

      await createTask("https://crew.example.com", "key", { title: "T" });

      const body = JSON.parse(
        (vi.mocked(fetch).mock.calls[0][1]?.body as string) || "{}"
      );
      expect(body.assignee).toBe("user");
    });

    it("passes through 'agent' assignee", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ task: { id: "t", title: "T" } }),
      } as Response);

      await createTask("https://crew.example.com", "key", {
        title: "T",
        assignee: "agent",
      });

      const body = JSON.parse(
        (vi.mocked(fetch).mock.calls[0][1]?.body as string) || "{}"
      );
      expect(body.assignee).toBe("agent");
    });

    it("throws with status code when Crew returns non-2xx", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      } as Response);

      await expect(
        createTask("https://crew.example.com", "bad-key", { title: "T" })
      ).rejects.toThrow("Crew API error: 401");
    });
  });
});
