import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { analytics } from "../../analytics/engine.js";
import { preferences } from "../../preferences/engine.js";
import { NO_MENTIONS } from "../messages.js";

export async function handleLanguage(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === "set") {
    const code = interaction.options.getString("code", true);
    await preferences.setPrimaryLanguage(interaction.user.id, code);
    await analytics.record({
      discordUserId: interaction.user.id,
      channelId: interaction.channelId,
      targetLanguage: code,
      eventType: "language_set",
    });
    await interaction.reply({
      content: `Primary language set to **${code}**.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (sub === "show") {
    const pref = await preferences.get(interaction.user.id);
    if (!pref) {
      await interaction.reply({
        content: "No preferences set yet. Try `/language set`.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }
    const lines = [
      `**Primary:** ${pref.primaryLanguage}`,
      `**Secondary:** ${pref.secondaryLanguages.join(", ") || "—"}`,
      `**Show original:** ${pref.showOriginal ? "on" : "off"}`,
    ];
    await interaction.reply({
      content: lines.join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }
}
