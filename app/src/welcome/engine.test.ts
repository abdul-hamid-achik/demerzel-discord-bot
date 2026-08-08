import { describe, expect, test } from "bun:test";
import {
  ChannelType,
  MessageType,
  ThreadAutoArchiveDuration,
  type GuildMember,
  type Message,
} from "discord.js";
import { isDemerzelConversationThread } from "../discord/handlers/mention.js";
import type { HomeTextChannel } from "../discord/home-channel.js";
import {
  isUserJoinSystemMessage,
  sendWelcomeGuide,
  welcomeEventKey,
  welcomeFromUserJoinSystemMessage,
  welcomeGuildMember,
  welcomePublicMessage,
  welcomeThreadName,
  welcomeTutorialMessage,
  type WelcomeStore,
} from "./engine.js";

function fakeChannel() {
  const channelSends: unknown[] = [];
  const threadStarts: unknown[] = [];
  const threadSends: unknown[] = [];
  const addedMembers: unknown[] = [];

  const channel: HomeTextChannel = {
    id: "channel-1",
    async send(options) {
      channelSends.push(options);
      return {
        id: "message-1",
        async startThread(threadOptions: unknown) {
          threadStarts.push(threadOptions);
          return {
            id: "thread-1",
            members: {
              async add(userId: string, reason?: string) {
                addedMembers.push({ userId, reason });
              },
            },
            async send(threadMessage: unknown) {
              threadSends.push(threadMessage);
            },
          };
        },
      };
    },
  };

  return { channel, channelSends, threadStarts, threadSends, addedMembers };
}

function fakeStore(reserved = true) {
  const calls: {
    reserve: unknown[];
    complete: unknown[];
    release: unknown[];
  } = {
    reserve: [],
    complete: [],
    release: [],
  };

  const store: WelcomeStore = {
    async reserve(args) {
      calls.reserve.push(args);
      return reserved;
    },
    async complete(args) {
      calls.complete.push(args);
    },
    async release(eventKey) {
      calls.release.push(eventKey);
    },
  };

  return { store, calls };
}

function fakeMember(overrides: Partial<GuildMember> = {}): GuildMember {
  return {
    id: "user-1",
    user: { bot: false },
    joinedTimestamp: 1700000000000,
    displayName: "Salvor",
    guild: { id: "guild-1", name: "Foundation" },
    client: {},
    ...overrides,
  } as unknown as GuildMember;
}

function fakeUserJoinMessage(overrides: Record<string, unknown> = {}): Message {
  return {
    type: MessageType.UserJoin,
    id: "system-message-1",
    guildId: "guild-1",
    createdTimestamp: 1700000000000,
    author: {
      id: "user-1",
      bot: false,
      globalName: "Salvor",
      username: "salvor",
    },
    member: { displayName: "Salvor" },
    guild: { id: "guild-1", name: "Foundation" },
    client: {},
    ...overrides,
  } as unknown as Message;
}

describe("welcome helpers", () => {
  test("builds stable event keys per join timestamp", () => {
    expect(
      welcomeEventKey({
        guildId: "guild",
        discordUserId: "user",
        joinedTimestamp: 1,
      }),
    ).toBe("guild:user:1");
    expect(
      welcomeEventKey({
        guildId: "guild",
        discordUserId: "user",
        joinedTimestamp: 2,
      }),
    ).not.toBe("guild:user:1");
  });

  test("formats a bounded thread name", () => {
    expect(welcomeThreadName("  Salvor   Hardin  ")).toBe(
      "Demerzel - Welcome Salvor Hardin",
    );
    expect(welcomeThreadName("x".repeat(200)).length).toBeLessThanOrEqual(90);
    expect(
      isDemerzelConversationThread(
        {
          type: ChannelType.PublicThread,
          ownerId: "bot-1",
          name: welcomeThreadName("Salvor"),
        },
        "bot-1",
      ),
    ).toBe(true);
  });

  test("formats public and tutorial messages with responsible usage guidance", () => {
    expect(welcomePublicMessage({ memberId: "123" })).toContain("<@123>");

    const tutorial = welcomeTutorialMessage({
      displayName: "Salvor",
      guildName: "Foundation",
    });
    expect(tutorial).toContain("Reply in this thread to ask Demerzel");
    expect(tutorial).toContain("/language set");
    expect(tutorial).toContain("/translate");
    expect(tutorial).toContain("private translation");
    expect(tutorial).toContain("passwords");
    expect(tutorial).toContain("spam or ping people");
  });

  test("recognizes Discord native user-join system messages", () => {
    expect(isUserJoinSystemMessage(fakeUserJoinMessage())).toBe(true);
    expect(
      isUserJoinSystemMessage(
        fakeUserJoinMessage({ type: MessageType.Default }),
      ),
    ).toBe(false);
    expect(
      isUserJoinSystemMessage(
        fakeUserJoinMessage({
          author: { bot: true },
        }),
      ),
    ).toBe(false);
  });

  test("sends the welcome message, creates a thread, adds the user, and posts the guide", async () => {
    const { channel, channelSends, threadStarts, threadSends, addedMembers } =
      fakeChannel();

    await expect(
      sendWelcomeGuide({
        channel,
        memberId: "user-1",
        displayName: "Salvor",
        guildName: "Foundation",
      }),
    ).resolves.toEqual({ messageId: "message-1", threadId: "thread-1" });

    expect(channelSends).toHaveLength(1);
    expect(channelSends[0]).toMatchObject({
      allowedMentions: { users: ["user-1"] },
    });
    expect(threadStarts).toEqual([
      {
        name: "Demerzel - Welcome Salvor",
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: "Welcome guide for Salvor",
      },
    ]);
    expect(addedMembers).toEqual([
      { userId: "user-1", reason: "Add new member to welcome thread" },
    ]);
    expect(threadSends).toHaveLength(1);
    expect(threadSends[0]).toMatchObject({
      allowedMentions: { parse: [] },
    });
  });
});

describe("welcomeGuildMember", () => {
  test("reserves and completes a welcome event", async () => {
    const { channel } = fakeChannel();
    const { store, calls } = fakeStore();

    await welcomeGuildMember(fakeMember(), {
      channel,
      store,
      grantChannelAccess: false,
    });

    expect(calls.reserve).toHaveLength(1);
    expect(calls.reserve[0]).toMatchObject({
      eventKey: "guild-1:user-1:1700000000000",
      guildId: "guild-1",
      discordUserId: "user-1",
      channelId: "channel-1",
      joinedAt: new Date(1700000000000),
    });
    expect(calls.complete).toEqual([
      {
        eventKey: "guild-1:user-1:1700000000000",
        messageId: "message-1",
        threadId: "thread-1",
      },
    ]);
    expect(calls.release).toHaveLength(0);
  });

  test("does not send a duplicate reserved welcome", async () => {
    const { channel, channelSends } = fakeChannel();
    const { store, calls } = fakeStore(false);

    await welcomeGuildMember(fakeMember(), {
      channel,
      store,
      grantChannelAccess: false,
    });

    expect(calls.reserve).toHaveLength(1);
    expect(calls.complete).toHaveLength(0);
    expect(channelSends).toHaveLength(0);
  });

  test("skips bot members", async () => {
    const { channel, channelSends } = fakeChannel();
    const { store, calls } = fakeStore();

    await welcomeGuildMember(
      fakeMember({ user: { bot: true } } as Partial<GuildMember>),
      { channel, store, grantChannelAccess: false },
    );

    expect(calls.reserve).toHaveLength(0);
    expect(channelSends).toHaveLength(0);
  });

  test("welcomes from Discord native user-join system messages", async () => {
    const { channel } = fakeChannel();
    const { store, calls } = fakeStore();

    await expect(
      welcomeFromUserJoinSystemMessage(fakeUserJoinMessage(), {
        channel,
        store,
        grantChannelAccess: false,
      }),
    ).resolves.toBe(true);

    expect(calls.reserve).toHaveLength(1);
    expect(calls.reserve[0]).toMatchObject({
      eventKey: "guild-1:user-1:1700000000000",
      guildId: "guild-1",
      discordUserId: "user-1",
      channelId: "channel-1",
      joinedAt: new Date(1700000000000),
    });
    expect(calls.complete).toEqual([
      {
        eventKey: "guild-1:user-1:1700000000000",
        messageId: "message-1",
        threadId: "thread-1",
      },
    ]);
  });
});
