import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Interaction,
  type Message,
} from "discord.js";
import { config } from "../config.js";
import { hermes } from "../hermes/agent.js";
import { logger } from "../logger.js";
import { preferences } from "../preferences/engine.js";
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
          .reply({ content: "Something went wrong.", ephemeral: true })
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
      const result = await hermes.translateForUser({
        text: message.content,
        requesterId: user.id,
        channelId: message.channelId,
        discordMessageId: message.id,
        targetLanguage: target,
      });

      const dm = await user.createDM();
      await dm.send(
        `${hermes.flag(result.targetLanguage)} ${result.translatedText}\n_from #${
          (message.channel as { name?: string }).name ?? "channel"
        }_`,
      );
    } catch (err) {
      logger.error({ err }, "reaction handler failed");
    }
  });

  // Message indexing: keep a record so future translations can hit cache without
  // refetching content. We don't translate proactively — that's the whole point.
  client.on(Events.MessageCreate, async (message: Message) => {
    try {
      if (message.author.bot) return;
      if (!message.content || message.content.length < 2) return;
      await hermes.indexMessage(message);
    } catch (err) {
      logger.error({ err, messageId: message.id }, "indexing failed");
    }
  });

  return client;
}

export async function startClient(): Promise<Client> {
  const client = buildClient();
  await client.login(config.DISCORD_TOKEN);
  return client;
}
