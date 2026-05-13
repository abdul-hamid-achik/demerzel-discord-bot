import type { ChatInputCommandInteraction } from "discord.js";
import { getCmsClient } from "../../cms/client.js";
import {
  formatApiError,
  requireCms,
  requirePermission,
} from "../../cms/permissions.js";
import { logger } from "../../logger.js";
import { deferEphemeral, ephemeralReply, truncate } from "./cms-shared.js";

export async function handleCmsI18n(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await requireCms(interaction))) return;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "set":
      return cmd("editor", interaction, setOverride);
    case "remove":
      return cmd("admin", interaction, removeOverride);
    case "list":
      return cmd("viewer", interaction, listOverrides);
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
    logger.error({ err }, "cms-i18n handler failed");
    await ephemeralReply(interaction, `❌ ${formatApiError(err)}`);
  }
}

async function setOverride(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const locale = interaction.options.getString("locale", true);
  const key = interaction.options.getString("key", true);
  const value = interaction.options.getString("value", true);

  await cms.setI18nOverride(locale, key, value, interaction.user.id);
  await ephemeralReply(
    interaction,
    `✅ Set \`${locale}:${key}\` → ${truncate(value, 200)}`,
  );
}

async function removeOverride(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const locale = interaction.options.getString("locale", true);
  const key = interaction.options.getString("key", true);

  await cms.removeI18nOverride(locale, key);
  await ephemeralReply(interaction, `🗑️ Removed \`${locale}:${key}\``);
}

async function listOverrides(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const filter = interaction.options.getString("locale");
  const all = await cms.listI18nOverrides();
  const items = filter ? all.filter((o) => o.locale === filter) : all;
  if (items.length === 0) {
    await ephemeralReply(
      interaction,
      filter ? `No overrides for \`${filter}\`.` : "No overrides yet.",
    );
    return;
  }
  const lines = items.map(
    (o) => `\`${o.locale}:${o.key}\` → ${truncate(o.value, 120)}`,
  );
  await ephemeralReply(
    interaction,
    truncate(`**i18n overrides (${items.length})**\n${lines.join("\n")}`, 1900),
  );
}
