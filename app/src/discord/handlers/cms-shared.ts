/**
 * Shared helpers for CMS slash command handlers — ephemeral replies,
 * formatting, and slug derivation.
 */
import {
  ChatInputCommandInteraction,
  MessageFlags,
} from "discord.js";
import { NO_MENTIONS } from "../messages.js";

export async function ephemeralReply(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction
      .editReply({ content, allowedMentions: NO_MENTIONS })
      .catch(() => {});
    return;
  }
  await interaction
    .reply({
      content,
      flags: MessageFlags.Ephemeral,
      allowedMentions: NO_MENTIONS,
    })
    .catch(() => {});
}

export async function deferEphemeral(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (interaction.deferred || interaction.replied) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatPower(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
