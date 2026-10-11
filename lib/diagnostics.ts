// Shared between the diagnostics API and the `sift` CLI, so keep this free of
// server-only imports.

const UNIT_MS = {
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
} as const;

export const DEFAULT_SINCE = "24h";
export const MAX_SINCE_MS = 30 * UNIT_MS.d;

/**
 * Parse a lookback window like "30m", "24h", or "7d" into milliseconds.
 * Returns null for anything malformed, zero, or longer than 30 days.
 */
export function parseSince(value: string): number | null {
  const match = /^(\d{1,4})([mhd])$/.exec(value.trim());
  if (!match) return null;
  const ms = Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
  if (ms <= 0 || ms > MAX_SINCE_MS) return null;
  return ms;
}

export interface HealthReport {
  window: { since: string; from: string; to: string };
  user_stats: { last_synced_at: string | null };
  emails: { ingested: number; tagged: number; untagged: number };
  classification_corrections: number;
  integration_tasks: { asana: number; todoist: number; crew: number };
  warnings: string[];
}
