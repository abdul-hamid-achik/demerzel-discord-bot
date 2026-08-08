import { ChannelType, type Client } from "discord.js";
import { logger } from "../logger.js";
import {
  discordErrorDetails,
  isDiscordChunkTarget,
  type DiscordChunkTarget,
} from "./messages.js";

export interface HomeTextChannel extends DiscordChunkTarget {
  id: string;
}

export function isDefaultHomeChannel(
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

function isHomeTextChannel(channel: unknown): channel is HomeTextChannel {
  return (
    isDiscordChunkTarget(channel) &&
    typeof (channel as { id?: unknown }).id === "string"
  );
}

export async function resolveHomeChannel(
  client: Client,
  args: {
    channelId?: string;
    guildId?: string | null;
    logLabel: string;
  },
): Promise<HomeTextChannel | null> {
  if (args.channelId) {
    const channel = await client.channels.fetch(args.channelId).catch((err) => {
      logger.warn(
        {
          err,
          discord: discordErrorDetails(err),
          channelId: args.channelId,
        },
        `${args.logLabel} channel fetch failed`,
      );
      return null;
    });

    return isHomeTextChannel(channel) ? channel : null;
  }

  if (!args.guildId) return null;

  const guild = await client.guilds.fetch(args.guildId).catch((err) => {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        guildId: args.guildId,
      },
      `${args.logLabel} guild fetch failed`,
    );
    return null;
  });
  if (!guild) return null;

  const channels = await guild.channels.fetch().catch((err) => {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        guildId: args.guildId,
      },
      `${args.logLabel} channel list fetch failed`,
    );
    return null;
  });
  if (!channels) return null;

  const home = channels.find((channel) => isDefaultHomeChannel(channel));
  return isHomeTextChannel(home) ? home : null;
}
