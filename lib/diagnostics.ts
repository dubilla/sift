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

export const DEFAULT_EMAIL_LIMIT = 50;
export const MAX_EMAIL_LIMIT = 200;

export interface LinkedTaskIds {
  asana: string[];
  todoist: string[];
  crew: string[];
}

export interface EmailSummary {
  id: string;
  externalId: string;
  threadId: string | null;
  date: string;
  archivedAt: string | null;
  deletedAt: string | null;
  tags: string[];
  hasUnsubscribe: boolean;
  tasks: LinkedTaskIds;
  // Only present with ?content=1
  subject?: string | null;
  from?: string;
  snippet?: string | null;
}

export interface EmailsReport {
  window: { since: string; from: string; to: string };
  count: number;
  emails: EmailSummary[];
}

export interface IntegrationTaskRow {
  provider: "asana" | "todoist" | "crew";
  id: string;
  taskId: string;
  url: string | null;
  createdAt: string;
  // Only present with ?content=1
  taskName?: string;
}

export interface EmailDetail {
  email: Omit<EmailSummary, "tags" | "tasks"> & { createdAt: string };
  tags: { name: string; source: string; confidence: number | null; classifiedAt: string }[];
  corrections: {
    id: string;
    oldTag: string | null;
    newTag: string | null;
    oldSource: string | null;
    oldConfidence: number | null;
    correctedAt: string;
    appliedToSimilar: boolean;
  }[];
  activity: { id: string; action: string; createdAt: string }[];
  integrationTasks: IntegrationTaskRow[];
}
