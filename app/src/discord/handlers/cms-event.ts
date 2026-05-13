import type { ChatInputCommandInteraction } from "discord.js";
import { getCmsClient } from "../../cms/client.js";
import {
  formatApiError,
  requireCms,
  requirePermission,
} from "../../cms/permissions.js";
import type { EventFields } from "../../cms/types.js";
import { logger } from "../../logger.js";
import { deferEphemeral, ephemeralReply, truncate } from "./cms-shared.js";

const VALID_TONE = new Set(["amber", "cyan", "green", "gold"]);

export async function handleCmsEvent(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await requireCms(interaction))) return;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "add":
      return cmd("editor", interaction, addEvent);
    case "update":
      return cmd("editor", interaction, updateEvent);
    case "remove":
      return cmd("admin", interaction, removeEvent);
    case "list":
      return cmd("viewer", interaction, listEvents);
    default:
      await ephemeralReply(interaction, `Unknown subcommand: ${sub}`);
  }
}

async function cmd(
  required: "viewer" | "editor" | "admin",
  interaction: ChatInputCommandInteraction,
  fn: (i: ChatInputCommandInteraction) => Promise<void>,
): Promise<void> {
  if (!(await requirePermission(interaction, required))) return;
  await deferEphemeral(interaction);
  try {
    await fn(interaction);
  } catch (err) {
    logger.error({ err }, "cms-event handler failed");
    await ephemeralReply(interaction, `❌ ${formatApiError(err)}`);
  }
}

async function addEvent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const tone = interaction.options.getString("tone");
  const fields: EventFields = {
    title: interaction.options.getString("title", true),
    day: interaction.options.getString("day") ?? undefined,
    month: interaction.options.getString("month") ?? undefined,
    time: interaction.options.getString("time") ?? undefined,
    tone: tone && VALID_TONE.has(tone) ? (tone as EventFields["tone"]) : undefined,
    description: interaction.options.getString("description") ?? undefined,
  };

  const created = await cms.create<EventFields>("event", {
    fields,
    status: "published",
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Created event **${created.fields.title}** — slug \`${created.slug}\``,
  );
}

async function updateEvent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const slug = interaction.options.getString("slug", true);
  const ev = await cms.getBySlug<EventFields>("event", slug);

  const patch: Partial<EventFields> = { ...ev.fields };
  const title = interaction.options.getString("title");
  const day = interaction.options.getString("day");
  const month = interaction.options.getString("month");
  const time = interaction.options.getString("time");
  const tone = interaction.options.getString("tone");
  if (title !== null) patch.title = title;
  if (day !== null) patch.day = day;
  if (month !== null) patch.month = month;
  if (time !== null) patch.time = time;
  if (tone !== null && VALID_TONE.has(tone))
    patch.tone = tone as EventFields["tone"];

  const updated = await cms.update<EventFields>("event", ev.id, {
    fields: patch,
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(interaction, `✅ Updated event **${updated.fields.title}**.`);
}

async function removeEvent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const slug = interaction.options.getString("slug", true);
  const ev = await cms.getBySlug<EventFields>("event", slug);
  await cms.remove("event", ev.id);
  await ephemeralReply(interaction, `🗑️ Deleted event **${ev.fields.title}**.`);
}

async function listEvents(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const list = await cms.events();
  if (list.items.length === 0) {
    await ephemeralReply(interaction, "No events yet.");
    return;
  }
  const lines = list.items.map((ev) => {
    const date = [ev.fields.month, ev.fields.day].filter(Boolean).join(" ");
    const when = ev.fields.time ? ` · ${ev.fields.time}` : "";
    return `**${ev.fields.title}** — ${date}${when} — \`${ev.slug}\``;
  });
  await ephemeralReply(
    interaction,
    truncate(`**Events (${list.items.length})**\n${lines.join("\n")}`, 1900),
  );
}
