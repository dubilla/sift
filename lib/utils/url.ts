/**
 * Extract meaningful URLs from email HTML and plain text bodies.
 * Filters out tracking pixels, unsubscribe links, and other non-content URLs.
 */

const IGNORED_URL_PATTERNS = [
  /unsubscribe/i,
  /opt-out/i,
  /opt_out/i,
  /manage[-_]?preferences/i,
  /email[-_]?preferences/i,
  /notification[-_]?settings/i,
  /tracking/i,
  /click\.(mailchimp|sendgrid|hubspot|constantcontact)/i,
  /list-manage\.com/i,
  /mailchimp\.com.*\/track/i,
  /pixel/i,
  /beacon/i,
  /open\.gif/i,
  /\.gif\?/i,
  /1x1/i,
  /spacer/i,
  /mailto:/i,
  /tel:/i,
  /javascript:/i,
  /#$/,
];

const IGNORED_DOMAINS = [
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "schemas.microsoft.com",
  "www.w3.org",
];

function isIgnoredUrl(url: string): boolean {
  if (IGNORED_URL_PATTERNS.some((pattern) => pattern.test(url))) {
    return true;
  }

  try {
    const parsed = new URL(url);
    if (IGNORED_DOMAINS.includes(parsed.hostname)) {
      return true;
    }
  } catch {
    return true;
  }

  return false;
}

function isContentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Must be http or https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    // Skip image-only URLs (but not articles that happen to have image extensions in query params)
    const pathname = parsed.pathname.toLowerCase();
    if (/\.(png|jpg|jpeg|gif|svg|ico|webp|bmp)$/.test(pathname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract URLs from HTML content by parsing anchor tags.
 */
function extractUrlsFromHtml(html: string): string[] {
  const urls: string[] = [];
  // Match href attributes in anchor tags
  const hrefRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const url = match[1].trim();
    if (url && isContentUrl(url) && !isIgnoredUrl(url)) {
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Extract URLs from plain text content.
 */
function extractUrlsFromText(text: string): string[] {
  const urls: string[] = [];
  const urlRegex = /https?:\/\/[^\s<>"')\]]+/gi;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?]+$/, ""); // Strip trailing punctuation
    if (isContentUrl(url) && !isIgnoredUrl(url)) {
      urls.push(url);
    }
  }
  return urls;
}

/**
 * Deduplicate URLs, preserving order.
 */
function deduplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    // Normalize: remove trailing slashes for comparison
    const normalized = url.replace(/\/+$/, "").toLowerCase();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export interface ExtractedUrls {
  urls: string[];
  primaryUrl: string | null;
}

/**
 * Extract and rank URLs from an email.
 * Returns all content URLs found, plus a best-guess "primary" URL.
 *
 * Prefers HTML extraction (more structured) over plain text.
 */
export function extractUrlsFromEmail(
  bodyHtml: string | null,
  bodyText: string | null
): ExtractedUrls {
  let urls: string[] = [];

  if (bodyHtml) {
    urls = extractUrlsFromHtml(bodyHtml);
  }

  if (urls.length === 0 && bodyText) {
    urls = extractUrlsFromText(bodyText);
  }

  urls = deduplicateUrls(urls);

  return {
    urls,
    primaryUrl: urls.length > 0 ? urls[0] : null,
  };
}
