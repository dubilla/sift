import { spawn } from "child_process";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { hostname } from "os";
import { parseArgs } from "util";
import {
  DEFAULT_EMAIL_LIMIT,
  DEFAULT_SINCE,
  MAX_EMAIL_LIMIT,
  parseSince,
  type EmailDetail,
  type EmailsReport,
  type HealthReport,
} from "../lib/diagnostics";
import { deleteCredential, loadCredential, saveCredential, type Credential } from "./credentials";
import { formatEmailDetail, formatEmailsTable, formatHealthTable } from "./format";

// The production deployment. Override with SIFT_API_URL (e.g. http://localhost:3003
// for local dev, or a preview deployment URL).
export const DEFAULT_API_URL = "https://sift-cherryroad.vercel.app";

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export const USAGE = `Usage: sift <command> [options]

Commands:
  login                 Sign in through the browser and store a token
  logout                Revoke the stored token and delete it
  health [--since 24h] [--json]
                        Show sync/classification health for your account
  emails [--since 24h] [--untagged] [--archived|--deleted] [--limit 50] [--show-content] [--json]
                        List recent emails (ids, tags, linked tasks; no content)
  email <id> [--show-content] [--json]
                        Tags, corrections, activity and tasks for one email
                        (<id> is the Sift id or the Gmail message id)

Environment:
  SIFT_API_URL          API base URL (default: ${DEFAULT_API_URL})`;

export class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
  }
}

export interface Io {
  out: (line: string) => void;
  err: (line: string) => void;
}

const consoleIo: Io = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

export function apiUrl(): string {
  return (process.env.SIFT_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
}

async function apiFetch(
  base: string,
  path: string,
  init: RequestInit = {},
  { allowRedirect = false } = {}
): Promise<Response> {
  let response: Response;
  try {
    // Manual redirects so a deployment-protection bounce is reported, not followed.
    response = await fetch(`${base}${path}`, { ...init, redirect: "manual" });
  } catch (error) {
    throw new CliError(`Could not reach ${base}: ${(error as Error).message}`);
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "";
    if (/vercel\.com\/(sso-api|login)/.test(location)) {
      throw new CliError(
        `${base} is behind Vercel deployment protection. ` +
          "Set SIFT_API_URL to Sift's public production URL (or http://localhost:3003)."
      );
    }
    if (!allowRedirect) {
      throw new CliError(`Unexpected redirect from ${base}${path} to ${location || "(none)"}`);
    }
  }

  return response;
}

async function requireCredential(base: string): Promise<Credential> {
  const credential = await loadCredential(base);
  if (!credential) {
    throw new CliError(`Not logged in to ${base}. Run \`sift login\` first.`);
  }
  if (new Date(credential.expiresAt).getTime() <= Date.now()) {
    throw new CliError(`Your session for ${base} expired. Run \`sift login\` again.`);
  }
  return credential;
}

// GET a diagnostics endpoint as the logged-in user and parse the JSON body.
async function diagnosticsGet<T>(path: string, what: string): Promise<T> {
  const base = apiUrl();
  const credential = await requireCredential(base);
  const response = await apiFetch(base, path, {
    headers: { authorization: `Bearer ${credential.token}` },
  });

  if (response.status === 401) {
    throw new CliError(
      `Your session for ${base} is no longer valid (expired or revoked). Run \`sift login\` again.`
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CliError(`${what} failed (${response.status}): ${body?.error ?? response.statusText}`);
  }
  return (await response.json()) as T;
}

function checkSince(since: string): void {
  if (parseSince(since) === null) {
    throw new CliError(`Invalid --since ${JSON.stringify(since)}; use e.g. 30m, 24h, 7d (max 30d).`, 2);
  }
}

export async function health(args: string[], io: Io = consoleIo): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      since: { type: "string", default: DEFAULT_SINCE },
      json: { type: "boolean", default: false },
    },
  });
  const since = values.since!;
  checkSince(since);

  const report = await diagnosticsGet<HealthReport>(
    `/api/diagnostics/health?since=${encodeURIComponent(since)}`,
    "Health check"
  );
  io.out(values.json ? JSON.stringify(report, null, 2) : formatHealthTable(report));
}

export async function emails(args: string[], io: Io = consoleIo): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      since: { type: "string", default: DEFAULT_SINCE },
      untagged: { type: "boolean", default: false },
      archived: { type: "boolean", default: false },
      deleted: { type: "boolean", default: false },
      limit: { type: "string", default: String(DEFAULT_EMAIL_LIMIT) },
      "show-content": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  const since = values.since!;
  checkSince(since);
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EMAIL_LIMIT) {
    throw new CliError(`Invalid --limit ${JSON.stringify(values.limit)}; use 1 to ${MAX_EMAIL_LIMIT}.`, 2);
  }
  if (values.archived && values.deleted) {
    throw new CliError("--archived and --deleted can't be combined; pick one.", 2);
  }

  const query = new URLSearchParams({ since, limit: String(limit) });
  if (values.untagged) query.set("untagged", "1");
  if (values.archived) query.set("archived", "1");
  if (values.deleted) query.set("deleted", "1");
  if (values["show-content"]) query.set("content", "1");

  const report = await diagnosticsGet<EmailsReport>(`/api/diagnostics/emails?${query}`, "Listing emails");
  io.out(values.json ? JSON.stringify(report, null, 2) : formatEmailsTable(report));
}

export async function email(args: string[], io: Io = consoleIo): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "show-content": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  if (positionals.length !== 1) {
    throw new CliError("Usage: sift email <id> [--show-content] [--json]", 2);
  }

  const query = values["show-content"] ? "?content=1" : "";
  const detail = await diagnosticsGet<EmailDetail>(
    `/api/diagnostics/emails/${encodeURIComponent(positionals[0])}${query}`,
    "Fetching email"
  );
  io.out(values.json ? JSON.stringify(detail, null, 2) : formatEmailDetail(detail));
}

function openBrowser(url: string): void {
  const [command, ...args] =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", () => {});
    child.unref();
  } catch {
    // The URL is printed too; opening the browser is best-effort.
  }
}

const CALLBACK_PAGE = (message: string) =>
  `<!doctype html><meta charset="utf-8"><title>Sift CLI</title><p>${message}</p>`;

// Listen on an ephemeral 127.0.0.1 port (RFC 8252 loopback redirect) and resolve
// with the auth code the server's mobile callback page redirects back to us.
async function listenForCode(): Promise<{ redirectUri: string; code: Promise<string>; close: () => void }> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  let timer: NodeJS.Timeout | undefined;
  const close = () => {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
  };

  const code = new Promise<string>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new CliError("Timed out waiting for the browser sign-in.")),
      LOGIN_TIMEOUT_MS
    );
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      if (code) {
        res.end(CALLBACK_PAGE("Signed in to the Sift CLI. You can close this tab."));
        resolve(code);
      } else {
        res.end(CALLBACK_PAGE("Sign-in failed. Return to your terminal."));
        reject(new CliError(`Sign-in failed: ${error ?? "no code returned"}`));
      }
    });
  });

  return { redirectUri, code, close };
}

export async function login(args: string[], io: Io = consoleIo): Promise<void> {
  const { values } = parseArgs({
    args,
    options: { "no-browser": { type: "boolean", default: false } },
  });
  const base = apiUrl();
  const listener = await listenForCode();

  try {
    const startUrl = `${base}/api/mobile/auth/start?redirect_uri=${encodeURIComponent(listener.redirectUri)}`;
    // Fail fast (before the browser opens) if the server rejects the redirect or
    // the deployment is protected.
    const start = await apiFetch(base, startUrl.slice(base.length), {}, { allowRedirect: true });
    if (start.status >= 400) {
      const body = await start.json().catch(() => null);
      throw new CliError(`Sign-in could not start (${start.status}): ${body?.error ?? start.statusText}`);
    }

    io.err(`Opening your browser to sign in to ${base}...`);
    io.err(`If it doesn't open, visit:\n  ${startUrl}`);
    if (!values["no-browser"]) openBrowser(startUrl);

    const code = await listener.code;
    const response = await apiFetch(base, "/api/mobile/auth/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code,
        redirectUri: listener.redirectUri,
        deviceName: `sift-cli (${hostname()})`,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.token !== "string") {
      throw new CliError(`Sign-in failed (${response.status}): ${body?.error ?? "no token returned"}`);
    }

    await saveCredential(base, {
      token: body.token,
      expiresAt: body.expiresAt,
      email: body.user?.email ?? "",
    });
    io.out(`Logged in to ${base} as ${body.user?.email ?? "unknown user"}.`);
  } finally {
    listener.close();
  }
}

export async function logout(_args: string[], io: Io = consoleIo): Promise<void> {
  const base = apiUrl();
  const credential = await loadCredential(base);
  if (!credential) {
    io.out(`Not logged in to ${base}.`);
    return;
  }

  try {
    const response = await apiFetch(base, "/api/mobile/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${credential.token}` },
    });
    if (!response.ok) io.err(`Warning: server returned ${response.status} revoking the token.`);
  } catch (error) {
    io.err(`Warning: could not revoke the token on the server: ${(error as Error).message}`);
  }

  await deleteCredential(base);
  io.out(`Logged out of ${base}.`);
}

export async function main(argv: string[], io: Io = consoleIo): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case "login":
        await login(args, io);
        return 0;
      case "logout":
        await logout(args, io);
        return 0;
      case "health":
        await health(args, io);
        return 0;
      case "emails":
        await emails(args, io);
        return 0;
      case "email":
        await email(args, io);
        return 0;
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(USAGE);
        return command === undefined ? 2 : 0;
      default:
        throw new CliError(`Unknown command: ${command}\n\n${USAGE}`, 2);
    }
  } catch (error) {
    if (error instanceof CliError) {
      io.err(`sift: ${error.message}`);
      return error.exitCode;
    }
    // parseArgs throws TypeErrors with a code for unknown/invalid options.
    if ((error as NodeJS.ErrnoException).code?.startsWith("ERR_PARSE_ARGS")) {
      io.err(`sift: ${(error as Error).message}\n\n${USAGE}`);
      return 2;
    }
    throw error;
  }
}
