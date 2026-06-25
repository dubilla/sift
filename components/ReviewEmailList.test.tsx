import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ReviewEmailList from "./ReviewEmailList";

vi.mock("./ApplySimilarModal", () => ({ default: () => null }));

const MOCK_TAGS = [
  { id: "t1", name: "archivable", displayName: "Archive", icon: "📦", count: 10 },
  { id: "t2", name: "unsubscribable", displayName: "Unsubscribe", icon: "🚫", count: 3 },
  { id: "t3", name: "asana_task", displayName: "Asana Task", icon: "📋", count: 2 },
  { id: "t4", name: "quick_action", displayName: "Quick Action", icon: "⚡", count: 0 },
];

function makeEmail(id: string, tagName: string) {
  const tag = MOCK_TAGS.find((t) => t.name === tagName)!;
  return {
    id,
    subject: `Email ${id}`,
    from: `sender-${id}@example.com`,
    snippet: `Snippet for ${id}`,
    date: "2024-01-15T10:00:00Z",
    currentTag: {
      id: tag.id,
      name: tag.name,
      displayName: tag.displayName,
      icon: tag.icon,
      color: null,
    },
    confidence: 0.85,
    source: "rule",
  };
}

function setupFetch({
  emails = [] as ReturnType<typeof makeEmail>[],
  hasMore = false,
}: {
  emails?: ReturnType<typeof makeEmail>[];
  hasMore?: boolean;
} = {}) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/emails/classify") {
      return Promise.resolve({
        json: () => Promise.resolve({ tags: MOCK_TAGS }),
      });
    }
    if (url.startsWith("/api/classifications/review")) {
      return Promise.resolve({
        json: () => Promise.resolve({ emails, hasMore, page: 1 }),
      });
    }
    if (url === "/api/emails/batch-action") {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            summary: { total: emails.length, succeeded: emails.length, failed: 0 },
            results: emails.map((e) => ({ emailId: e.id, action: "archive", success: true })),
          }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("ReviewEmailList", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("auto-selects the first tag with emails on load", async () => {
    setupFetch({
      emails: [makeEmail("e1", "archivable"), makeEmail("e2", "archivable")],
    });

    render(<ReviewEmailList />);

    await waitFor(() => {
      expect(screen.getByText("Email e1")).toBeDefined();
    });

    // The /api/classifications/review call should have included tag=archivable
    const reviewCalls = vi.mocked(global.fetch).mock.calls.filter(
      (call) => (call[0] as string).startsWith("/api/classifications/review")
    );
    expect(reviewCalls.length).toBeGreaterThan(0);
    const lastReviewUrl = reviewCalls[reviewCalls.length - 1][0] as string;
    expect(lastReviewUrl).toContain("tag=archivable");
  });

  it("shows tag step buttons in review order", async () => {
    setupFetch({
      emails: [makeEmail("e1", "archivable")],
    });

    render(<ReviewEmailList />);

    await waitFor(() => {
      expect(screen.getByText("Archive")).toBeDefined();
      expect(screen.getByText("Unsubscribe")).toBeDefined();
      expect(screen.getByText("Asana Task")).toBeDefined();
      expect(screen.getByText("Quick Action")).toBeDefined();
      expect(screen.getByText("All")).toBeDefined();
    });
  });

  it("displays action indicators per email", async () => {
    setupFetch({
      emails: [makeEmail("e1", "archivable")],
    });

    render(<ReviewEmailList />);

    await waitFor(() => {
      expect(screen.getByText("archive")).toBeDefined();
    });
  });

  it("calls batch-action endpoint when Approve Page is clicked", async () => {
    const emails = [makeEmail("e1", "archivable"), makeEmail("e2", "archivable")];
    setupFetch({ emails });

    render(<ReviewEmailList />);

    await waitFor(() => {
      expect(screen.getByText("Email e1")).toBeDefined();
    });

    const approveButton = screen.getByText("Approve Page (2 actions)");
    fireEvent.click(approveButton);

    await waitFor(() => {
      const batchCalls = vi.mocked(global.fetch).mock.calls.filter(
        (call) => call[0] === "/api/emails/batch-action"
      );
      expect(batchCalls.length).toBe(1);

      const body = JSON.parse(batchCalls[0][1]!.body as string);
      expect(body.actions).toHaveLength(2);
      expect(body.actions[0].action).toBe("archive");
      expect(body.actions[1].action).toBe("archive");
    });
  });

  it("excludes unchecked emails from batch action", async () => {
    const emails = [makeEmail("e1", "archivable"), makeEmail("e2", "archivable")];
    setupFetch({ emails });

    render(<ReviewEmailList />);

    await waitFor(() => {
      expect(screen.getByText("Email e1")).toBeDefined();
    });

    // Uncheck the first email (checkboxes are checked by default)
    const checkboxes = screen.getAllByRole("checkbox");
    // First checkbox after the "low confidence" checkbox is the email checkbox
    const emailCheckboxes = checkboxes.filter(
      (cb) => cb.getAttribute("title") !== null
    );
    fireEvent.click(emailCheckboxes[0]);

    // Approve button should now show 1 action
    await waitFor(() => {
      expect(screen.getByText("Approve Page (1 action)")).toBeDefined();
    });
  });

  it("shows empty state with advance button when tag is exhausted", async () => {
    // Return empty for archivable, but tags have counts for unsubscribable
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/emails/classify") {
        return Promise.resolve({
          json: () => Promise.resolve({ tags: MOCK_TAGS }),
        });
      }
      if (url.startsWith("/api/classifications/review")) {
        callCount++;
        if (callCount <= 2) {
          // First call (archivable) returns empty, second call (after advance) returns emails
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                emails:
                  callCount === 1
                    ? []
                    : [makeEmail("e1", "unsubscribable")],
                hasMore: false,
                page: 1,
              }),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve({ emails: [], hasMore: false, page: 1 }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    render(<ReviewEmailList />);

    // After auto-advancing past empty archivable, should show unsubscribable emails
    await waitFor(() => {
      expect(screen.getByText("Email e1")).toBeDefined();
    });
  });

  it("shows quick_action emails with no action indicator", async () => {
    // Set up so quick_action is the only tag with emails
    const tagsWithOnlyQuickAction = MOCK_TAGS.map((t) => ({
      ...t,
      count: t.name === "quick_action" ? 5 : 0,
    }));

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/emails/classify") {
        return Promise.resolve({
          json: () => Promise.resolve({ tags: tagsWithOnlyQuickAction }),
        });
      }
      if (url.startsWith("/api/classifications/review")) {
        const urlObj = new URL(url, "http://localhost");
        const tag = urlObj.searchParams.get("tag");
        if (tag === "quick_action") {
          return Promise.resolve({
            json: () =>
              Promise.resolve({
                emails: [makeEmail("e1", "quick_action")],
                hasMore: false,
                page: 1,
              }),
          });
        }
        return Promise.resolve({
          json: () => Promise.resolve({ emails: [], hasMore: false, page: 1 }),
        });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    render(<ReviewEmailList />);

    await waitFor(() => {
      expect(screen.getByText("no action")).toBeDefined();
    });
  });
});
