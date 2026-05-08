import type { ChatInputCommandInteraction, MessageContextMenuCommandInteraction } from "discord.js";
import { ChannelType, MessageFlags } from "discord.js";
import { agent } from "../../agent/agent.js";

const DEFAULT_LANGUAGES = ["en", "es", "it", "pt"];

function parseLanguages(raw: string | null): string[] {
  if (!raw) return DEFAULT_LANGUAGES;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

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
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const recent = await interaction.channel.messages.fetch({ limit: 1 });
  const message = recent.first();
  if (!message) {
    await interaction.editReply("No recent message found in this channel.");
    return;
  }

  const languages = parseLanguages(interaction.options.getString("languages"));
  await agent.createTranslationThread(message, languages);
  await interaction.editReply(`Translation thread created on the latest message.`);
}

export async function handleTranslateThreadContext(
  interaction: MessageContextMenuCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await agent.createTranslationThread(interaction.targetMessage, DEFAULT_LANGUAGES);
  await interaction.editReply("Translation thread created.");
}
