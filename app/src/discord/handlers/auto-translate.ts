import type { ChatInputCommandInteraction } from "discord.js";
import { ChannelType, MessageFlags } from "discord.js";
import { effectiveCleanupMinutes } from "../../agent/cleanup.js";
import { channels } from "../../channels/engine.js";
import { parseLanguages } from "../../translation/lang-util.js";
import { NO_MENTIONS } from "../messages.js";

function configurationTarget(
  interaction: ChatInputCommandInteraction,
): { channelId: string; scope: string } {
  const channel = interaction.channel;
  if (
    channel &&
    (channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread ||
      channel.type === ChannelType.AnnouncementThread) &&
    "parentId" in channel &&
    channel.parentId
  ) {
    return { channelId: channel.parentId, scope: "parent channel" };
  }

  return { channelId: interaction.channelId, scope: "this channel" };
}

export async function handleAutoTranslate(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "This command only works in servers.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  const sub = interaction.options.getSubcommand(true);
  const target = configurationTarget(interaction);

  if (sub === "enable") {
    const langs = parseLanguages(interaction.options.getString("languages"));
    const cleanupOpt = interaction.options.getInteger("cleanup_minutes");
    await channels.enableAutoTranslate({
      channelId: target.channelId,
      guildId: interaction.guildId, // non-null after inGuild() check above
      targetLanguages: langs,
      cleanupMinutes: cleanupOpt,
    });
    const effective = effectiveCleanupMinutes(cleanupOpt);
    const cleanupLine =
      effective === 0
        ? "Threads are kept active forever (`cleanup_minutes:0`)."
        : `Threads with no replies are archived after **${effective} min** (history preserved).`;
    await interaction.reply({
      content: [
        `Auto-translate **enabled** for ${target.scope}.`,
        `Target languages: \`${langs.join(", ")}\``,
        cleanupLine,
        ``,
        `Top-level messages get translation threads; thread messages get translation replies.`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (sub === "disable") {
    await channels.disableAutoTranslate(target.channelId);
    await interaction.reply({
      content: `Auto-translate **disabled** for ${target.scope}.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (sub === "reset") {
    await channels.clearAutoTranslateOverride(target.channelId);
    const langs = parseLanguages(null);
    await interaction.reply({
      content: [
        `Auto-translate override **removed** for ${target.scope}.`,
        `Default target languages now apply: \`${langs.join(", ")}\``,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (sub === "status") {
    const setting = await channels.getEffectiveAutoTranslate({
      channelId: target.channelId,
      guildId: interaction.guildId,
    });
    if (!setting.autoTranslate) {
      await interaction.reply({
        content: `Auto-translate is **off** for ${target.scope}.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }
    const effective = effectiveCleanupMinutes(setting.cleanupMinutes);
    const cleanupLine =
      effective === 0
        ? "Cleanup: **off** (threads stay active forever)"
        : `Cleanup: threads without replies archived after **${effective} min**`;
    const sourceLine = setting.isDefault
      ? "Configuration: server default"
      : "Configuration: channel override";
    await interaction.reply({
      content: [
        `Auto-translate is **on** for ${target.scope}.`,
        `Target languages: \`${setting.targetLanguages.join(", ")}\``,
        cleanupLine,
        sourceLine,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }
}
