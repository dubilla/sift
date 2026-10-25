import { describe, it, expect } from "vitest";
import { todayLocalDate } from "./dates";

describe("todayLocalDate", () => {
  it("zero-pads single-digit months and days", () => {
    expect(todayLocalDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("uses local date for a late evening that is the next day in UTC", () => {
    const evening = new Date(2026, 9, 25, 23, 30);
    expect(todayLocalDate(evening)).toBe("2026-10-25");
  });

  it("handles year end", () => {
    expect(todayLocalDate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});
