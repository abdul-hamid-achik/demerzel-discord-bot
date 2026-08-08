import {
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type Guild,
} from "discord.js";
import { config } from "../config.js";
import { discordErrorDetails } from "../discord/messages.js";
import { logger } from "../logger.js";

const DEFAULT_TEXT_CATEGORY_NAMES = new Set(["canali testuali", "text channels"]);

interface OnboardingChannel {
  id: string;
  name: string;
  type: ChannelType;
  parentId?: string | null;
  permissionOverwrites?: {
    edit(
      userId: string,
      permissions: Partial<Record<keyof typeof PermissionFlagsBits, boolean>>,
      options?: { reason?: string },
    ): Promise<unknown>;
  };
}

interface OnboardingChannelCollection {
  values(): IterableIterator<OnboardingChannel>;
  get(id: string): OnboardingChannel | undefined;
  filter(
    predicate: (channel: OnboardingChannel) => boolean,
  ): OnboardingChannelCollection;
}

type OnboardingAccessScope = "all_text" | "configured";

export function parseConfiguredChannelIds(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isOnboardingTextChannel(channel: {
  type: ChannelType;
}): boolean {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.GuildAnnouncement
  );
}

function isDefaultTextCategory(channel: OnboardingChannel): boolean {
  if (channel.type !== ChannelType.GuildCategory) return false;
  return DEFAULT_TEXT_CATEGORY_NAMES.has(channel.name.trim().toLowerCase());
}

export function selectOnboardingChannels(
  channels: OnboardingChannelCollection,
  options: {
    accessScope?: OnboardingAccessScope;
    configuredChannelIds?: string[];
    configuredCategoryId?: string;
    excludedChannelIds?: string[];
    excludedCategoryIds?: string[];
  } = {},
): OnboardingChannel[] {
  const channelsList = Array.from(channels.values());
  const accessScope = options.accessScope ?? "all_text";
  const excludedChannelIds = new Set(options.excludedChannelIds ?? []);
  const excludedCategoryIds = new Set(options.excludedCategoryIds ?? []);
  const includedTextChannel = (channel: OnboardingChannel) =>
    isOnboardingTextChannel(channel) &&
    !excludedChannelIds.has(channel.id) &&
    !excludedCategoryIds.has(channel.parentId ?? "");

  if (accessScope === "all_text") {
    return channelsList.filter((channel) => includedTextChannel(channel));
  }

  const configuredChannelIds = options.configuredChannelIds ?? [];
  if (configuredChannelIds.length > 0) {
    return configuredChannelIds
      .map((id) => channels.get(id))
      .filter((channel): channel is OnboardingChannel =>
        Boolean(channel && includedTextChannel(channel)),
      );
  }

  const categoryId =
    options.configuredCategoryId ??
    channelsList.find((channel) => isDefaultTextCategory(channel))?.id;

  const selected = channelsList.filter(
    (channel) =>
      includedTextChannel(channel) &&
      (!categoryId || channel.parentId === categoryId),
  );

  return selected.length > 0
    ? selected
    : channelsList.filter((channel) => includedTextChannel(channel));
}

export async function grantOnboardingTextChannelAccess(args: {
  guild: Guild;
  userId: string;
}): Promise<void> {
  const channels = await args.guild.channels.fetch().catch((err) => {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        guildId: args.guild.id,
        userId: args.userId,
      },
      "onboarding channel list fetch failed",
    );
    return null;
  });
  if (!channels) return;

  const targets = selectOnboardingChannels(
    channels as unknown as OnboardingChannelCollection,
    {
      accessScope: config.DEMERZEL_ONBOARDING_ACCESS_SCOPE,
      configuredChannelIds: parseConfiguredChannelIds(
        config.DEMERZEL_ONBOARDING_CHANNEL_IDS,
      ),
      configuredCategoryId: config.DEMERZEL_ONBOARDING_CATEGORY_ID,
      excludedChannelIds: parseConfiguredChannelIds(
        config.DEMERZEL_ONBOARDING_EXCLUDED_CHANNEL_IDS,
      ),
      excludedCategoryIds: parseConfiguredChannelIds(
        config.DEMERZEL_ONBOARDING_EXCLUDED_CATEGORY_IDS,
      ),
    },
  );

  if (targets.length === 0) {
    logger.warn(
      { guildId: args.guild.id, userId: args.userId },
      "onboarding skipped: no text channels found",
    );
    return;
  }

  const permissions = {
    ViewChannel: true,
    ReadMessageHistory: true,
    SendMessages: true,
    SendMessagesInThreads: true,
    UseApplicationCommands: true,
  } satisfies Partial<Record<keyof typeof PermissionFlagsBits, boolean>>;

  const results = await Promise.allSettled(
    targets.map((channel) =>
      channel.permissionOverwrites?.edit(args.userId, permissions, {
        reason: "Demerzel onboarding text channel access",
      }),
    ),
  );

  let granted = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    if (result.status === "fulfilled") {
      granted += 1;
      continue;
    }

    const channel = targets[i]!;
    logger.warn(
      {
        err: result.reason,
        discord: discordErrorDetails(result.reason),
        guildId: args.guild.id,
        userId: args.userId,
        channelId: channel.id,
        channelName: channel.name,
      },
      "onboarding channel permission grant failed",
    );
  }

  logger.info(
    {
      guildId: args.guild.id,
      userId: args.userId,
      granted,
      attempted: targets.length,
      accessScope: config.DEMERZEL_ONBOARDING_ACCESS_SCOPE,
      channelIds: targets.map((channel) => channel.id),
    },
    "onboarding text channel access processed",
  );
}

export async function grantOnboardingTextChannelAccessByGuildId(args: {
  client: Client;
  guildId: string;
  userId: string;
}): Promise<void> {
  const guild = await args.client.guilds.fetch(args.guildId).catch((err) => {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        guildId: args.guildId,
        userId: args.userId,
      },
      "onboarding guild fetch failed",
    );
    return null;
  });
  if (!guild) return;

  await grantOnboardingTextChannelAccess({
    guild,
    userId: args.userId,
  });
}
