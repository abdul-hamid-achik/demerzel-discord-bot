import type { ChatInputCommandInteraction } from "discord.js";
import { getCmsClient } from "../../cms/client.js";
import {
  formatApiError,
  requireCms,
  requirePermission,
} from "../../cms/permissions.js";
import type { Entry, MemberFields } from "../../cms/types.js";
import { logger } from "../../logger.js";
import {
  deferEphemeral,
  ephemeralReply,
  formatPower,
  slugify,
  truncate,
} from "./cms-shared.js";

export async function handleCmsMember(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!(await requireCms(interaction))) return;
  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case "add":
      return cmd("editor", interaction, addMember);
    case "update":
      return cmd("editor", interaction, updateMember);
    case "my-power":
      return cmd("editor", interaction, updateMyPower);
    case "remove":
      return cmd("admin", interaction, removeMember);
    case "list":
      return cmd("viewer", interaction, listMembers);
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
    logger.error({ err }, "cms-member handler failed");
    await ephemeralReply(interaction, `❌ ${formatApiError(err)}`);
  }
}

async function findMemberByName(
  name: string,
): Promise<Entry<MemberFields> | null> {
  const cms = getCmsClient()!;
  try {
    return await cms.getBySlug<MemberFields>("member", slugify(name));
  } catch {
    // Fallback: scan list for case-insensitive name match.
    const list = await cms.members();
    const target = name.toLowerCase();
    return (
      list.items.find((m) => (m.fields.name ?? "").toLowerCase() === target) ??
      null
    );
  }
}

async function addMember(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const name = interaction.options.getString("name", true);
  const power = interaction.options.getInteger("power", true);
  const rank = interaction.options.getInteger("rank", true);
  const role = interaction.options.getString("role") ?? undefined;
  const discord = interaction.options.getUser("discord");

  const created = await cms.create<MemberFields>("member", {
    fields: {
      name,
      power,
      rank,
      role,
      discordUserId: discord?.id,
    },
    status: "published",
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Added member **${created.fields.name}** (rank ${created.fields.rank}, ${formatPower(created.fields.power)} power) — slug \`${created.slug}\``,
  );
}

async function updateMember(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const name = interaction.options.getString("name", true);
  const member = await findMemberByName(name);
  if (!member) {
    await ephemeralReply(interaction, `❌ Member \`${name}\` not found.`);
    return;
  }

  const patch: Partial<MemberFields> = { ...member.fields };
  const power = interaction.options.getInteger("power");
  const rank = interaction.options.getInteger("rank");
  const role = interaction.options.getString("role");
  const discord = interaction.options.getUser("discord");
  if (power !== null) patch.power = power;
  if (rank !== null) patch.rank = rank;
  if (role !== null) patch.role = role;
  if (discord) patch.discordUserId = discord.id;

  const updated = await cms.update<MemberFields>("member", member.id, {
    fields: patch,
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Updated **${updated.fields.name}** — rank ${updated.fields.rank}, ${formatPower(updated.fields.power)} power.`,
  );
}

async function updateMyPower(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const power = interaction.options.getInteger("power", true);

  let member: Entry<MemberFields>;
  try {
    member = await cms.memberByDiscordUser(interaction.user.id);
  } catch {
    await ephemeralReply(
      interaction,
      "❌ No member entry is linked to your Discord account. Ask an editor to run `/cms-member add` and pass `discord:` to your user.",
    );
    return;
  }

  const updated = await cms.update<MemberFields>("member", member.id, {
    fields: { ...member.fields, power },
    discordUserId: interaction.user.id,
  });

  await ephemeralReply(
    interaction,
    `✅ Updated your power to **${formatPower(updated.fields.power)}**.`,
  );
}

async function removeMember(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const name = interaction.options.getString("name", true);
  const member = await findMemberByName(name);
  if (!member) {
    await ephemeralReply(interaction, `❌ Member \`${name}\` not found.`);
    return;
  }

  await cms.remove("member", member.id);
  await ephemeralReply(interaction, `🗑️ Removed member **${name}**.`);
}

async function listMembers(interaction: ChatInputCommandInteraction) {
  const cms = getCmsClient()!;
  const list = await cms.members();
  if (list.items.length === 0) {
    await ephemeralReply(interaction, "No members yet.");
    return;
  }
  const sorted = [...list.items].sort(
    (a, b) => (a.fields.rank ?? 0) - (b.fields.rank ?? 0),
  );
  const lines = sorted.map((m) => {
    const role = m.fields.role ? ` — ${m.fields.role}` : "";
    const linked = m.fields.discordUserId
      ? ` <@${m.fields.discordUserId}>`
      : "";
    return `**#${m.fields.rank}** ${m.fields.name}${role} — ${formatPower(m.fields.power)}${linked}`;
  });
  await ephemeralReply(
    interaction,
    truncate(`**Members (${sorted.length})**\n${lines.join("\n")}`, 1900),
  );
}
