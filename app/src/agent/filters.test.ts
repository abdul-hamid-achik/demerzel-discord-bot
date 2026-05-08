import { describe, expect, test } from "bun:test";
import { shouldAutoTranslate, type FilterableMessage } from "./filters.ts";

function msg(overrides: Partial<FilterableMessage> = {}): FilterableMessage {
  return {
    author: { bot: false },
    system: false,
    webhookId: null,
    content: "hello world from the test suite",
    ...overrides,
  };
}

describe("shouldAutoTranslate", () => {
  test("accepts a normal multi-word user message", () => {
    expect(shouldAutoTranslate(msg())).toBe(true);
  });

  test("rejects bot messages", () => {
    expect(shouldAutoTranslate(msg({ author: { bot: true } }))).toBe(false);
  });

  test("rejects system messages", () => {
    expect(shouldAutoTranslate(msg({ system: true }))).toBe(false);
  });

  test("rejects webhook messages", () => {
    expect(shouldAutoTranslate(msg({ webhookId: "1234567890" }))).toBe(false);
  });

  test("rejects null/empty content", () => {
    expect(shouldAutoTranslate(msg({ content: null }))).toBe(false);
    expect(shouldAutoTranslate(msg({ content: "" }))).toBe(false);
    expect(shouldAutoTranslate(msg({ content: "   " }))).toBe(false);
  });

  test("accepts short single words like 'hi' or 'ok'", () => {
    expect(shouldAutoTranslate(msg({ content: "hi" }))).toBe(true);
    expect(shouldAutoTranslate(msg({ content: "ok" }))).toBe(true);
    expect(shouldAutoTranslate(msg({ content: "hola" }))).toBe(true);
  });

  test("accepts 2-word messages (e.g. '@bot translate this')", () => {
    expect(
      shouldAutoTranslate(msg({ content: "<@123456789012345678> translate this" })),
    ).toBe(true);
  });

  test("rejects message that is only a user mention", () => {
    expect(
      shouldAutoTranslate(msg({ content: "<@123456789012345678>" })),
    ).toBe(false);
  });

  test("rejects message that is only a channel mention", () => {
    expect(
      shouldAutoTranslate(msg({ content: "<#123456789012345678>" })),
    ).toBe(false);
  });

  test("rejects message that is only custom emojis", () => {
    expect(
      shouldAutoTranslate(msg({ content: "<:joy:111> <:cry:222>" })),
    ).toBe(false);
  });

  test("rejects message that is only animated emojis", () => {
    expect(
      shouldAutoTranslate(msg({ content: "<a:dance:111> <a:wave:222>" })),
    ).toBe(false);
  });

  test("rejects message that is only a URL", () => {
    expect(
      shouldAutoTranslate(msg({ content: "https://example.com/long/path" })),
    ).toBe(false);
  });

  test("rejects slash commands", () => {
    expect(shouldAutoTranslate(msg({ content: "/translate hello world to en" }))).toBe(
      false,
    );
  });

  test("rejects shell-style commands", () => {
    expect(shouldAutoTranslate(msg({ content: "!translate hello world" }))).toBe(false);
  });

  test("accepts realistic multilingual game-chat message", () => {
    expect(
      shouldAutoTranslate(msg({ content: "ragazzi andiamo al settore delta" })),
    ).toBe(true);
  });

  test("trims whitespace before counting words (whitespace-only is rejected)", () => {
    expect(shouldAutoTranslate(msg({ content: "          " }))).toBe(false);
    expect(shouldAutoTranslate(msg({ content: "    hi    " }))).toBe(true);
  });
});
