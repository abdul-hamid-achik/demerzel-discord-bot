/**
 * Slash command definitions for the StarWarrior CMS surface. Each top-level
 * command groups subcommands by domain; the matching handler in
 * `discord/handlers/cms-*.ts` dispatches on the subcommand name.
 */
import { SlashCommandBuilder } from "discord.js";

const LOCALE_CHOICES = [
  { name: "English", value: "en" },
  { name: "Español", value: "es" },
  { name: "Italiano", value: "it" },
  { name: "한국어 (Korean)", value: "ko" },
  { name: "Русский", value: "ru" },
  { name: "Українська", value: "uk" },
];

const OPERATION_STATUS_CHOICES = [
  { name: "Planning", value: "planning" },
  { name: "Upcoming", value: "upcoming" },
  { name: "Active", value: "active" },
  { name: "Completed", value: "completed" },
  { name: "Cancelled", value: "cancelled" },
];

const EVENT_TONE_CHOICES = [
  { name: "Amber", value: "amber" },
  { name: "Cyan", value: "cyan" },
  { name: "Green", value: "green" },
  { name: "Gold", value: "gold" },
];

const CONTENT_TYPE_CHOICES = [
  { name: "Blog post", value: "post" },
  { name: "Page", value: "page" },
  { name: "Announcement", value: "announcement" },
];

const STATUS_PUB_DRAFT = [
  { name: "Draft", value: "draft" },
  { name: "Published", value: "published" },
];

const PRIORITY_CHOICES = [
  { name: "Low", value: "low" },
  { name: "Normal", value: "normal" },
  { name: "High", value: "high" },
  { name: "Urgent", value: "urgent" },
];

export const cmsSlashCommands = [
  // ─── Members ─────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("cms-member")
    .setDescription("Manage StarWarrior guild members")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a new member (editor)")
        .addStringOption((o) =>
          o.setName("name").setDescription("In-game name").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("power")
            .setDescription("Power level")
            .setMinValue(0)
            .setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("rank")
            .setDescription("Rank position (1 = top)")
            .setMinValue(1)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("role").setDescription("Role (e.g. Chairman)"),
        )
        .addUserOption((o) =>
          o
            .setName("discord")
            .setDescription("Tie to a Discord user (optional)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("update")
        .setDescription("Update an existing member by name (editor)")
        .addStringOption((o) =>
          o.setName("name").setDescription("In-game name").setRequired(true),
        )
        .addIntegerOption((o) =>
          o.setName("power").setDescription("Power level").setMinValue(0),
        )
        .addIntegerOption((o) =>
          o.setName("rank").setDescription("Rank position").setMinValue(1),
        )
        .addStringOption((o) => o.setName("role").setDescription("Role"))
        .addUserOption((o) =>
          o.setName("discord").setDescription("Tie to a Discord user"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("my-power")
        .setDescription("Update your own power level (looked up by your Discord ID)")
        .addIntegerOption((o) =>
          o
            .setName("power")
            .setDescription("New power level")
            .setMinValue(0)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a member (admin)")
        .addStringOption((o) =>
          o.setName("name").setDescription("In-game name").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List all members (ephemeral)"),
    ),

  // ─── Operations ──────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("cms-operation")
    .setDescription("Manage rally operations")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a new operation (editor)")
        .addStringOption((o) =>
          o.setName("title").setDescription("Title").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("status")
            .setDescription("Status")
            .setRequired(true)
            .addChoices(...OPERATION_STATUS_CHOICES),
        )
        .addStringOption((o) =>
          o
            .setName("when")
            .setDescription("Date/time string (e.g. 'May 10, 21:00 UTC')"),
        )
        .addStringOption((o) =>
          o.setName("region").setDescription("Region (e.g. 'Border Region II')"),
        )
        .addStringOption((o) =>
          o
            .setName("description")
            .setDescription("Description (markdown allowed)")
            .setMaxLength(4000),
        )
        .addStringOption((o) =>
          o.setName("category").setDescription("Category"),
        )
        .addStringOption((o) =>
          o
            .setName("publish")
            .setDescription("Publish immediately or save as draft")
            .addChoices(...STATUS_PUB_DRAFT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("update")
        .setDescription("Update an operation by slug (editor)")
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        )
        .addStringOption((o) => o.setName("title").setDescription("Title"))
        .addStringOption((o) =>
          o
            .setName("status")
            .setDescription("Status")
            .addChoices(...OPERATION_STATUS_CHOICES),
        )
        .addStringOption((o) => o.setName("when").setDescription("Date/time"))
        .addStringOption((o) => o.setName("region").setDescription("Region"))
        .addStringOption((o) =>
          o.setName("description").setDescription("Description").setMaxLength(4000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("publish")
        .setDescription("Publish an operation (admin)")
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("draft")
        .setDescription("Move an operation back to draft (admin)")
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete an operation (admin)")
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List operations (ephemeral)"),
    ),

  // ─── Events ──────────────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("cms-event")
    .setDescription("Manage event timeline entries")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a new event (editor)")
        .addStringOption((o) =>
          o.setName("title").setDescription("Title").setRequired(true),
        )
        .addStringOption((o) => o.setName("day").setDescription("Day (e.g. '08')"))
        .addStringOption((o) =>
          o.setName("month").setDescription("Month (e.g. 'May')"),
        )
        .addStringOption((o) =>
          o.setName("time").setDescription("Time (e.g. '23:00 UTC')"),
        )
        .addStringOption((o) =>
          o
            .setName("tone")
            .setDescription("Color tone")
            .addChoices(...EVENT_TONE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("description").setDescription("Description").setMaxLength(4000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("update")
        .setDescription("Update an event by slug (editor)")
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        )
        .addStringOption((o) => o.setName("title").setDescription("Title"))
        .addStringOption((o) => o.setName("day").setDescription("Day"))
        .addStringOption((o) => o.setName("month").setDescription("Month"))
        .addStringOption((o) => o.setName("time").setDescription("Time"))
        .addStringOption((o) =>
          o
            .setName("tone")
            .setDescription("Color tone")
            .addChoices(...EVENT_TONE_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete an event (admin)")
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List events (ephemeral)"),
    ),

  // ─── i18n overrides ──────────────────────────────────────────────────────
  new SlashCommandBuilder()
    .setName("cms-i18n")
    .setDescription("Override website i18n strings")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set or update an override (editor)")
        .addStringOption((o) =>
          o
            .setName("locale")
            .setDescription("Locale")
            .setRequired(true)
            .addChoices(...LOCALE_CHOICES),
        )
        .addStringOption((o) =>
          o
            .setName("key")
            .setDescription("Dot-path (e.g. 'clan.hero.body')")
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("value")
            .setDescription("New value")
            .setRequired(true)
            .setMaxLength(4000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove an override (admin)")
        .addStringOption((o) =>
          o
            .setName("locale")
            .setDescription("Locale")
            .setRequired(true)
            .addChoices(...LOCALE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("key").setDescription("Dot-path").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List overrides (ephemeral)")
        .addStringOption((o) =>
          o
            .setName("locale")
            .setDescription("Filter by locale")
            .addChoices(...LOCALE_CHOICES),
        ),
    ),

  // ─── Content (post / page / announcement) ────────────────────────────────
  new SlashCommandBuilder()
    .setName("cms-content")
    .setDescription("Manage posts, pages, and announcements")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create new content (editor)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Content type")
            .setRequired(true)
            .addChoices(...CONTENT_TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("title").setDescription("Title").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("body")
            .setDescription("Body (markdown)")
            .setRequired(true)
            .setMaxLength(4000),
        )
        .addStringOption((o) =>
          o.setName("excerpt").setDescription("Excerpt").setMaxLength(500),
        )
        .addStringOption((o) =>
          o.setName("image").setDescription("Cover image URL"),
        )
        .addStringOption((o) =>
          o.setName("tags").setDescription("Comma-separated tags (post only)"),
        )
        .addStringOption((o) =>
          o
            .setName("priority")
            .setDescription("Priority (announcement only)")
            .addChoices(...PRIORITY_CHOICES),
        )
        .addStringOption((o) =>
          o
            .setName("publish")
            .setDescription("Publish immediately or save as draft")
            .addChoices(...STATUS_PUB_DRAFT),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Edit existing content by slug (editor)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Content type")
            .setRequired(true)
            .addChoices(...CONTENT_TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        )
        .addStringOption((o) => o.setName("title").setDescription("Title"))
        .addStringOption((o) =>
          o.setName("body").setDescription("Body").setMaxLength(4000),
        )
        .addStringOption((o) =>
          o.setName("excerpt").setDescription("Excerpt").setMaxLength(500),
        )
        .addStringOption((o) => o.setName("image").setDescription("Image URL"))
        .addStringOption((o) => o.setName("tags").setDescription("Comma-separated tags"))
        .addStringOption((o) =>
          o
            .setName("priority")
            .setDescription("Priority")
            .addChoices(...PRIORITY_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("publish")
        .setDescription("Publish (admin)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Content type")
            .setRequired(true)
            .addChoices(...CONTENT_TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("draft")
        .setDescription("Move back to draft (admin)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Content type")
            .setRequired(true)
            .addChoices(...CONTENT_TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Delete (admin)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Content type")
            .setRequired(true)
            .addChoices(...CONTENT_TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o.setName("slug").setDescription("Slug").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List entries by type (ephemeral)")
        .addStringOption((o) =>
          o
            .setName("type")
            .setDescription("Content type")
            .setRequired(true)
            .addChoices(...CONTENT_TYPE_CHOICES),
        )
        .addStringOption((o) =>
          o
            .setName("status")
            .setDescription("Filter by status")
            .addChoices(
              { name: "Draft", value: "draft" },
              { name: "Published", value: "published" },
              { name: "Archived", value: "archived" },
            ),
        ),
    ),
];

export const cmsSlashCommandJson = cmsSlashCommands.map((c) => c.toJSON());
