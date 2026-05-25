import { describe, expect, test } from "bun:test";
import { ChannelType } from "discord.js";
import {
  chatReplyTranslationTargets,
  isDemerzelConversationThread,
} from "./mention.js";

describe("isDemerzelConversationThread", () => {
  test("accepts bot-owned Demerzel threads", () => {
    expect(
      isDemerzelConversationThread(
        {
          type: ChannelType.PublicThread,
          ownerId: "bot-1",
          name: "Demerzel · abdul",
        },
        "bot-1",
      ),
    ).toBe(true);
  });

  test("rejects translation threads and threads owned by someone else", () => {
    expect(
      isDemerzelConversationThread(
        {
          type: ChannelType.PublicThread,
          ownerId: "bot-1",
          name: "🇮🇹 → 🇺🇸 🇪🇸",
        },
        "bot-1",
      ),
    ).toBe(false);
    expect(
      isDemerzelConversationThread(
        {
          type: ChannelType.PublicThread,
          ownerId: "user-1",
          name: "Demerzel · abdul",
        },
        "bot-1",
      ),
    ).toBe(false);
  });
});

describe("chatReplyTranslationTargets", () => {
  test("excludes the reply language from default translation targets", () => {
    expect(chatReplyTranslationTargets("es")).not.toContain("es");
    expect(chatReplyTranslationTargets("es")).toContain("en");
  });

  test("keeps all targets when the reply language is unknown", () => {
    expect(chatReplyTranslationTargets("und")).toContain("en");
    expect(chatReplyTranslationTargets("und")).toContain("es");
  });
});
