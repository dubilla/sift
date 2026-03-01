import { describe, it, expect } from "vitest";
import { extractUrlsFromEmail } from "./url";

describe("extractUrlsFromEmail", () => {
  it("extracts URLs from HTML anchor tags", () => {
    const html = `
      <p>Check out this article:</p>
      <a href="https://example.com/article/great-read">Read more</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toContain("https://example.com/article/great-read");
    expect(result.primaryUrl).toBe("https://example.com/article/great-read");
  });

  it("extracts URLs from plain text", () => {
    const text = "Check out https://example.com/article here";
    const result = extractUrlsFromEmail(null, text);
    expect(result.urls).toContain("https://example.com/article");
    expect(result.primaryUrl).toBe("https://example.com/article");
  });

  it("filters out unsubscribe links", () => {
    const html = `
      <a href="https://example.com/article">Article</a>
      <a href="https://example.com/unsubscribe?token=abc">Unsubscribe</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toContain("https://example.com/article");
    expect(result.urls).not.toContain(
      "https://example.com/unsubscribe?token=abc"
    );
  });

  it("filters out image URLs", () => {
    const html = `
      <a href="https://example.com/article">Article</a>
      <a href="https://example.com/logo.png">Logo</a>
      <a href="https://example.com/banner.jpg">Banner</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toEqual(["https://example.com/article"]);
  });

  it("filters out tracking URLs", () => {
    const html = `
      <a href="https://example.com/article">Article</a>
      <a href="https://click.sendgrid.com/track/123">Tracking</a>
      <a href="https://example.com/pixel.gif?id=123">Pixel</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toEqual(["https://example.com/article"]);
  });

  it("filters out mailto and tel links", () => {
    const html = `
      <a href="https://example.com/article">Article</a>
      <a href="mailto:test@example.com">Email</a>
      <a href="tel:+1234567890">Phone</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toEqual(["https://example.com/article"]);
  });

  it("deduplicates URLs", () => {
    const html = `
      <a href="https://example.com/article">Read here</a>
      <a href="https://example.com/article">Also here</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toHaveLength(1);
  });

  it("returns empty when no content URLs found", () => {
    const html = `
      <a href="mailto:test@example.com">Email</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toEqual([]);
    expect(result.primaryUrl).toBeNull();
  });

  it("returns empty for null inputs", () => {
    const result = extractUrlsFromEmail(null, null);
    expect(result.urls).toEqual([]);
    expect(result.primaryUrl).toBeNull();
  });

  it("prefers HTML extraction over plain text", () => {
    const html = '<a href="https://example.com/html-article">Link</a>';
    const text = "Check out https://example.com/text-article here";
    const result = extractUrlsFromEmail(html, text);
    expect(result.urls).toContain("https://example.com/html-article");
    expect(result.urls).not.toContain("https://example.com/text-article");
  });

  it("falls back to plain text when HTML has no URLs", () => {
    const html = "<p>No links here</p>";
    const text = "Check out https://example.com/text-article here";
    const result = extractUrlsFromEmail(html, text);
    expect(result.urls).toContain("https://example.com/text-article");
  });

  it("strips trailing punctuation from plain text URLs", () => {
    const text = "Visit https://example.com/article. Then come back.";
    const result = extractUrlsFromEmail(null, text);
    expect(result.urls).toContain("https://example.com/article");
  });

  it("filters out manage-preferences links", () => {
    const html = `
      <a href="https://example.com/article">Article</a>
      <a href="https://example.com/manage-preferences">Preferences</a>
      <a href="https://example.com/email-preferences">Email Prefs</a>
      <a href="https://example.com/notification-settings">Notifications</a>
    `;
    const result = extractUrlsFromEmail(html, null);
    expect(result.urls).toEqual(["https://example.com/article"]);
  });
});
