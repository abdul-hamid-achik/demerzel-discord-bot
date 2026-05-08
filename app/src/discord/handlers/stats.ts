import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags } from "discord.js";
import { analytics } from "../../analytics/engine.js";

export async function handleStats(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const [languages, channels, userCount] = await Promise.all([
    analytics.languagePopularity(5),
    analytics.channelActivity(5),
    analytics.userRequestCount(interaction.user.id),
  ]);

  const langLines =
    languages.map((l) => `\`${l.language}\` — ${l.count}`).join("\n") || "_no data_";
  const chanLines =
    channels.map((c) => `<#${c.channelId}> — ${c.count}`).join("\n") || "_no data_";

  const embed = new EmbedBuilder()
    .setTitle("Demerzel translation stats")
    .addFields(
      { name: "Top languages", value: langLines, inline: true },
      { name: "Top channels", value: chanLines, inline: true },
      { name: "Your requests", value: String(userCount), inline: false },
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
