import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
} from "discord.js";
import { logger } from "../logger.js";
import { CmsApiError, getCmsClient } from "./client.js";
import { NO_MENTIONS } from "../discord/messages.js";
import type { Permission } from "./types.js";

const RANK: Record<Permission, number> = {
  none: 0,
  viewer: 1,
  editor: 2,
  admin: 3,
};

/**
 * Resolve the caller's CMS permission for the current guild via the Void
 * permission resolver. Returns "none" if the bot can't reach Void or the
 * user is in a DM.
 */
export async function getCallerPermission(
  interaction: ChatInputCommandInteraction,
): Promise<Permission> {
  const cms = getCmsClient();
  if (!cms || !interaction.guildId) return "none";

  const userId = interaction.user.id;
  const member = interaction.member;
  const roleIds: string[] = [];
  if (member instanceof GuildMember) {
    roleIds.push(...member.roles.cache.map((r) => r.id));
  } else if (member && Array.isArray((member as { roles?: unknown }).roles)) {
    roleIds.push(...((member as { roles: string[] }).roles ?? []));
  }

  try {
    const res = await cms.resolvePermission({
      guildId: interaction.guildId,
      userId,
      roleIds,
    });
    return res.permission;
  } catch (err) {
    logger.error({ err }, "permission resolution failed");
    return "none";
  }
}

/**
 * Gate a slash command handler. Returns true if the caller meets the
 * required permission (or higher). Otherwise sends an ephemeral denial and
 * returns false.
 */
export async function requirePermission(
  interaction: ChatInputCommandInteraction,
  required: Permission,
): Promise<boolean> {
  const have = await getCallerPermission(interaction);
  if (RANK[have] >= RANK[required]) return true;

  await interaction
    .reply({
      content: `You need **${required}** permission to run this. You have **${have}**.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    })
    .catch(() => {});
  return false;
}

/**
 * Convenience: short-circuits the handler when CMS is disabled.
 */
export async function requireCms(
  interaction: ChatInputCommandInteraction,
): Promise<boolean> {
  if (getCmsClient()) return true;
  await interaction
    .reply({
      content:
        "CMS is not configured on this bot (VOID_API_BASE_URL or VOID_API_URL, plus VOID_API_KEY, missing).",
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    })
    .catch(() => {});
  return false;
}

export function formatApiError(err: unknown): string {
  if (err instanceof CmsApiError) {
    try {
      const parsed = JSON.parse(err.bodyText) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // fallthrough
    }
    return `Void API error (${err.status})`;
  }
  return err instanceof Error ? err.message : String(err);
}
