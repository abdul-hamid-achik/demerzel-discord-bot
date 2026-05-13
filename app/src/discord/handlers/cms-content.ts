import type { ChatInputCommandInteraction } from "discord.js";
import { getCmsClient } from "../../cms/client.js";
import {
  formatApiError,
  requireCms,
  requirePermission,
} from "../../cms/permissions.js";
import type {
  AnnouncementFields,
  PageFields,
  PostFields,
} from "../../cms/types.js";
import { logger } from "../../logger.js";
import { deferEphemeral, ephemeralReply, truncate } from "./cms-shared.js";

type ContentType = "post" | "page" | "announcement";
type ContentFields = PostFields | PageFields | AnnouncementFields;

const VALID_TYPES = new Set<ContentType>(["post", "page", "announcement"]);
const VALID_PRIORITY = new Set(["low", "normal", "high", "urgent"]);

export async function handleCmsContent(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await requireCms(interaction))) return;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "create":
      return cmd("editor", interaction, createContent);
    case "edit":
      return cmd("editor", interaction, editContent);
    case "publish":
      return cmd("admin", interaction, publishContent);
    case "draft":
      return cmd("admin", interaction, draftContent);
    case "remove":
      return cmd("admin", interaction, removeContent);
    case "list":
      return cmd("viewer", interaction, listContent);
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
    logger.error({ err }, "cms-content handler failed");
    await ephemeralReply(interaction, `❌ ${formatApiError(err)}`);
  }
}

function getType(interaction: ChatInputCommandInteraction): ContentType | null {
  const t = interaction.options.getString("type", true) as ContentType;
  return VALID_TYPES.has(t) ? t : null;
}

function buildFields(
  type: ContentType,
  interaction: ChatInputCommandInteraction,
  base: Partial<ContentFields> = {},
): ContentFields {
  const title = interaction.options.getString("title");
  const body = interaction.options.getString("body");
  const excerpt = interaction.options.getString("excerpt");
  const image = interaction.options.getString("image");
  const tagsRaw = interaction.options.getString("tags");
  const priority = interaction.options.getString("priority");

  const fields = { ...base } as Record<string, unknown>;
  if (title !== null) fields.title = title;
  if (body !== null) fields.body = body;
  if (excerpt !== null) fields.excerpt = excerpt;
  if (image !== null) fields.image = image;

  if (type === "post" && tagsRaw !== null) {
    fields.tags = tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (type === "announcement" && priority !== null && VALID_PRIORITY.has(priority)) {
    fields.priority = priority;
  }
  return fields as ContentFields;
}

async function createContent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const type = getType(interaction);
  if (!type) {
    await ephemeralReply(interaction, "❌ Invalid type");
    return;
  }
  const publish = interaction.options.getString("publish") ?? "draft";
  const fields = buildFields(type, interaction);

  const created = await cms.create<ContentFields>(type, {
    fields,
    status: publish === "published" ? "published" : "draft",
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Created ${type} **${(created.fields as { title?: string }).title ?? "(untitled)"}** (${created.status}) — slug \`${created.slug}\``,
  );
}

async function editContent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const type = getType(interaction);
  if (!type) {
    await ephemeralReply(interaction, "❌ Invalid type");
    return;
  }
  const slug = interaction.options.getString("slug", true);
  const existing = await cms.getBySlug<ContentFields>(type, slug);

  const merged = buildFields(type, interaction, existing.fields);
  const updated = await cms.update<ContentFields>(type, existing.id, {
    fields: merged,
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Edited ${type} **${(updated.fields as { title?: string }).title ?? slug}**.`,
  );
}

async function publishContent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const type = getType(interaction);
  if (!type) {
    await ephemeralReply(interaction, "❌ Invalid type");
    return;
  }
  const slug = interaction.options.getString("slug", true);
  const existing = await cms.getBySlug<ContentFields>(type, slug);
  await cms.publish(type, existing.id);
  await ephemeralReply(
    interaction,
    `📣 Published ${type} \`${slug}\`.`,
  );
}

async function draftContent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const type = getType(interaction);
  if (!type) {
    await ephemeralReply(interaction, "❌ Invalid type");
    return;
  }
  const slug = interaction.options.getString("slug", true);
  const existing = await cms.getBySlug<ContentFields>(type, slug);
  await cms.unpublish(type, existing.id);
  await ephemeralReply(
    interaction,
    `📝 Moved ${type} \`${slug}\` back to draft.`,
  );
}

async function removeContent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const type = getType(interaction);
  if (!type) {
    await ephemeralReply(interaction, "❌ Invalid type");
    return;
  }
  const slug = interaction.options.getString("slug", true);
  const existing = await cms.getBySlug<ContentFields>(type, slug);
  await cms.remove(type, existing.id);
  await ephemeralReply(interaction, `🗑️ Deleted ${type} \`${slug}\`.`);
}

async function listContent(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const type = getType(interaction);
  if (!type) {
    await ephemeralReply(interaction, "❌ Invalid type");
    return;
  }
  const status = interaction.options.getString("status") ?? undefined;

  const list = await cms.list<ContentFields>(type, { status, limit: 50 });
  if (list.items.length === 0) {
    await ephemeralReply(interaction, `No ${type}s match.`);
    return;
  }
  const lines = list.items.map((e) => {
    const title = (e.fields as { title?: string }).title ?? "(untitled)";
    return `**${title}** \`(${e.status})\` — \`${e.slug}\``;
  });
  await ephemeralReply(
    interaction,
    truncate(
      `**${type}s (${list.items.length}/${list.total})**\n${lines.join("\n")}`,
      1900,
    ),
  );
}
