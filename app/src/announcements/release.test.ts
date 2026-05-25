import { describe, expect, test } from "bun:test";
import { ChannelType } from "discord.js";
import {
  isDefaultAnnouncementChannel,
  normalizeReleaseNotes,
  releaseAnnouncementMessage,
  releaseNotesHash,
} from "./release.js";

describe("release announcement helpers", () => {
  test("normalizes env-style escaped newlines", () => {
    expect(normalizeReleaseNotes("New:\\n- One\\n- Two")).toBe(
      "New:\n- One\n- Two",
    );
  });

  test("hashes normalized release notes deterministically", () => {
    expect(releaseNotesHash("hello")).toBe(releaseNotesHash("hello\n"));
    expect(releaseNotesHash("hello")).not.toBe(releaseNotesHash("hello!"));
  });

  test("formats the announcement with version, notes, and thread guidance", () => {
    const message = releaseAnnouncementMessage({
      version: "0.1.0",
      notes: "- Better translations",
    });

    expect(message).toContain("Demerzel has been updated (0.1.0).");
    expect(message).toContain("- Better translations");
    expect(message).toContain("Reply to Demerzel in a conversation thread");
  });

  test("matches text or announcement channels named home", () => {
    expect(
      isDefaultAnnouncementChannel({
        type: ChannelType.GuildText,
        name: "🏠-home",
      }),
    ).toBe(true);
    expect(
      isDefaultAnnouncementChannel({
        type: ChannelType.GuildAnnouncement,
        name: "server-home",
      }),
    ).toBe(true);
  });

  test("rejects non-home or non-text channels", () => {
    expect(
      isDefaultAnnouncementChannel({
        type: ChannelType.GuildText,
        name: "general",
      }),
    ).toBe(false);
    expect(
      isDefaultAnnouncementChannel({
        type: ChannelType.GuildVoice,
        name: "home voice",
      }),
    ).toBe(false);
  });
});
