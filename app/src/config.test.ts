import { describe, expect, test } from "bun:test";
import { DEFAULT_OPENAI_MODEL, parseConfig } from "./config.js";

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
});
