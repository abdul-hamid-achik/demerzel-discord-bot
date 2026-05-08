import { describe, expect, test } from "bun:test";
import { isFutureReminderTime, parseReminderTime } from "./time.ts";

const NOW = new Date("2026-05-08T12:00:00.000Z");

describe("parseReminderTime", () => {
  test("parses relative minutes", () => {
    expect(parseReminderTime("in 15 minutes", NOW)?.toISOString()).toBe(
      "2026-05-08T12:15:00.000Z",
    );
  });

  test("parses relative hours", () => {
    expect(parseReminderTime("in 2 hours", NOW)?.toISOString()).toBe(
      "2026-05-08T14:00:00.000Z",
    );
  });

  test("parses ISO timestamps with offsets", () => {
    expect(parseReminderTime("2026-05-09T18:00:00-06:00")?.toISOString()).toBe(
      "2026-05-10T00:00:00.000Z",
    );
  });

  test("rejects empty or invalid input", () => {
    expect(parseReminderTime("")).toBeNull();
    expect(parseReminderTime("next whenever")).toBeNull();
  });
});

describe("isFutureReminderTime", () => {
  test("requires a small lead time", () => {
    expect(
      isFutureReminderTime(new Date("2026-05-08T12:00:05.000Z"), NOW),
    ).toBe(false);
    expect(
      isFutureReminderTime(new Date("2026-05-08T12:00:10.000Z"), NOW),
    ).toBe(true);
  });
});
