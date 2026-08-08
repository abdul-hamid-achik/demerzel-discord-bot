import { describe, expect, test } from "bun:test";
import { ChannelType } from "discord.js";
import {
  autoTranslateConfigChannelId,
  autoTranslateDeliveryForChannelType,
  isTranslationThreadName,
} from "./agent.js";

describe("auto-translate channel behavior", () => {
  test("top-level text and announcement channels create translation threads", () => {
    expect(autoTranslateDeliveryForChannelType(ChannelType.GuildText)).toBe(
      "create-thread",
    );
    expect(
      autoTranslateDeliveryForChannelType(ChannelType.GuildAnnouncement),
    ).toBe("create-thread");
  });

  test("thread messages are translated by replying in the same thread", () => {
    expect(autoTranslateDeliveryForChannelType(ChannelType.PublicThread)).toBe(
      "reply-in-thread",
    );
    expect(autoTranslateDeliveryForChannelType(ChannelType.PrivateThread)).toBe(
      "reply-in-thread",
    );
    expect(
      autoTranslateDeliveryForChannelType(ChannelType.AnnouncementThread),
    ).toBe("reply-in-thread");
  });

  test("unsupported channel types are skipped", () => {
    expect(autoTranslateDeliveryForChannelType(ChannelType.GuildVoice)).toBe(
      "unsupported",
    );
    expect(
      autoTranslateConfigChannelId({
        id: "voice-1",
        type: ChannelType.GuildVoice,
      }),
    ).toBeNull();
  });

  test("thread messages inherit their parent channel configuration", () => {
    expect(
      autoTranslateConfigChannelId({
        id: "thread-1",
        type: ChannelType.PublicThread,
        parentId: "parent-1",
      }),
    ).toBe("parent-1");
  });

  test("top-level messages use their own channel configuration", () => {
    expect(
      autoTranslateConfigChannelId({
        id: "channel-1",
        type: ChannelType.GuildText,
      }),
    ).toBe("channel-1");
  });

  test("identifies Demerzel translation thread names", () => {
    expect(isTranslationThreadName("🇮🇹 → 🇺🇸 🇪🇸 🇧🇷")).toBe(true);
    expect(isTranslationThreadName("Translations · Hari")).toBe(true);
    expect(isTranslationThreadName("Demerzel · Hari")).toBe(false);
    expect(isTranslationThreadName("Demerzel - Welcome Hari")).toBe(false);
  });
});
