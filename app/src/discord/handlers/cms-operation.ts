import type { ChatInputCommandInteraction } from "discord.js";
import { getCmsClient } from "../../cms/client.js";
import {
  formatApiError,
  requireCms,
  requirePermission,
} from "../../cms/permissions.js";
import type { OperationFields } from "../../cms/types.js";
import { logger } from "../../logger.js";
import { deferEphemeral, ephemeralReply, truncate } from "./cms-shared.js";

const VALID_STATUS = new Set([
  "planning",
  "upcoming",
  "active",
  "completed",
  "cancelled",
]);

export async function handleCmsOperation(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await requireCms(interaction))) return;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "add":
      return cmd("editor", interaction, addOp);
    case "update":
      return cmd("editor", interaction, updateOp);
    case "publish":
      return cmd("admin", interaction, publishOp);
    case "draft":
      return cmd("admin", interaction, draftOp);
    case "remove":
      return cmd("admin", interaction, removeOp);
    case "list":
      return cmd("viewer", interaction, listOps);
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
    logger.error({ err }, "cms-operation handler failed");
    await ephemeralReply(interaction, `❌ ${formatApiError(err)}`);
  }
}

async function addOp(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const status = interaction.options.getString("status", true);
  if (!VALID_STATUS.has(status)) {
    await ephemeralReply(interaction, `❌ Invalid status: ${status}`);
    return;
  }
  const publish = interaction.options.getString("publish") ?? "draft";

  const fields: OperationFields = {
    title: interaction.options.getString("title", true),
    status: status as OperationFields["status"],
    startsAt: interaction.options.getString("when") ?? undefined,
    region: interaction.options.getString("region") ?? undefined,
    description: interaction.options.getString("description") ?? undefined,
    category: interaction.options.getString("category") ?? undefined,
  };

  const created = await cms.create<OperationFields>("operation", {
    fields,
    status: publish === "published" ? "published" : "draft",
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Created operation **${created.fields.title}** (${created.status}) — slug \`${created.slug}\``,
  );
}

async function findOpBySlug(slug: string) {
  const cms = getCmsClient()!;
  return cms.getBySlug<OperationFields>("operation", slug);
}

async function updateOp(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const slug = interaction.options.getString("slug", true);
  const op = await findOpBySlug(slug);

  const patch: Partial<OperationFields> = { ...op.fields };
  const title = interaction.options.getString("title");
  const status = interaction.options.getString("status");
  const when = interaction.options.getString("when");
  const region = interaction.options.getString("region");
  const description = interaction.options.getString("description");
  if (title !== null) patch.title = title;
  if (status !== null && VALID_STATUS.has(status))
    patch.status = status as OperationFields["status"];
  if (when !== null) patch.startsAt = when;
  if (region !== null) patch.region = region;
  if (description !== null) patch.description = description;

  const updated = await cms.update<OperationFields>("operation", op.id, {
    fields: patch,
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Updated operation **${updated.fields.title}** (${updated.fields.status}).`,
  );
}

async function publishOp(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const slug = interaction.options.getString("slug", true);
  const op = await findOpBySlug(slug);
  await cms.publish("operation", op.id);
  await ephemeralReply(interaction, `📣 Published **${op.fields.title}**.`);
}

async function draftOp(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const slug = interaction.options.getString("slug", true);
  const op = await findOpBySlug(slug);
  await cms.unpublish("operation", op.id);
  await ephemeralReply(
    interaction,
    `📝 Moved **${op.fields.title}** back to draft.`,
  );
}

async function removeOp(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const slug = interaction.options.getString("slug", true);
  const op = await findOpBySlug(slug);
  await cms.remove("operation", op.id);
  await ephemeralReply(interaction, `🗑️ Deleted operation **${op.fields.title}**.`);
}

async function listOps(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const list = await cms.operations();
  if (list.items.length === 0) {
    await ephemeralReply(interaction, "No operations yet.");
    return;
  }
  const lines = list.items.map((op) => {
    const region = op.fields.region ? ` · ${op.fields.region}` : "";
    const when = op.fields.startsAt ? ` · ${op.fields.startsAt}` : "";
    return `**${op.fields.title}** \`(${op.status}/${op.fields.status})\`${when}${region} — \`${op.slug}\``;
  });
  await ephemeralReply(
    interaction,
    truncate(`**Operations (${list.items.length})**\n${lines.join("\n")}`, 1900),
  );
}
