import { describe, expect, test } from "bun:test";
import {
  DEFAULT_OPENAI_MODEL,
  isCmsConfigured,
  parseConfig,
} from "./config.js";

const baseEnv = {
  DISCORD_TOKEN: "test-discord-token",
  DISCORD_CLIENT_ID: "0000000000000000",
  DATABASE_URL: "postgres://test:test@localhost:5432/test?sslmode=disable",
};

describe("parseConfig", () => {
  test("defaults OpenAI chat and translation models to the low-cost GPT-5.4 nano model", () => {
    const parsed = parseConfig(baseEnv);

    expect(parsed.OPENAI_CHAT_MODEL).toBe(DEFAULT_OPENAI_MODEL);
    expect(parsed.OPENAI_TRANSLATION_MODEL).toBe(DEFAULT_OPENAI_MODEL);
    expect(parsed.OPENAI_CHAT_MODEL).toBe("gpt-5.4-nano");
  });

  test("allows chat and translation models to be overridden independently", () => {
    const parsed = parseConfig({
      ...baseEnv,
      OPENAI_CHAT_MODEL: "gpt-5.4-mini",
      OPENAI_TRANSLATION_MODEL: "gpt-5.4-nano",
    });

    expect(parsed.OPENAI_CHAT_MODEL).toBe("gpt-5.4-mini");
    expect(parsed.OPENAI_TRANSLATION_MODEL).toBe("gpt-5.4-nano");
  });

  test("treats blank optional CMS env vars as unset", () => {
    const parsed = parseConfig({
      ...baseEnv,
      VOID_API_BASE_URL: "",
      VOID_API_URL: "",
      VOID_API_KEY: "   ",
    });

    expect(parsed.VOID_API_BASE_URL).toBeUndefined();
    expect(parsed.VOID_API_URL).toBeUndefined();
    expect(parsed.VOID_API_KEY).toBeUndefined();
    expect(isCmsConfigured(parsed)).toBe(false);
  });

  test("rejects a non-URL CMS base endpoint", () => {
    expect(() =>
      parseConfig({
        ...baseEnv,
        VOID_API_BASE_URL: "not-a-url",
        VOID_API_KEY: "secret",
      }),
    ).toThrow();
  });

  test("detects CMS as configured when API base URL and key are present", () => {
    const parsed = parseConfig({
      ...baseEnv,
      VOID_API_BASE_URL: "https://www.starwarrior.org/api",
      VOID_API_KEY: "secret",
    });

    expect(isCmsConfigured(parsed)).toBe(true);
    expect(
      isCmsConfigured({ VOID_API_BASE_URL: parsed.VOID_API_BASE_URL }),
    ).toBe(false);
  });

  test("keeps legacy VOID_API_URL working for existing deployments", () => {
    const parsed = parseConfig({
      ...baseEnv,
      VOID_API_URL: "https://www.starwarrior.org",
      VOID_API_KEY: "secret",
    });

    expect(isCmsConfigured(parsed)).toBe(true);
  });
});
