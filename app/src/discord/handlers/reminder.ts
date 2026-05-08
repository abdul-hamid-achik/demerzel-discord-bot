import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags } from "discord.js";
import {
  reminderEngine,
  shortReminderId,
  type ReminderDeliveryTarget,
} from "../../reminders/engine.js";
import {
  formatReminderTime,
  isFutureReminderTime,
  parseReminderTime,
} from "../../reminders/time.js";
import { NO_MENTIONS } from "../messages.js";

function truncate(text: string, max = 140): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
}

function normalizeLink(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.toString();
  } catch {
    return null;
  }
}

export async function handleReminder(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const sub = interaction.options.getSubcommand(true);

  if (sub === "create") {
    const when = interaction.options.getString("when", true);
    const message = interaction.options.getString("message", true).trim();
    const delivery =
      (interaction.options.getString(
        "delivery",
      ) as ReminderDeliveryTarget | null) ?? "dm";
    const link = normalizeLink(interaction.options.getString("link"));

    const remindAt = parseReminderTime(when);
    if (!remindAt || !isFutureReminderTime(remindAt)) {
      await interaction.reply({
        content:
          "Use a future time like `in 2 hours` or an ISO timestamp like `2026-05-09T18:00:00-06:00`.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    if (!message) {
      await interaction.reply({
        content: "Reminder message cannot be empty.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    if (delivery === "channel" && !interaction.inGuild()) {
      await interaction.reply({
        content:
          "Channel reminders only work in servers. Use private delivery in DMs.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    let row: Awaited<ReturnType<typeof reminderEngine.create>>;
    try {
      row = await reminderEngine.create({
        creatorId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: delivery === "channel" ? interaction.channelId : null,
        deliveryTarget: delivery,
        remindAt,
        message,
        link,
      });
    } catch (err) {
      await interaction.reply({
        content:
          err instanceof Error ? err.message : "Could not create reminder.",
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    await interaction.reply({
      content: [
        `Reminder \`${shortReminderId(row.id)}\` scheduled for **${formatReminderTime(row.remindAt)}**.`,
        `Delivery: **${delivery === "channel" ? "this channel" : "private DM"}**`,
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (sub === "list") {
    const rows = await reminderEngine.listPendingForUser(
      interaction.user.id,
      10,
    );
    const content =
      rows.length === 0
        ? "You have no pending reminders."
        : rows
            .map(
              (r) =>
                `\`${shortReminderId(r.id)}\` ${formatReminderTime(r.remindAt)} · ${
                  r.deliveryTarget === "channel" ? "channel" : "DM"
                } · ${truncate(r.message)}`,
            )
            .join("\n");

    await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  if (sub === "cancel") {
    const id = interaction.options.getString("id", true).trim();
    const result = await reminderEngine.cancelByUser(interaction.user.id, id);

    if (result.status === "cancelled") {
      await interaction.reply({
        content: `Cancelled reminder \`${shortReminderId(result.reminder.id)}\`.`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    if (result.status === "ambiguous") {
      await interaction.reply({
        content: `That id prefix matches multiple reminders: ${result.matches
          .map((r) => `\`${shortReminderId(r.id)}\``)
          .join(", ")}`,
        flags: MessageFlags.Ephemeral,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    await interaction.reply({
      content: "No pending reminder matched that id.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    });
  }
}
