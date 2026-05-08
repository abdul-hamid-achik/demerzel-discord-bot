import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type Channel,
  type Interaction,
  type Message,
} from "discord.js";
import { config } from "../config.js";
import { agent } from "../agent/agent.js";
import { logger } from "../logger.js";
import { preferences } from "../preferences/engine.js";
import { handleAutoTranslate } from "./handlers/auto-translate.js";
import { handleLanguage } from "./handlers/language.js";
import { handleStats } from "./handlers/stats.js";
import {
  handleTranslateContext,
  handleTranslateSlash,
} from "./handlers/translate.js";
import {
  handleTranslateThreadContext,
  handleTranslateThreadSlash,
} from "./handlers/translate-thread.js";

function channelName(channel: Channel): string {
  return "name" in channel && typeof channel.name === "string" ? channel.name : "channel";
}

export function buildClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ user: c.user.tag }, "discord client ready");
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
        await interaction
          .reply({ content: "Something went wrong.", flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
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
      await dm.send(
        `${agent.flag(result.targetLanguage)} ${result.translatedText}\n_from #${channelName(message.channel)}_`,
      );
    } catch (err) {
      logger.error({ err }, "reaction handler failed");
    }
  });

  // Indexes every user message (cheap, lets future on-demand translations hit
  // cache) and — in channels that opted in via /auto-translate — posts a
  // translation thread under the message.
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
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
      await agent.indexMessage(message);
      // Run sweep + auto-translate in parallel; sweep failures don't block translation
      await Promise.allSettled([
        agent.sweepStaleThreads(message),
        agent.autoTranslateMessage(message),
      ]);
    } catch (err) {
      logger.error({ err, messageId: message.id }, "messageCreate handler failed");
    }
  });

  return client;
}

export async function startClient(): Promise<Client> {
  const client = buildClient();
  await client.login(config.DISCORD_TOKEN);
  return client;
}
