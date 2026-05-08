import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { agent } from "../../agent/agent.js";
import { NO_MENTIONS } from "../messages.js";

export async function handleArchiveTranslations(
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

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      content: "You need Manage Channels to archive translation threads.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  const channel = interaction.channel;
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  ) {
    await interaction.reply({
      content: "Run this in a regular text or announcement channel.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  const force = interaction.options.getBoolean("force") ?? false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { archived, kept } = await agent.archiveBotThreadsInChannel(channel, {
    force,
  });

  const lines = [
    `Archived **${archived}** translation thread${archived === 1 ? "" : "s"}.`,
  ];
  if (kept > 0 && !force) {
    lines.push(
      `Kept **${kept}** with replies — pass \`force:true\` to archive those too.`,
    );
  }
  await interaction.editReply({
    content: lines.join("\n"),
    allowedMentions: NO_MENTIONS,
  });
}
