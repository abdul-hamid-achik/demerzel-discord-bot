import {
  ChannelType,
  type Client,
  type Message,
} from "discord.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { releaseAnnouncements } from "../db/schema.js";
import { logger } from "../logger.js";
import {
  discordErrorDetails,
  isDiscordChunkTarget,
  NO_MENTIONS,
} from "../discord/messages.js";

const DEFAULT_RELEASE_NOTES_FILE = "RELEASE_NOTES.md";
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(MODULE_DIR, "../..");

interface ReleaseMetadata {
  version: string;
  notes: string;
  notesHash: string;
  releaseId: string;
}

export function releaseNotesHash(notes: string): string {
  return createHash("sha256").update(notes.trim()).digest("hex");
}

export function normalizeReleaseNotes(raw: string | undefined): string {
  return (raw ?? "")
    .split(/\\n|\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function releaseAnnouncementMessage(args: {
  version: string;
  notes: string;
}): string {
  return [
    `Demerzel has been updated (${args.version}).`,
    "",
    args.notes,
    "",
    "Reply to Demerzel in a conversation thread to keep reminders, translations, and channel settings in context.",
  ].join("\n");
}

export function isDefaultAnnouncementChannel(
  channel: { type: ChannelType; name: string } | null,
): boolean {
  if (!channel) return false;
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    return false;
  }

  return channel.name.toLowerCase().includes("home");
}

async function readPackageVersion(): Promise<string> {
  const raw = await readFile(resolve(APP_DIR, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" && parsed.version.trim()
    ? parsed.version.trim()
    : "unknown";
}

async function readReleaseNotes(): Promise<string> {
  const fromEnv = normalizeReleaseNotes(config.DEMERZEL_RELEASE_NOTES);
  if (fromEnv) return fromEnv;

  const filePath = resolve(
    APP_DIR,
    config.DEMERZEL_RELEASE_NOTES_FILE?.trim() || DEFAULT_RELEASE_NOTES_FILE,
  );

  try {
    return normalizeReleaseNotes(await readFile(filePath, "utf8"));
  } catch (err) {
    logger.debug({ err, filePath }, "release notes file unavailable");
    return "";
  }
}

async function releaseMetadata(): Promise<ReleaseMetadata | null> {
  const notes = await readReleaseNotes();
  if (!notes) return null;

  const version = config.DEMERZEL_RELEASE_ID?.trim() || (await readPackageVersion());
  const notesHash = releaseNotesHash(notes);
  const releaseId = config.DEMERZEL_RELEASE_ID?.trim() || `${version}:${notesHash.slice(0, 16)}`;

  return { version, notes, notesHash, releaseId };
}

async function resolveAnnouncementChannel(client: Client) {
  if (config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID) {
    const channel = await client.channels
      .fetch(config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID)
      .catch((err) => {
        logger.warn(
          {
            err,
            discord: discordErrorDetails(err),
            channelId: config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID,
          },
          "configured announcement channel fetch failed",
        );
        return null;
      });

    return channel && isDiscordChunkTarget(channel) ? channel : null;
  }

  if (!config.DISCORD_GUILD_ID) return null;

  const guild = await client.guilds.fetch(config.DISCORD_GUILD_ID).catch((err) => {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        guildId: config.DISCORD_GUILD_ID,
      },
      "announcement guild fetch failed",
    );
    return null;
  });
  if (!guild) return null;

  const channels = await guild.channels.fetch().catch((err) => {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        guildId: config.DISCORD_GUILD_ID,
      },
      "announcement channel list fetch failed",
    );
    return null;
  });
  if (!channels) return null;

  const home = channels.find((channel) =>
    isDefaultAnnouncementChannel(channel),
  );

  return home && isDiscordChunkTarget(home) ? home : null;
}

async function reserveReleaseAnnouncement(
  metadata: ReleaseMetadata,
  channelId: string,
): Promise<boolean> {
  const [row] = await db
    .insert(releaseAnnouncements)
    .values({
      releaseId: metadata.releaseId,
      channelId,
      notesHash: metadata.notesHash,
    })
    .onConflictDoNothing()
    .returning();

  return Boolean(row);
}

async function completeReleaseAnnouncement(args: {
  releaseId: string;
  messageId: string | null;
}): Promise<void> {
  await db
    .update(releaseAnnouncements)
    .set({ messageId: args.messageId })
    .where(eq(releaseAnnouncements.releaseId, args.releaseId));
}

async function releaseAnnouncementFailed(releaseId: string): Promise<void> {
  await db
    .delete(releaseAnnouncements)
    .where(eq(releaseAnnouncements.releaseId, releaseId));
}

export async function announceReleaseIfNeeded(client: Client): Promise<void> {
  const metadata = await releaseMetadata();
  if (!metadata) {
    logger.debug("release announcement skipped: no release notes");
    return;
  }

  const channel = await resolveAnnouncementChannel(client);
  if (!channel) {
    logger.warn(
      {
        configuredChannelId: config.DEMERZEL_ANNOUNCEMENT_CHANNEL_ID,
        guildId: config.DISCORD_GUILD_ID,
      },
      "release announcement skipped: no announcement channel found",
    );
    return;
  }

  const reserved = await reserveReleaseAnnouncement(metadata, channel.id);
  if (!reserved) {
    logger.info(
      { releaseId: metadata.releaseId },
      "release announcement already sent",
    );
    return;
  }

  try {
    let sentMessageId: string | null = null;
    const response = await channel.send({
      content: releaseAnnouncementMessage(metadata),
      allowedMentions: NO_MENTIONS,
    });
    sentMessageId = (response as Message).id ?? null;
    await completeReleaseAnnouncement({
      releaseId: metadata.releaseId,
      messageId: sentMessageId,
    });
    logger.info(
      {
        releaseId: metadata.releaseId,
        channelId: channel.id,
        messageId: sentMessageId,
      },
      "release announcement sent",
    );
  } catch (err) {
    await releaseAnnouncementFailed(metadata.releaseId).catch((deleteErr) => {
      logger.warn(
        { err: deleteErr, releaseId: metadata.releaseId },
        "failed release announcement reservation cleanup failed",
      );
    });
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        releaseId: metadata.releaseId,
        channelId: channel.id,
      },
      "release announcement send failed",
    );
  }
}
