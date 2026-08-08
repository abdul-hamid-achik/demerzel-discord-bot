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

  const force = interaction.options.getBoolean("force") ?? false;
  const scope = interaction.options.getString("scope") ?? "channel";

  if (scope === "server") {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "I could not resolve this server.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { archived, kept } = await agent.archiveBotThreadsInGuild(guild, {
      force,
    });
    await interaction.editReply({
      content: archiveSummary({ archived, kept, force, scope }),
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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { archived, kept } = await agent.archiveBotThreadsInChannel(channel, {
    force,
  });

  await interaction.editReply({
    content: archiveSummary({ archived, kept, force, scope }),
    allowedMentions: NO_MENTIONS,
  });
}

function archiveSummary(args: {
  archived: number;
  kept: number;
  force: boolean;
  scope: string;
}): string {
  const target = args.scope === "server" ? "in this server" : "in this channel";
  const lines = [
    `Archived **${args.archived}** translation thread${args.archived === 1 ? "" : "s"} ${target}.`,
  ];
  if (args.kept > 0 && !args.force) {
    lines.push(
      `Kept **${args.kept}** with replies — pass \`force:true\` to archive those too.`,
    );
  }
  return lines.join("\n");
}
