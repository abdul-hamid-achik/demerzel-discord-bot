import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CLEANUP_MINUTES,
  effectiveCleanupMinutes,
  shouldCleanupThread,
  type ThreadAuthor,
} from "./cleanup.ts";

const OUR_BOT = "1502201723714928722";
const OTHER_BOT = "9999999999999999999";
const HUMAN_A = "1111111111111111111";
const HUMAN_B = "2222222222222222222";

const author = (id: string, bot = false): ThreadAuthor => ({ id, bot });

describe("shouldCleanupThread", () => {
  test("empty thread is cleanable", () => {
    expect(shouldCleanupThread([], OUR_BOT)).toBe(true);
  });

  test("thread containing only our bot is cleanable", () => {
    expect(
      shouldCleanupThread([author(OUR_BOT, true), author(OUR_BOT, true)], OUR_BOT),
    ).toBe(true);
  });

  test("thread with a single human reply is NOT cleanable", () => {
    expect(
      shouldCleanupThread([author(OUR_BOT, true), author(HUMAN_A)], OUR_BOT),
    ).toBe(false);
  });

  test("thread with multiple humans is NOT cleanable", () => {
    expect(
      shouldCleanupThread(
        [author(OUR_BOT, true), author(HUMAN_A), author(HUMAN_B)],
        OUR_BOT,
      ),
    ).toBe(false);
  });

  test("thread with a different bot replying is NOT cleanable", () => {
    // Another bot chiming in implies real activity worth keeping (e.g., a moderator bot).
    expect(
      shouldCleanupThread([author(OUR_BOT, true), author(OTHER_BOT, true)], OUR_BOT),
    ).toBe(false);
  });

  test("thread with our bot's id but author.bot=false (impossible but safe) is NOT cleanable", () => {
    // Defensive — if for some reason author.bot is mislabelled, we keep the thread.
    expect(shouldCleanupThread([author(OUR_BOT, false)], OUR_BOT)).toBe(false);
  });
});

describe("effectiveCleanupMinutes", () => {
  test("null/undefined → app default", () => {
    expect(effectiveCleanupMinutes(null)).toBe(DEFAULT_CLEANUP_MINUTES);
    expect(effectiveCleanupMinutes(undefined)).toBe(DEFAULT_CLEANUP_MINUTES);
  });

  test("0 → 0 (never delete)", () => {
    expect(effectiveCleanupMinutes(0)).toBe(0);
  });

  test("positive integer → itself", () => {
    expect(effectiveCleanupMinutes(15)).toBe(15);
    expect(effectiveCleanupMinutes(1440)).toBe(1440);
  });

  test("negative → clamped to 0", () => {
    expect(effectiveCleanupMinutes(-5)).toBe(0);
  });

  test("non-integer → floored", () => {
    expect(effectiveCleanupMinutes(15.7)).toBe(15);
  });

  test("DEFAULT_CLEANUP_MINUTES is a sane positive integer", () => {
    expect(DEFAULT_CLEANUP_MINUTES).toBeGreaterThan(0);
    expect(Number.isInteger(DEFAULT_CLEANUP_MINUTES)).toBe(true);
  });
});
