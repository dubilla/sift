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

export function looksLikeHtml(content: string): boolean {
  return /<\s*(html|body|head|div|p|br|table|tr|td|span|a|img|li|h[1-6]|style|meta)\b/i.test(
    content
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

export function htmlToText(html: string): string {
  let text = html
    .replace(/<(style|script|head|title)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Preserve structure: block-level closings and <br> become line breaks
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|ul|ol)>/gi, "\n");

  text = decodeHtmlEntities(text.replace(/<[^>]+>/g, ""));

  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
