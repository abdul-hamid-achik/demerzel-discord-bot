import type {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
} from "discord.js";
import { ChannelType, MessageFlags } from "discord.js";
import { agent } from "../../agent/agent.js";
import {
  DEFAULT_TARGET_LANGUAGES,
  parseLanguages,
} from "../../translation/lang-util.js";
import { NO_MENTIONS } from "../messages.js";

export async function handleTranslateThreadSlash(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (
    !interaction.channel ||
    (interaction.channel.type !== ChannelType.GuildText &&
      interaction.channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await interaction.reply({
      content: "This command only works in standard text channels.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const recent = await interaction.channel.messages.fetch({ limit: 1 });
  const message = recent.first();
  if (!message) {
    await interaction.editReply({
      content: "No recent message found in this channel.",
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  const languages = parseLanguages(interaction.options.getString("languages"));
  await agent.createTranslationThread(message, languages);
  await interaction.editReply({
    content: "Translation thread created on the latest message.",
    allowedMentions: NO_MENTIONS,
  });
}

export async function handleTranslateThreadContext(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await agent.createTranslationThread(
    interaction.targetMessage,
    DEFAULT_TARGET_LANGUAGES,
  );
  await interaction.editReply({
    content: "Translation thread created.",
    allowedMentions: NO_MENTIONS,
  });
}
