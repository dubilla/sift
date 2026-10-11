import type { EmailDetail, EmailsReport, HealthReport } from "../lib/diagnostics";

function ago(iso: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatHealthTable(report: HealthReport, now = new Date()): string {
  const lastSync = report.user_stats.last_synced_at;
  const rows: [string, string][] = [
    ["Window", `last ${report.window.since} (since ${report.window.from})`],
    ["Last sync", lastSync ? `${lastSync} (${ago(lastSync, now)})` : "never"],
    ["Emails ingested", String(report.emails.ingested)],
    ["  tagged", String(report.emails.tagged)],
    ["  untagged", String(report.emails.untagged)],
    ["Classification corrections", String(report.classification_corrections)],
    ["Asana tasks created", String(report.integration_tasks.asana)],
    ["Todoist tasks created", String(report.integration_tasks.todoist)],
    ["Crew tasks created", String(report.integration_tasks.crew)],
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => `${label.padEnd(width)}  ${value}`);

  if (report.warnings.length > 0) {
    lines.push("", "Warnings:", ...report.warnings.map((w) => `  ! ${w}`));
  }

  return lines.join("\n");
}

function table(headers: string[], rows: string[][]): string[] {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(headers), ...rows.map(line)];
}

export function formatEmailsTable(report: EmailsReport): string {
  if (report.emails.length === 0) {
    return `No emails in the last ${report.window.since} matching the filters.`;
  }

  const rows = report.emails.map((e) => {
    const tasks = [
      ...e.tasks.asana.map(() => "asana"),
      ...e.tasks.todoist.map(() => "todoist"),
      ...e.tasks.crew.map(() => "crew"),
    ];
    return [
      e.id,
      e.date,
      e.deletedAt ? "deleted" : e.archivedAt ? "archived" : "inbox",
      e.tags.join(",") || "(untagged)",
      tasks.join(",") || "-",
      ...(e.subject !== undefined ? [e.subject ?? ""] : []),
    ];
  });
  const headers = ["ID", "DATE", "STATE", "TAGS", "TASKS", ...(report.emails[0].subject !== undefined ? ["SUBJECT"] : [])];
  return [...table(headers, rows), "", `${report.count} email(s), last ${report.window.since}`].join("\n");
}

export function formatEmailDetail(detail: EmailDetail): string {
  const { email } = detail;
  const lines: string[] = [];
  const field = (label: string, value: string) => lines.push(`${label.padEnd(12)}${value}`);

  field("ID", email.id);
  field("External ID", email.externalId);
  field("Thread", email.threadId ?? "-");
  field("Date", email.date);
  field("Ingested", email.createdAt);
  field("Archived", email.archivedAt ?? "no");
  field("Deleted", email.deletedAt ?? "no");
  field("Unsubscribe", email.hasUnsubscribe ? "yes" : "no");
  if (email.subject !== undefined) {
    field("Subject", email.subject ?? "");
    field("From", email.from ?? "");
    field("Snippet", email.snippet ?? "");
  }

  const section = (title: string, items: string[]) => {
    lines.push("", `${title}:`, ...(items.length ? items.map((i) => `  ${i}`) : ["  (none)"]));
  };
  section(
    "Tags",
    detail.tags.map((t) => {
      const confidence = t.confidence === null ? "" : ` ${t.confidence.toFixed(2)}`;
      return `${t.name} [${t.source}${confidence}] ${t.classifiedAt}`;
    })
  );
  section(
    "Corrections",
    detail.corrections.map((c) => `${c.correctedAt} ${c.oldTag ?? "(none)"} -> ${c.newTag ?? "(none)"}`)
  );
  section(
    "Activity",
    detail.activity.map((a) => `${a.createdAt} ${a.action}`)
  );
  section(
    "Integration tasks",
    detail.integrationTasks.map((t) =>
      `${t.provider} ${t.taskId}${t.taskName ? ` "${t.taskName}"` : ""} ${t.url ?? ""}`.trimEnd()
    )
  );
  return lines.join("\n");
}
