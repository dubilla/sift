import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatEmailDate,
  parseFromHeader,
  htmlToText,
  looksLikeHtml,
} from "./email";

describe("looksLikeHtml", () => {
  it("detects HTML markup", () => {
    expect(looksLikeHtml('<div style="font-family: Arial">Hello</div>')).toBe(
      true
    );
    expect(looksLikeHtml("Line one<br>Line two")).toBe(true);
    expect(looksLikeHtml("<p>Paragraph</p>")).toBe(true);
  });

  it("does not flag plain text", () => {
    expect(looksLikeHtml("PS10 is asking families to create an account.")).toBe(
      false
    );
    expect(looksLikeHtml("Math: 3 < 5 and 7 > 2")).toBe(false);
    expect(looksLikeHtml("Email me at <bkim21@schools.nyc.gov>")).toBe(false);
  });
});

describe("htmlToText", () => {
  it("strips tags and keeps readable content", () => {
    const html =
      '<div style="font-family: Arial; color: #333"><p>PS10 is asking families to create a NYCSA account.</p></div>';
    expect(htmlToText(html)).toBe(
      "PS10 is asking families to create a NYCSA account."
    );
  });

  it("removes style and script blocks entirely", () => {
    const html =
      "<style>.logo { width: 100px; }</style><script>track();</script><p>Real content</p>";
    expect(htmlToText(html)).toBe("Real content");
  });

  it("converts block elements and <br> to line breaks", () => {
    const html = "<p>First</p><p>Second</p><div>Third<br>Fourth</div>";
    expect(htmlToText(html)).toBe("First\nSecond\nThird\nFourth");
  });

  it("converts list items to dashes", () => {
    const html = "<ul><li>Grades</li><li>Attendance</li></ul>";
    expect(htmlToText(html)).toBe("- Grades\n- Attendance");
  });

  it("decodes HTML entities", () => {
    expect(htmlToText("Tom &amp; Jerry &nbsp;&quot;quoted&quot; &#39;hi&#39;")).toBe(
      'Tom & Jerry "quoted" \'hi\''
    );
  });

  it("does not double-decode escaped entities", () => {
    expect(htmlToText("&amp;lt;div&amp;gt;")).toBe("&lt;div&gt;");
  });

  it("collapses excessive whitespace and blank lines", () => {
    const html = "<div>  A  </div>\n\n\n<div>B</div><div></div><div></div>";
    expect(htmlToText(html)).toBe("A\n\nB");
  });
});

describe("formatEmailDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats emails from today with time", () => {
    const now = new Date("2024-01-15T15:30:00");
    vi.setSystemTime(now);

    const emailDate = new Date("2024-01-15T10:30:00").toISOString();
    const result = formatEmailDate(emailDate);

    expect(result).toMatch(/10:30/);
  });

  it("formats emails from this week with day name", () => {
    const now = new Date("2024-01-15T15:30:00");
    vi.setSystemTime(now);

    const emailDate = new Date("2024-01-13T10:30:00").toISOString();
    const result = formatEmailDate(emailDate);

    expect(result).toMatch(/Sat/);
  });

  it("formats emails older than a week with month and day", () => {
    const now = new Date("2024-01-15T15:30:00");
    vi.setSystemTime(now);

    const emailDate = new Date("2024-01-01T10:30:00").toISOString();
    const result = formatEmailDate(emailDate);

    expect(result).toMatch(/Jan/);
    expect(result).toMatch(/1/);
  });

  it("handles edge case at 24 hour boundary", () => {
    const now = new Date("2024-01-15T10:00:00");
    vi.setSystemTime(now);

    const emailDate = new Date("2024-01-14T10:01:00").toISOString();
    const result = formatEmailDate(emailDate);

    expect(result).toMatch(/10:01/);
  });

  it("handles edge case at 7 day boundary", () => {
    const now = new Date("2024-01-15T10:00:00");
    vi.setSystemTime(now);

    const emailDate = new Date("2024-01-08T10:01:00").toISOString();
    const result = formatEmailDate(emailDate);

    expect(result).toMatch(/Mon/);
  });
});

describe("parseFromHeader", () => {
  it("parses standard email format with name and email", () => {
    const from = "John Doe <john@example.com>";
    const result = parseFromHeader(from);

    expect(result).toEqual({
      name: "John Doe",
      email: "john@example.com",
    });
  });

  it("parses email with quoted name", () => {
    const from = '"Jane Smith" <jane@example.com>';
    const result = parseFromHeader(from);

    expect(result).toEqual({
      name: "Jane Smith",
      email: "jane@example.com",
    });
  });

  it("handles email-only format", () => {
    const from = "simple@example.com";
    const result = parseFromHeader(from);

    expect(result).toEqual({
      name: "simple@example.com",
      email: "simple@example.com",
    });
  });

  it("handles name with special characters", () => {
    const from = "José García <jose@example.com>";
    const result = parseFromHeader(from);

    expect(result).toEqual({
      name: "José García",
      email: "jose@example.com",
    });
  });

  it("handles company name format", () => {
    const from = "Acme Corp. <notifications@acme.com>";
    const result = parseFromHeader(from);

    expect(result).toEqual({
      name: "Acme Corp.",
      email: "notifications@acme.com",
    });
  });

  it("trims whitespace from name", () => {
    const from = "  Spacey Name  <spacey@example.com>";
    const result = parseFromHeader(from);

    expect(result).toEqual({
      name: "Spacey Name",
      email: "spacey@example.com",
    });
  });
});
