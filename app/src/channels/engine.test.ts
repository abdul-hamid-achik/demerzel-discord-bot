import { describe, expect, test } from "bun:test";
import type { ChannelSetting } from "../db/schema.js";
import { DEFAULT_TARGET_LANGUAGES } from "../translation/lang-util.js";
import { effectiveAutoTranslateSetting } from "./engine.js";

function channelSetting(
  overrides: Partial<ChannelSetting> = {},
): ChannelSetting {
  return {
    channelId: "channel-1",
    guildId: "guild-1",
    autoTranslate: true,
    targetLanguages: ["en", "es"],
    cleanupMinutes: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  };
}

describe("effectiveAutoTranslateSetting", () => {
  test("defaults missing channel rows to enabled with default targets", () => {
    const setting = effectiveAutoTranslateSetting({
      channelId: "channel-1",
      guildId: "guild-1",
      setting: null,
    });

    expect(setting).toMatchObject({
      channelId: "channel-1",
      guildId: "guild-1",
      autoTranslate: true,
      cleanupMinutes: null,
      isDefault: true,
    });
    expect(setting.targetLanguages).toEqual(DEFAULT_TARGET_LANGUAGES);
  });

  test("keeps enabled rows as explicit overrides", () => {
    const setting = effectiveAutoTranslateSetting({
      channelId: "channel-1",
      setting: channelSetting({
        targetLanguages: ["ko", "pl"],
        cleanupMinutes: 30,
      }),
    });

    expect(setting).toMatchObject({
      autoTranslate: true,
      targetLanguages: ["ko", "pl"],
      cleanupMinutes: 30,
      isDefault: false,
    });
  });

  test("keeps disabled rows as explicit opt-outs", () => {
    const setting = effectiveAutoTranslateSetting({
      channelId: "channel-1",
      setting: channelSetting({
        autoTranslate: false,
        targetLanguages: [],
      }),
    });

    expect(setting.autoTranslate).toBe(false);
    expect(setting.targetLanguages).toEqual([]);
    expect(setting.isDefault).toBe(false);
  });
});
