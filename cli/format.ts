import type { HealthReport } from "../lib/diagnostics";

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
