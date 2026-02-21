import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import EmailList from "./EmailList";

vi.mock("./EmailMessage", () => ({ default: () => null }));
vi.mock("./FilterModal", () => ({ default: () => null }));
vi.mock("./CreateAsanaTaskModal", () => ({ default: () => null }));
vi.mock("./CreateTodoistTaskModal", () => ({ default: () => null }));
vi.mock("./SyncProgress", () => ({ SyncProgress: () => null }));
vi.mock("@/lib/hooks/useBackgroundSync", () => ({
  useBackgroundSync: () => ({ syncState: { status: "idle" }, startSync: vi.fn() }),
}));

const TODOIST_PATH = "M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z";
const ASANA_PATH =
  "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3.75a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm-4.58 7.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm9.16 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5z";

const mockThread = {
  threadId: "thread-1",
  subject: "Test email subject",
  from: "Sender <sender@example.com>",
  snippet: "Email snippet",
  date: "2024-01-15T10:00:00Z",
  messageCount: 1,
  hasUnsubscribe: false,
  unsubscribeUrl: null,
  latestEmailId: "email-1",
  smartTag: null,
  smartTagIcon: null,
  smartTagColor: null,
};

function setupFetch(taskManager: string) {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url === "/api/user-settings") {
      return Promise.resolve({
        json: () => Promise.resolve({ settings: { taskManager } }),
      });
    }
    if (url.startsWith("/api/threads")) {
      return Promise.resolve({
        json: () => Promise.resolve({ threads: [mockThread], total: 1 }),
      });
    }
    if (url === "/api/emails/classify") {
      return Promise.resolve({
        json: () => Promise.resolve({ tags: [] }),
      });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
}

describe("EmailList — Create task button icon", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("desktop button (title='Create task')", () => {
    it("renders the Todoist icon when taskManager is todoist", async () => {
      setupFetch("todoist");
      render(<EmailList />);

      await waitFor(() => {
        const btn = screen.getByTitle("Create task");
        const path = btn.querySelector("path");
        expect(path?.getAttribute("d")).toBe(TODOIST_PATH);
      });
    });

    it("renders the Asana icon when taskManager is asana", async () => {
      setupFetch("asana");
      render(<EmailList />);

      await waitFor(() => {
        const btn = screen.getByTitle("Create task");
        const path = btn.querySelector("path");
        expect(path?.getAttribute("d")).toBe(ASANA_PATH);
      });
    });

    it("defaults to the Asana icon before user-settings loads", async () => {
      // Delay the user-settings response so we can observe the default state
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/user-settings") {
          return new Promise(() => {}); // never resolves
        }
        if (url.startsWith("/api/threads")) {
          return Promise.resolve({
            json: () => Promise.resolve({ threads: [mockThread], total: 1 }),
          });
        }
        return Promise.resolve({ json: () => Promise.resolve({ tags: [] }) });
      });

      render(<EmailList />);

      await waitFor(() => {
        const btn = screen.getByTitle("Create task");
        const path = btn.querySelector("path");
        expect(path?.getAttribute("d")).toBe(ASANA_PATH);
      });
    });
  });

  describe("mobile menu 'Create task' item", () => {
    async function openMobileMenu() {
      // Wait for the thread row to appear, then open its "More actions" menu
      const moreBtn = await screen.findByTitle("More actions");
      fireEvent.click(moreBtn);
    }

    // The mobile menu item has no title attribute; the desktop button has title="Create task"
    function getMobileCreateTaskBtn() {
      return screen
        .getAllByRole("button", { name: /create task/i })
        .find((el) => !el.hasAttribute("title"))!;
    }

    it("renders the Todoist icon when taskManager is todoist", async () => {
      setupFetch("todoist");
      render(<EmailList />);

      await openMobileMenu();

      const path = getMobileCreateTaskBtn().querySelector("path");
      expect(path?.getAttribute("d")).toBe(TODOIST_PATH);
    });

    it("renders the Asana icon when taskManager is asana", async () => {
      setupFetch("asana");
      render(<EmailList />);

      await openMobileMenu();

      const path = getMobileCreateTaskBtn().querySelector("path");
      expect(path?.getAttribute("d")).toBe(ASANA_PATH);
    });
  });
});
