import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import { effectiveCleanupMinutes } from "../../agent/cleanup.js";
import { channels } from "../../channels/engine.js";
import { parseLanguages } from "../../translation/lang-util.js";

export async function handleAutoTranslate(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "This command only works in servers.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true);

  if (sub === "enable") {
    const langs = parseLanguages(interaction.options.getString("languages"));
    const cleanupOpt = interaction.options.getInteger("cleanup_minutes");
    await channels.enableAutoTranslate({
      channelId: interaction.channelId,
      guildId: interaction.guildId, // non-null after inGuild() check above
      targetLanguages: langs,
      cleanupMinutes: cleanupOpt,
    });
    const effective = effectiveCleanupMinutes(cleanupOpt);
    const cleanupLine =
      effective === 0
        ? "Threads are kept forever (`cleanup_minutes:0`)."
        : `Threads with no replies are deleted after **${effective} min**.`;
    await interaction.reply({
      content: [
        `Auto-translate **enabled** in this channel.`,
        `Target languages: \`${langs.join(", ")}\``,
        cleanupLine,
        ``,
        `Every message gets a translation thread; threads with real replies are kept.`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "disable") {
    await channels.disableAutoTranslate(interaction.channelId);
    await interaction.reply({
      content: "Auto-translate **disabled** in this channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === "status") {
    const setting = await channels.get(interaction.channelId);
    if (!setting || !setting.autoTranslate) {
      await interaction.reply({
        content: "Auto-translate is **off** in this channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const effective = effectiveCleanupMinutes(setting.cleanupMinutes);
    const cleanupLine =
      effective === 0
        ? "Cleanup: **off** (threads are kept forever)"
        : `Cleanup: threads without replies deleted after **${effective} min**`;
    await interaction.reply({
      content: [
        `Auto-translate is **on** in this channel.`,
        `Target languages: \`${setting.targetLanguages.join(", ")}\``,
        cleanupLine,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}
