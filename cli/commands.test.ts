// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./credentials", () => ({
  loadCredential: vi.fn(),
  saveCredential: vi.fn(),
  deleteCredential: vi.fn(),
}));

import { DEFAULT_API_URL, main } from "./commands";
import { deleteCredential, loadCredential } from "./credentials";
import type { EmailDetail, EmailsReport, HealthReport } from "../lib/diagnostics";

const report: HealthReport = {
  window: { since: "24h", from: "2026-10-10T12:00:00.000Z", to: "2026-10-11T12:00:00.000Z" },
  user_stats: { last_synced_at: "2026-10-11T11:30:00.000Z" },
  emails: { ingested: 40, tagged: 31, untagged: 9 },
  classification_corrections: 3,
  integration_tasks: { asana: 2, todoist: 0, crew: 1 },
  warnings: ["Last sync was more than 6h ago."],
};

function run(argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = main(argv, { out: (l) => out.push(l), err: (l) => err.push(l) });
  return code.then((exitCode) => ({ exitCode, out: out.join("\n"), err: err.join("\n") }));
}

const fetchMock = vi.fn<typeof fetch>();

describe("sift CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SIFT_API_URL", "");
    vi.mocked(loadCredential).mockResolvedValue({
      token: "sift_mobile_abc",
      expiresAt: "2099-01-01T00:00:00.000Z",
      email: "me@example.com",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  describe("health", () => {
    it("fails with a login hint when not logged in", async () => {
      vi.mocked(loadCredential).mockResolvedValue(null);

      const result = await run(["health"]);

      expect(result.exitCode).toBe(1);
      expect(result.err).toContain("Not logged in");
      expect(result.err).toContain("sift login");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails without calling the API when the stored token has expired", async () => {
      vi.mocked(loadCredential).mockResolvedValue({
        token: "sift_mobile_abc",
        expiresAt: "2000-01-01T00:00:00.000Z",
        email: "me@example.com",
      });

      const result = await run(["health"]);

      expect(result.exitCode).toBe(1);
      expect(result.err).toContain("expired");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fails with a login hint when the server rejects the token", async () => {
      fetchMock.mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));

      const result = await run(["health"]);

      expect(result.exitCode).toBe(1);
      expect(result.err).toContain("sift login");
    });

    it("sends the bearer token to the default API and prints a table", async () => {
      fetchMock.mockResolvedValue(Response.json(report));

      const result = await run(["health", "--since", "7d"]);

      expect(result.exitCode).toBe(0);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_API_URL}/api/diagnostics/health?since=7d`);
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer sift_mobile_abc"
      );
      expect(result.out).toMatch(/Emails ingested\s+40/);
      expect(result.out).toMatch(/untagged\s+9/);
      expect(result.out).toContain("! Last sync was more than 6h ago.");
    });

    it("prints raw JSON with --json and honors SIFT_API_URL", async () => {
      vi.stubEnv("SIFT_API_URL", "http://localhost:3003/");
      fetchMock.mockResolvedValue(Response.json(report));

      const result = await run(["health", "--json"]);

      expect(fetchMock.mock.calls[0][0]).toBe(
        "http://localhost:3003/api/diagnostics/health?since=24h"
      );
      expect(loadCredential).toHaveBeenCalledWith("http://localhost:3003");
      expect(JSON.parse(result.out)).toEqual(report);
    });

    it("rejects an invalid --since before calling the API", async () => {
      const result = await run(["health", "--since", "1w"]);

      expect(result.exitCode).toBe(2);
      expect(result.err).toContain("Invalid --since");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("explains Vercel deployment protection instead of following the redirect", async () => {
      fetchMock.mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://vercel.com/sso-api?url=x" },
        })
      );

      const result = await run(["health"]);

      expect(result.exitCode).toBe(1);
      expect(result.err).toContain("deployment protection");
      expect(result.err).toContain("SIFT_API_URL");
      expect(fetchMock.mock.calls[0][1]?.redirect).toBe("manual");
    });
  });

  describe("emails", () => {
    const emailsReport: EmailsReport = {
      window: { since: "24h", from: "2026-10-10T12:00:00.000Z", to: "2026-10-11T12:00:00.000Z" },
      count: 2,
      emails: [
        {
          id: "e1",
          externalId: "gmail-1",
          threadId: "t1",
          date: "2026-10-11T10:00:00.000Z",
          archivedAt: null,
          deletedAt: null,
          tags: [],
          hasUnsubscribe: false,
          tasks: { asana: ["a1"], todoist: [], crew: [] },
        },
        {
          id: "e2",
          externalId: "gmail-2",
          threadId: null,
          date: "2026-10-11T09:00:00.000Z",
          archivedAt: "2026-10-11T09:30:00.000Z",
          deletedAt: null,
          tags: ["archivable"],
          hasUnsubscribe: true,
          tasks: { asana: [], todoist: [], crew: [] },
        },
      ],
    };

    it("fails with a login hint when not logged in", async () => {
      vi.mocked(loadCredential).mockResolvedValue(null);

      const result = await run(["emails"]);

      expect(result.exitCode).toBe(1);
      expect(result.err).toContain("sift login");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps flags to the query string and prints a table", async () => {
      fetchMock.mockResolvedValue(Response.json(emailsReport));

      const result = await run(["emails", "--since", "7d", "--untagged", "--archived", "--limit", "100"]);

      expect(result.exitCode).toBe(0);
      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(url.pathname).toBe("/api/diagnostics/emails");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        since: "7d",
        limit: "100",
        untagged: "1",
        archived: "1",
      });
      expect(result.out).toMatch(/e1\s+2026-10-11T10:00:00.000Z\s+inbox\s+\(untagged\)\s+asana/);
      expect(result.out).toMatch(/e2\s+.*archived\s+archivable/);
      expect(result.out).not.toContain("SUBJECT");
    });

    it("sends defaults and prints raw JSON with --json", async () => {
      fetchMock.mockResolvedValue(Response.json(emailsReport));

      const result = await run(["emails", "--json"]);

      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(Object.fromEntries(url.searchParams)).toEqual({ since: "24h", limit: "50" });
      expect(JSON.parse(result.out)).toEqual(emailsReport);
    });

    it("maps --deleted", async () => {
      fetchMock.mockResolvedValue(Response.json({ ...emailsReport, count: 0, emails: [] }));

      const result = await run(["emails", "--deleted"]);

      const url = new URL(fetchMock.mock.calls[0][0] as string);
      expect(url.searchParams.get("deleted")).toBe("1");
      expect(result.out).toContain("No emails");
    });

    it("rejects --archived with --deleted before calling the API", async () => {
      const result = await run(["emails", "--archived", "--deleted"]);

      expect(result.exitCode).toBe(2);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(["0", "201", "abc", "1.5"])("rejects --limit %s", async (limit) => {
      const result = await run(["emails", "--limit", limit]);

      expect(result.exitCode).toBe(2);
      expect(result.err).toContain("Invalid --limit");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an invalid --since", async () => {
      const result = await run(["emails", "--since", "1w"]);

      expect(result.exitCode).toBe(2);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("email", () => {
    const detail: EmailDetail = {
      email: {
        id: "e1",
        externalId: "gmail-1",
        threadId: "t1",
        date: "2026-10-11T10:00:00.000Z",
        createdAt: "2026-10-11T10:05:00.000Z",
        archivedAt: null,
        deletedAt: null,
        hasUnsubscribe: false,
      },
      tags: [{ name: "archivable", source: "llm", confidence: 0.9, classifiedAt: "2026-10-11T10:06:00.000Z" }],
      corrections: [
        {
          id: "c1",
          oldTag: "archivable",
          newTag: "quick_action",
          oldSource: "llm",
          oldConfidence: 0.7,
          correctedAt: "2026-10-11T11:00:00.000Z",
          appliedToSimilar: false,
        },
      ],
      activity: [{ id: "l1", action: "archive", createdAt: "2026-10-11T12:00:00.000Z" }],
      integrationTasks: [
        {
          provider: "asana",
          id: "at1",
          taskId: "gid-1",
          url: "https://asana.test/1",
          createdAt: "2026-10-11T10:30:00.000Z",
        },
      ],
    };

    it("requires exactly one id", async () => {
      for (const argv of [["email"], ["email", "a", "b"]]) {
        const result = await run(argv);
        expect(result.exitCode).toBe(2);
        expect(result.err).toContain("Usage: sift email <id>");
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches by id without content and prints the sections", async () => {
      fetchMock.mockResolvedValue(Response.json(detail));

      const result = await run(["email", "gmail/1"]);

      expect(result.exitCode).toBe(0);
      expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_API_URL}/api/diagnostics/emails/gmail%2F1`);
      expect(result.out).toContain("archivable [llm 0.90]");
      expect(result.out).toContain("archivable -> quick_action");
      expect(result.out).toContain("archive");
      expect(result.out).toContain("asana gid-1");
      expect(result.out).not.toContain("Subject");
    });

    it("sends content=1 with --show-content and prints content fields", async () => {
      fetchMock.mockResolvedValue(
        Response.json({ ...detail, email: { ...detail.email, subject: "Hello", from: "a@b.c", snippet: "hi" } })
      );

      const result = await run(["email", "e1", "--show-content"]);

      expect(fetchMock.mock.calls[0][0]).toBe(`${DEFAULT_API_URL}/api/diagnostics/emails/e1?content=1`);
      expect(result.out).toMatch(/Subject\s+Hello/);
      expect(result.out).toMatch(/From\s+a@b.c/);
    });

    it("prints raw JSON with --json", async () => {
      fetchMock.mockResolvedValue(Response.json(detail));

      const result = await run(["email", "e1", "--json"]);

      expect(JSON.parse(result.out)).toEqual(detail);
    });

    it("reports a missing email", async () => {
      fetchMock.mockResolvedValue(Response.json({ error: "Email not found" }, { status: 404 }));

      const result = await run(["email", "nope"]);

      expect(result.exitCode).toBe(1);
      expect(result.err).toContain("Email not found");
    });
  });

  describe("logout", () => {
    it("revokes the token on the server and deletes it locally", async () => {
      fetchMock.mockResolvedValue(Response.json({ success: true }));

      const result = await run(["logout"]);

      expect(result.exitCode).toBe(0);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${DEFAULT_API_URL}/api/mobile/auth/logout`);
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).authorization).toBe(
        "Bearer sift_mobile_abc"
      );
      expect(deleteCredential).toHaveBeenCalledWith(DEFAULT_API_URL);
    });

    it("still deletes the local token when the server is unreachable", async () => {
      fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

      const result = await run(["logout"]);

      expect(result.exitCode).toBe(0);
      expect(result.err).toContain("could not revoke");
      expect(deleteCredential).toHaveBeenCalled();
    });
  });

  it("exits 2 on an unknown command", async () => {
    const result = await run(["frobnicate"]);

    expect(result.exitCode).toBe(2);
    expect(result.err).toContain("Unknown command");
  });

  it("exits 2 on an unknown option", async () => {
    const result = await run(["health", "--bogus"]);

    expect(result.exitCode).toBe(2);
  });
});
