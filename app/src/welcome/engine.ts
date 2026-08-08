import {
  MessageType,
  ThreadAutoArchiveDuration,
  type Client,
  type GuildMember,
  type Message,
  type MessageMentionOptions,
} from "discord.js";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { welcomeEvents } from "../db/schema.js";
import {
  resolveHomeChannel,
  type HomeTextChannel,
} from "../discord/home-channel.js";
import {
  discordErrorDetails,
  NO_MENTIONS,
} from "../discord/messages.js";
import { logger } from "../logger.js";
import {
  grantOnboardingTextChannelAccess,
  grantOnboardingTextChannelAccessByGuildId,
} from "../onboarding/channel-access.js";

const MAX_THREAD_NAME_LENGTH = 90;
const WELCOME_THREAD_AUTO_ARCHIVE = ThreadAutoArchiveDuration.OneWeek;

export interface WelcomeMessage {
  id: string;
  startThread(options: {
    name: string;
    autoArchiveDuration: ThreadAutoArchiveDuration;
    reason?: string;
  }): Promise<WelcomeThread>;
}

export interface WelcomeThread {
  id: string;
  send(options: {
    content: string;
    allowedMentions?: MessageMentionOptions;
  }): Promise<unknown>;
  members?: {
    add(userId: string, reason?: string): Promise<unknown>;
  };
}

export interface WelcomeStore {
  reserve(args: {
    eventKey: string;
    guildId: string;
    discordUserId: string;
    channelId: string;
    joinedAt: Date;
  }): Promise<boolean>;
  complete(args: {
    eventKey: string;
    messageId: string;
    threadId: string;
  }): Promise<void>;
  release(eventKey: string): Promise<void>;
}

export const dbWelcomeStore: WelcomeStore = {
  async reserve(args) {
    const [row] = await db
      .insert(welcomeEvents)
      .values(args)
      .onConflictDoNothing()
      .returning();

    return Boolean(row);
  },

  async complete(args) {
    await db
      .update(welcomeEvents)
      .set({
        messageId: args.messageId,
        threadId: args.threadId,
      })
      .where(eq(welcomeEvents.eventKey, args.eventKey));
  },

  async release(eventKey) {
    await db.delete(welcomeEvents).where(eq(welcomeEvents.eventKey, eventKey));
  },
};

export function welcomeEventKey(args: {
  guildId: string;
  discordUserId: string;
  joinedTimestamp: number | null;
}): string {
  return [
    args.guildId,
    args.discordUserId,
    args.joinedTimestamp ?? "unknown",
  ].join(":");
}

export function welcomeThreadName(displayName: string): string {
  const cleanName = displayName.replace(/\s+/g, " ").trim() || "new member";
  const name = `Demerzel - Welcome ${cleanName}`;
  if (name.length <= MAX_THREAD_NAME_LENGTH) return name;
  return `${name.slice(0, MAX_THREAD_NAME_LENGTH - 3).trimEnd()}...`;
}

export function welcomePublicMessage(args: { memberId: string }): string {
  return [
    `Welcome <@${args.memberId}>.`,
    "I created a short Demerzel guide for you in the thread below.",
  ].join(" ");
}

export function welcomeTutorialMessage(args: {
  displayName: string;
  guildName: string;
}): string {
  const displayName = args.displayName.trim() || "there";
  return [
    `Hi ${displayName}, welcome to ${args.guildName}.`,
    "",
    "Quick Demerzel guide:",
    "- Mention Demerzel in any channel when you want Foundation: Galactic Frontier help, translation, reminders, or StarWarrior admin support.",
    "- Reply in this thread to ask Demerzel follow-up questions and keep setup, reminders, and translations in one place.",
    "- Use /language set for your preferred language, /translate for one-off text, and the globe reaction on a message for a private translation.",
    "- Demerzel answers in the language you use and can keep other-language translations inside threads.",
    "- Use her responsibly: do not share passwords, API keys, private data, or ask her to spam or ping people.",
  ].join("\n");
}

function isWelcomeMessage(message: unknown): message is WelcomeMessage {
  return (
    Boolean(message) &&
    typeof message === "object" &&
    typeof (message as { id?: unknown }).id === "string" &&
    typeof (message as { startThread?: unknown }).startThread === "function"
  );
}

function userMentionOnly(userId: string): MessageMentionOptions {
  return { users: [userId] };
}

export async function sendWelcomeGuide(args: {
  channel: HomeTextChannel;
  memberId: string;
  displayName: string;
  guildName: string;
}): Promise<{ messageId: string; threadId: string }> {
  const message = await args.channel.send({
    content: welcomePublicMessage({ memberId: args.memberId }),
    allowedMentions: userMentionOnly(args.memberId),
  });

  if (!isWelcomeMessage(message)) {
    throw new Error("welcome channel send did not return a threadable message");
  }

  const thread = await message.startThread({
    name: welcomeThreadName(args.displayName),
    autoArchiveDuration: WELCOME_THREAD_AUTO_ARCHIVE,
    reason: `Welcome guide for ${args.displayName}`,
  });

  await thread.members?.add(args.memberId, "Add new member to welcome thread")
    .catch((err) => {
      logger.warn(
        {
          err,
          discord: discordErrorDetails(err),
          memberId: args.memberId,
          threadId: thread.id,
        },
        "welcome thread member add failed",
      );
    });

  await thread.send({
    content: welcomeTutorialMessage({
      displayName: args.displayName,
      guildName: args.guildName,
    }),
    allowedMentions: NO_MENTIONS,
  });

  return { messageId: message.id, threadId: thread.id };
}

export function isUserJoinSystemMessage(message: {
  type: MessageType;
  guildId: string | null;
  author: { bot: boolean };
}): boolean {
  return (
    message.type === MessageType.UserJoin &&
    Boolean(message.guildId) &&
    !message.author.bot
  );
}

async function resolveWelcomeChannel(
  client: Client,
  guildId: string,
): Promise<HomeTextChannel | null> {
  return resolveHomeChannel(client, {
    channelId:
      config.DEMERZEL_WELCOME_CHANNEL_ID ??
      config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID,
    guildId,
    logLabel: "welcome",
  });
}

async function reserveAndSendWelcome(args: {
  store: WelcomeStore;
  channel: HomeTextChannel;
  eventKey: string;
  guildId: string;
  guildName: string;
  memberId: string;
  displayName: string;
  joinedAt: Date;
}): Promise<void> {
  const reserved = await args.store.reserve({
    eventKey: args.eventKey,
    guildId: args.guildId,
    discordUserId: args.memberId,
    channelId: args.channel.id,
    joinedAt: args.joinedAt,
  });
  if (!reserved) {
    logger.info(
      { eventKey: args.eventKey, memberId: args.memberId },
      "welcome already sent",
    );
    return;
  }

  try {
    const result = await sendWelcomeGuide({
      channel: args.channel,
      memberId: args.memberId,
      displayName: args.displayName,
      guildName: args.guildName,
    });
    await args.store.complete({ eventKey: args.eventKey, ...result });
    logger.info(
      {
        eventKey: args.eventKey,
        guildId: args.guildId,
        memberId: args.memberId,
        channelId: args.channel.id,
        messageId: result.messageId,
        threadId: result.threadId,
      },
      "welcome sent",
    );
  } catch (err) {
    await args.store.release(args.eventKey).catch((deleteErr) => {
      logger.warn(
        { err: deleteErr, eventKey: args.eventKey },
        "failed welcome reservation cleanup failed",
      );
    });
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        eventKey: args.eventKey,
        guildId: args.guildId,
        memberId: args.memberId,
        channelId: args.channel.id,
      },
      "welcome send failed",
    );
  }
}

export async function welcomeGuildMember(
  member: GuildMember,
  options: {
    store?: WelcomeStore;
    channel?: HomeTextChannel;
    grantChannelAccess?: boolean;
  } = {},
): Promise<void> {
  if (member.user.bot) return;

  if (options.grantChannelAccess ?? true) {
    await grantOnboardingTextChannelAccess({
      guild: member.guild,
      userId: member.id,
    });
  }

  const channel =
    options.channel ??
    (await resolveWelcomeChannel(member.client, member.guild.id));
  if (!channel) {
    logger.warn(
      {
        guildId: member.guild.id,
        configuredChannelId:
          config.DEMERZEL_WELCOME_CHANNEL_ID ??
          config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID,
      },
      "welcome skipped: no welcome channel found",
    );
    return;
  }

  const store = options.store ?? dbWelcomeStore;
  const joinedTimestamp = member.joinedTimestamp ?? null;
  const eventKey = welcomeEventKey({
    guildId: member.guild.id,
    discordUserId: member.id,
    joinedTimestamp,
  });
  const joinedAt = new Date(joinedTimestamp ?? Date.now());

  await reserveAndSendWelcome({
    store,
    channel,
    eventKey,
    guildId: member.guild.id,
    guildName: member.guild.name,
    memberId: member.id,
    displayName: member.displayName,
    joinedAt,
  });
}

export async function welcomeFromUserJoinSystemMessage(
  message: Message,
  options: {
    store?: WelcomeStore;
    channel?: HomeTextChannel;
    grantChannelAccess?: boolean;
  } = {},
): Promise<boolean> {
  if (!isUserJoinSystemMessage(message)) return false;

  const guildId = message.guildId;
  if (!guildId) return false;

  if (options.grantChannelAccess ?? true) {
    await grantOnboardingTextChannelAccessByGuildId({
      client: message.client,
      guildId,
      userId: message.author.id,
    });
  }

  const channel =
    options.channel ?? (await resolveWelcomeChannel(message.client, guildId));
  if (!channel) {
    logger.warn(
      {
        guildId,
        configuredChannelId:
          config.DEMERZEL_WELCOME_CHANNEL_ID ??
          config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID,
      },
      "welcome skipped: no welcome channel found",
    );
    return true;
  }

  const joinedTimestamp = message.createdTimestamp;
  const eventKey = welcomeEventKey({
    guildId,
    discordUserId: message.author.id,
    joinedTimestamp,
  });
  await reserveAndSendWelcome({
    store: options.store ?? dbWelcomeStore,
    channel,
    eventKey,
    guildId,
    guildName: message.guild?.name ?? "the server",
    memberId: message.author.id,
    displayName:
      message.member?.displayName ??
      message.author.globalName ??
      message.author.username,
    joinedAt: new Date(joinedTimestamp),
  });

  return true;
}
