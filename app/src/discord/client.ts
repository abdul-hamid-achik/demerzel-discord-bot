import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  RESTEvents,
  type Channel,
  type Interaction,
  type Message,
} from "discord.js";
import { config } from "../config.js";
import { agent } from "../agent/agent.js";
import { logger } from "../logger.js";
import { preferences } from "../preferences/engine.js";
import { handleArchiveTranslations } from "./handlers/archive.js";
import { handleAutoTranslate } from "./handlers/auto-translate.js";
import { handleLanguage } from "./handlers/language.js";
import { handleMention, isAddressedToBot } from "./handlers/mention.js";
import { handleStats } from "./handlers/stats.js";
import {
  handleTranslateContext,
  handleTranslateSlash,
} from "./handlers/translate.js";
import {
  handleTranslateThreadContext,
  handleTranslateThreadSlash,
} from "./handlers/translate-thread.js";
import { handleReminder } from "./handlers/reminder.js";
import { handleCmsMember } from "./handlers/cms-member.js";
import { handleCmsOperation } from "./handlers/cms-operation.js";
import { handleCmsEvent } from "./handlers/cms-event.js";
import { handleCmsI18n } from "./handlers/cms-i18n.js";
import { handleCmsContent } from "./handlers/cms-content.js";
import { discordErrorDetails, NO_MENTIONS } from "./messages.js";
import { startReminderScheduler } from "../reminders/scheduler.js";
import { announceReleaseIfNeeded } from "../announcements/release.js";
import {
  welcomeFromUserJoinSystemMessage,
  welcomeGuildMember,
} from "../welcome/engine.js";

function channelName(channel: Channel): string {
  return "name" in channel && typeof channel.name === "string"
    ? channel.name
    : "channel";
}

// Keep recovery sweeps aligned with reminder reconciliation so an idle Neon
// compute gets one bounded wake window instead of a database read every
// fifteen minutes. Per-thread timers still handle normal cleanup promptly.
const TRANSLATION_THREAD_SWEEP_INTERVAL_MS = 6 * 60 * 60_000;

async function sweepGuildTranslationThreads(
  client: Client,
  reason: "startup" | "interval",
): Promise<void> {
  let archived = 0;
  let kept = 0;

  for (const guild of client.guilds.cache.values()) {
    const result = await agent.sweepStaleTranslationThreadsInGuild(guild);
    archived += result.archived;
    kept += result.kept;
  }

  if (archived > 0) {
    logger.info(
      { archived, kept, guilds: client.guilds.cache.size, reason },
      "stale translation thread sweep archived threads",
    );
  }
}

function startTranslationThreadSweeper(client: Client): void {
  void sweepGuildTranslationThreads(client, "startup").catch((err) => {
    logger.warn({ err }, "startup translation thread sweep failed");
  });

  setInterval(() => {
    void sweepGuildTranslationThreads(client, "interval").catch((err) => {
      logger.warn({ err }, "periodic translation thread sweep failed");
    });
  }, TRANSLATION_THREAD_SWEEP_INTERVAL_MS).unref?.();
}

export function isDisallowedIntentError(err: unknown): boolean {
  return err instanceof Error && err.message === "Used disallowed intents";
}

export function buildClient(
  options: { welcomeEnabled?: boolean } = {},
): Client {
  const welcomeEnabled = options.welcomeEnabled ?? true;
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ];
  if (welcomeEnabled) {
    intents.push(GatewayIntentBits.GuildMembers);
  }

  const client = new Client({
    intents,
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ user: c.user.tag }, "discord client ready");
    startReminderScheduler(client);
    startTranslationThreadSweeper(client);
    void announceReleaseIfNeeded(client).catch((err) => {
      logger.warn({ err }, "release announcement failed");
    });
  });

  client.on(Events.Error, (err) => {
    logger.error(
      { err, discord: discordErrorDetails(err) },
      "discord client error",
    );
  });

  client.on(Events.ShardError, (err, shardId) => {
    if (welcomeEnabled && isDisallowedIntentError(err)) {
      logger.warn(
        {
          err,
          discord: discordErrorDetails(err),
          shardId,
        },
        "discord rejected Server Members Intent; retrying without welcomes",
      );
      return;
    }

    logger.error(
      { err, discord: discordErrorDetails(err), shardId },
      "discord shard error",
    );
  });

  client.on(Events.Warn, (warning) => {
    logger.warn({ warning }, "discord client warning");
  });

  if (welcomeEnabled) {
    client.on(Events.GuildMemberAdd, async (member) => {
      try {
        await welcomeGuildMember(member);
      } catch (err) {
        logger.error(
          {
            err,
            discord: discordErrorDetails(err),
            guildId: member.guild.id,
            memberId: member.id,
          },
          "guild member welcome handler failed",
        );
      }
    });
  }

  client.rest.on(RESTEvents.RateLimited, (data) => {
    logger.warn(
      {
        route: data.route,
        method: data.method,
        retryAfter: data.retryAfter,
        timeToReset: data.timeToReset,
        limit: data.limit,
        global: data.global,
        scope: data.scope,
      },
      "discord REST rate limited",
    );
  });

  client.rest.on(RESTEvents.InvalidRequestWarning, (data) => {
    logger.warn({ data }, "discord REST invalid request warning");
  });

  client.rest.on(RESTEvents.Response, (request, response) => {
    if (response.status < 400) return;
    logger.warn(
      {
        request: {
          method: request.method,
          path: request.path,
          route: request.route,
          retries: request.retries,
        },
        response: {
          status: response.status,
          statusText: response.statusText,
        },
      },
      "discord REST error response",
    );
  });

  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        switch (interaction.commandName) {
          case "language":
            return await handleLanguage(interaction);
          case "translate":
            return await handleTranslateSlash(interaction);
          case "translate-thread":
            return await handleTranslateThreadSlash(interaction);
          case "stats":
            return await handleStats(interaction);
          case "auto-translate":
            return await handleAutoTranslate(interaction);
          case "archive-translations":
            return await handleArchiveTranslations(interaction);
          case "reminder":
            return await handleReminder(interaction);
          case "cms-member":
            return await handleCmsMember(interaction);
          case "cms-operation":
            return await handleCmsOperation(interaction);
          case "cms-event":
            return await handleCmsEvent(interaction);
          case "cms-i18n":
            return await handleCmsI18n(interaction);
          case "cms-content":
            return await handleCmsContent(interaction);
        }
      }
      if (interaction.isMessageContextMenuCommand()) {
        if (interaction.commandName === "Translate Message") {
          return await handleTranslateContext(interaction);
        }
        if (interaction.commandName === "Open Translation Thread") {
          return await handleTranslateThreadContext(interaction);
        }
      }
    } catch (err) {
      logger.error({ err }, "interaction handler failed");
      if (interaction.isRepliable() && !interaction.replied) {
        if (interaction.deferred) {
          await interaction
            .editReply({
              content: "Something went wrong.",
              allowedMentions: NO_MENTIONS,
            })
            .catch((replyErr) =>
              logger.warn(
                {
                  err: replyErr,
                  discord: discordErrorDetails(replyErr),
                  interactionId: interaction.id,
                },
                "interaction error editReply failed",
              ),
            );
        } else {
          await interaction
            .reply({
              content: "Something went wrong.",
              flags: MessageFlags.Ephemeral,
              allowedMentions: NO_MENTIONS,
            })
            .catch((replyErr) =>
              logger.warn(
                {
                  err: replyErr,
                  discord: discordErrorDetails(replyErr),
                  interactionId: interaction.id,
                },
                "interaction error reply failed",
              ),
            );
        }
      }
    }
  });

  // Reaction trigger: 🌐 on a message → translate to reactor's primary language.
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      if (reaction.emoji.name !== "🌐") return;

      const message = reaction.message.partial
        ? await reaction.message.fetch()
        : reaction.message;
      if (!message.content) return;

      const target = await preferences.getPrimaryLanguage(user.id);
      const result = await agent.translateForUser({
        text: message.content,
        requesterId: user.id,
        channelId: message.channelId,
        discordMessageId: message.id,
        targetLanguage: target,
      });

      const dm = await user.createDM();
      await dm.send({
        content: `${agent.flag(result.targetLanguage)} ${result.translatedText}\n_from #${channelName(message.channel)}_`,
        allowedMentions: NO_MENTIONS,
      });
    } catch (err) {
      logger.error(
        { err, discord: discordErrorDetails(err) },
        "reaction handler failed",
      );
    }
  });

  // Handles direct bot mentions, then lets opted-in channels create translation
  // threads. Message indexing now happens inside the features that need it so
  // quiet channels don't pay DB/language-detection cost on every message.
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (!welcomeEnabled) {
        const handledWelcome = await welcomeFromUserJoinSystemMessage(message);
        if (handledWelcome) return;
      }

      if (message.author.bot) return;
      logger.info(
        {
          messageId: message.id,
          channelId: message.channelId,
          guildId: message.guildId,
          authorId: message.author.id,
          authorTag: message.author.tag,
          contentLen: message.content?.length ?? 0,
          channelType: message.channel.type,
        },
        "messageCreate received",
      );
      if (!message.content) return;

      // If the user is talking *to* the bot, route to the AI chat handler and
      // skip auto-translate — we don't want a translation thread under a
      // direct question to Demerzel.
      if (await isAddressedToBot(message)) {
        await handleMention(message);
        return;
      }

      // Run sweep + auto-translate in parallel; sweep failures don't block translation
      const [sweepResult, translateResult] = await Promise.allSettled([
        agent.sweepStaleThreads(message),
        agent.autoTranslateMessage(message),
      ]);
      if (sweepResult.status === "rejected") {
        logger.warn(
          { err: sweepResult.reason, messageId: message.id },
          "stale thread sweep failed",
        );
      }
      if (translateResult.status === "rejected") {
        logger.error(
          { err: translateResult.reason, messageId: message.id },
          "auto-translate handler failed",
        );
      }
    } catch (err) {
      logger.error(
        { err, messageId: message.id },
        "messageCreate handler failed",
      );
    }
  });

  return client;
}

export async function startClient(): Promise<Client> {
  const client = buildClient({ welcomeEnabled: true });
  try {
    await client.login(config.DISCORD_TOKEN);
    return client;
  } catch (err) {
    await client.destroy();
    if (!isDisallowedIntentError(err)) throw err;

    logger.warn(
      { err, discord: discordErrorDetails(err) },
      "welcome startup disabled: enable Server Members Intent in Discord Developer Portal",
    );

    const fallbackClient = buildClient({ welcomeEnabled: false });
    await fallbackClient.login(config.DISCORD_TOKEN);
    return fallbackClient;
  }
}
