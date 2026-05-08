import type { ChatInputCommandInteraction, MessageContextMenuCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { hermes } from "../../hermes/agent.js";

export async function handleTranslateSlash(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const text = interaction.options.getString("text", true);
  const target = interaction.options.getString("to") ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await hermes.translateForUser({
    text,
    requesterId: interaction.user.id,
    channelId: interaction.channelId,
    targetLanguage: target,
  });

  await interaction.editReply({
    content: [
      `${hermes.flag(result.targetLanguage)} ${result.translatedText}`,
      `_${result.sourceLanguage} → ${result.targetLanguage} · ${result.provider}${result.cached ? " · cached" : ""}_`,
    ].join("\n"),
  });
}

export async function handleTranslateContext(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  const text = interaction.targetMessage.content;
  if (!text) {
    await interaction.reply({
      content: "Nothing to translate (message has no text content).",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await hermes.translateForUser({
    text,
    requesterId: interaction.user.id,
    channelId: interaction.channelId,
    discordMessageId: interaction.targetMessage.id,
  });

  await interaction.editReply({
    content: [
      `${hermes.flag(result.targetLanguage)} ${result.translatedText}`,
      `_${result.sourceLanguage} → ${result.targetLanguage} · ${result.provider}${result.cached ? " · cached" : ""}_`,
    ].join("\n"),
  });
}
