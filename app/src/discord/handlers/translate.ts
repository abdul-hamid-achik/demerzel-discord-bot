import type {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";
import { agent } from "../../agent/agent.js";
import { chunkDiscordText, NO_MENTIONS } from "../messages.js";

async function editEphemeralTranslationReply(
  interaction:
    | ChatInputCommandInteraction
    | MessageContextMenuCommandInteraction,
  content: string,
): Promise<void> {
  const [first, ...rest] = chunkDiscordText(content);
  await interaction.editReply({
    content: first ?? "",
    allowedMentions: NO_MENTIONS,
  });
  for (const chunk of rest) {
    await interaction.followUp({
      content: chunk,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
  }
}

export async function handleTranslateSlash(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const text = interaction.options.getString("text", true);
  const target = interaction.options.getString("to", true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await agent.translateForUser({
    text,
    requesterId: interaction.user.id,
    channelId: interaction.channelId,
    targetLanguage: target,
  });

  await editEphemeralTranslationReply(
    interaction,
    [
      `${agent.flag(result.targetLanguage)} ${result.translatedText}`,
      `_${result.sourceLanguage} → ${result.targetLanguage} · ${result.provider}${result.cached ? " · cached" : ""}_`,
    ].join("\n"),
  );
}

export async function handleTranslateContext(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  const text = interaction.targetMessage.content;
  if (!text) {
    await interaction.reply({
      content: "Nothing to translate (message has no text content).",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await agent.translateForUser({
    text,
    requesterId: interaction.user.id,
    channelId: interaction.channelId,
    discordMessageId: interaction.targetMessage.id,
  });

  await editEphemeralTranslationReply(
    interaction,
    [
      `${agent.flag(result.targetLanguage)} ${result.translatedText}`,
      `_${result.sourceLanguage} → ${result.targetLanguage} · ${result.provider}${result.cached ? " · cached" : ""}_`,
    ].join("\n"),
  );
}
