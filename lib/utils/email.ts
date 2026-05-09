export function formatEmailDate(dateString: string, timezone?: string | null): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  // Prefer explicit user timezone; fall back to browser/runtime detection
  const timeZone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (diffInHours < 24) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    });
  } else if (diffInHours < 168) {
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      timeZone,
    });
  } else {
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone,
    });
  }
}

export interface ParsedEmailAddress {
  name: string;
  email: string;
}

export function parseFromHeader(from: string): ParsedEmailAddress {
  const match = from.match(/^(.+?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), email: match[2] };
  }
  return { name: from, email: from };
}
