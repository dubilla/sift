import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: API route handlers must NOT resolve auth with the web-only `auth()`
 * (NextAuth). It only reads the session cookie, so any route using it silently
 * rejects mobile bearer tokens — the exact bug that broke mobile sync. Routes
 * must use `withAuth` (preferred) or `getCurrentSession`, both of which accept
 * web AND mobile auth.
 *
 * If this fails: replace `const session = await auth()` with the `withAuth`
 * wrapper (see lib/api/with-auth.ts and app/api/user-settings/route.ts).
 */

const API_DIR = join(process.cwd(), "app", "api");

// Routes intentionally exempt (they don't use auth() anyway, listed for clarity).
const ALLOWLIST = new Set<string>([
  // e.g. "app/api/some/special/route.ts"
]);

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...findRouteFiles(full));
    } else if (/^route\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Lowercase `auth` only: withAuth / reauth* / getCurrentSession never match.
const IMPORTS_WEB_AUTH = /import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*["']@\/auth["']/;
const CALLS_WEB_AUTH = /\bauth\s*\(\s*\)/;

describe("API route auth guard", () => {
  it("no route handler uses the web-only auth() resolver", () => {
    const offenders = findRouteFiles(API_DIR)
      .filter((file) => {
        const rel = file.slice(process.cwd().length + 1);
        if (ALLOWLIST.has(rel)) return false;
        const src = readFileSync(file, "utf8");
        return IMPORTS_WEB_AUTH.test(src) || CALLS_WEB_AUTH.test(src);
      })
      .map((file) => file.slice(process.cwd().length + 1));

    expect(
      offenders,
      `These routes use web-only auth() — switch them to withAuth (lib/api/with-auth.ts) so mobile clients work:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
