import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatEmailDate, parseFromHeader } from "./email";

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
