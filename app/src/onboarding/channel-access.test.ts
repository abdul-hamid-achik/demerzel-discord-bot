import { describe, expect, test } from "bun:test";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import {
  isOnboardingTextChannel,
  parseConfiguredChannelIds,
  selectOnboardingChannels,
} from "./channel-access.js";

interface FakeChannel {
  id: string;
  name: string;
  type: ChannelType;
  parentId?: string | null;
}

function collection(channels: FakeChannel[]) {
  const map = new Map(channels.map((channel) => [channel.id, channel]));
  return {
    values: () => map.values(),
    get: (id: string) => map.get(id),
    filter: (predicate: (channel: FakeChannel) => boolean) =>
      collection(channels.filter(predicate)),
  };
}

const channels = [
  {
    id: "category-1",
    name: "Canali testuali",
    type: ChannelType.GuildCategory,
  },
  {
    id: "home",
    name: "🏠-home",
    type: ChannelType.GuildText,
    parentId: "category-1",
  },
  {
    id: "meeting",
    name: "📢-réunion-r5-r4",
    type: ChannelType.GuildText,
    parentId: "category-1",
  },
  {
    id: "announcements",
    name: "announcements",
    type: ChannelType.GuildAnnouncement,
    parentId: "category-1",
  },
  {
    id: "voice",
    name: "voice",
    type: ChannelType.GuildVoice,
    parentId: "category-1",
  },
  {
    id: "thread",
    name: "thread",
    type: ChannelType.PublicThread,
    parentId: "home",
  },
  {
    id: "forum",
    name: "forum",
    type: ChannelType.GuildForum,
    parentId: "category-1",
  },
  {
    id: "admin",
    name: "admin",
    type: ChannelType.GuildText,
    parentId: "category-2",
  },
] satisfies FakeChannel[];

describe("parseConfiguredChannelIds", () => {
  test("parses comma-separated channel ids", () => {
    expect(parseConfiguredChannelIds(" home,meeting ,, video ")).toEqual([
      "home",
      "meeting",
      "video",
    ]);
  });

  test("returns empty for missing input", () => {
    expect(parseConfiguredChannelIds(undefined)).toEqual([]);
    expect(parseConfiguredChannelIds("")).toEqual([]);
  });
});

describe("isOnboardingTextChannel", () => {
  test("accepts text and announcement channels only", () => {
    expect(isOnboardingTextChannel({ type: ChannelType.GuildText })).toBe(true);
    expect(
      isOnboardingTextChannel({ type: ChannelType.GuildAnnouncement }),
    ).toBe(true);
    expect(isOnboardingTextChannel({ type: ChannelType.GuildVoice })).toBe(
      false,
    );
    expect(isOnboardingTextChannel({ type: ChannelType.PublicThread })).toBe(
      false,
    );
  });
});

describe("selectOnboardingChannels", () => {
  test("defaults to all text and announcement channels across categories", () => {
    expect(
      selectOnboardingChannels(collection(channels)).map(
        (channel) => channel.id,
      ),
    ).toEqual(["home", "meeting", "announcements", "admin"]);
  });

  test("excludes configured channels and categories from all-text access", () => {
    expect(
      selectOnboardingChannels(collection(channels), {
        excludedChannelIds: ["meeting"],
        excludedCategoryIds: ["category-2"],
      }).map((channel) => channel.id),
    ).toEqual(["home", "announcements"]);
  });

  test("configured scope uses channel ids in order and filters non-text channels", () => {
    expect(
      selectOnboardingChannels(collection(channels), {
        accessScope: "configured",
        configuredChannelIds: ["meeting", "voice", "home", "missing"],
      }).map((channel) => channel.id),
    ).toEqual(["meeting", "home"]);
  });

  test("configured scope defaults to text channels under the default text category", () => {
    expect(
      selectOnboardingChannels(collection(channels), {
        accessScope: "configured",
      }).map((channel) => channel.id),
    ).toEqual(["home", "meeting", "announcements"]);
  });

  test("configured scope uses a configured category id when present", () => {
    expect(
      selectOnboardingChannels(collection(channels), {
        accessScope: "configured",
        configuredCategoryId: "category-2",
      }).map((channel) => channel.id),
    ).toEqual(["admin"]);
  });

  test("configured scope falls back to all text channels if no category matches", () => {
    const noDefaultCategory = channels.filter(
      (channel) => channel.id !== "category-1",
    );
    expect(
      selectOnboardingChannels(collection(noDefaultCategory), {
        accessScope: "configured",
      }).map((channel) => channel.id),
    ).toEqual(["home", "meeting", "announcements", "admin"]);
  });

  test("permission names match Discord permissions granted during onboarding", () => {
    for (const key of [
      "ViewChannel",
      "ReadMessageHistory",
      "SendMessages",
      "SendMessagesInThreads",
      "UseApplicationCommands",
    ] as const) {
      expect(PermissionFlagsBits[key]).toBeDefined();
    }
  });
});
