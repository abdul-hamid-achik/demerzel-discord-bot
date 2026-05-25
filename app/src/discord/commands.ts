import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { isCmsConfigured } from "../config.js";
import { cmsSlashCommandJson } from "../cms/slash-commands.js";
import { DEFAULT_TARGET_LANGUAGE_CODES } from "../translation/lang-util.js";

const LANGUAGE_CHOICES = [
  { name: "English", value: "en" },
  { name: "Español", value: "es" },
  { name: "Italiano", value: "it" },
  { name: "Português (Brasil)", value: "pt" },
  { name: "Français", value: "fr" },
  { name: "Deutsch", value: "de" },
  { name: "Polski", value: "pl" },
  { name: "Русский (Russian)", value: "ru" },
  { name: "日本語 (Japanese)", value: "ja" },
  { name: "한국어 (Korean)", value: "ko" },
  { name: "中文 (Chinese)", value: "zh" },
];

export const slashCommands = [
  new SlashCommandBuilder()
    .setName("language")
    .setDescription("Manage your language preferences")
    .addSubcommand((sub) =>
      sub
        .setName("set")
        .setDescription("Set your primary language")
        .addStringOption((opt) =>
          opt
            .setName("code")
            .setDescription("Language")
            .setRequired(true)
            .addChoices(...LANGUAGE_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("show")
        .setDescription("Show your current language preferences"),
    ),

  new SlashCommandBuilder()
    .setName("translate")
    .setDescription("Translate text to a target language")
    .addStringOption((opt) =>
      opt.setName("text").setDescription("Text to translate").setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName("to")
        .setDescription("Target language")
        .setRequired(true)
        .addChoices(...LANGUAGE_CHOICES),
    ),

  new SlashCommandBuilder()
    .setName("translate-thread")
    .setDescription(
      "Create a translation thread for the latest message in this channel",
    )
    .addStringOption((opt) =>
      opt
        .setName("languages")
        .setDescription(
          `Comma-separated language codes (default: ${DEFAULT_TARGET_LANGUAGE_CODES})`,
        )
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show translation analytics for this server"),

  new SlashCommandBuilder()
    .setName("archive-translations")
    .setDescription(
      "Archive translation threads in this channel (preserves history)",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addBooleanOption((opt) =>
      opt
        .setName("force")
        .setDescription(
          "Also archive threads that have replies (default: only empty ones)",
        )
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("reminder")
    .setDescription("Schedule and manage reminders")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Schedule a one-time reminder")
        .addStringOption((opt) =>
          opt
            .setName("when")
            .setDescription("Example: in 2 hours, or 2026-05-09T18:00:00-06:00")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("message")
            .setDescription("What to send when the reminder fires")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt
            .setName("delivery")
            .setDescription("Where to send it")
            .setRequired(false)
            .addChoices(
              { name: "Private DM", value: "dm" },
              { name: "This channel", value: "channel" },
            ),
        )
        .addStringOption((opt) =>
          opt
            .setName("link")
            .setDescription("Optional URL to include")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List your pending reminders"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("cancel")
        .setDescription("Cancel one of your pending reminders")
        .addStringOption((opt) =>
          opt
            .setName("id")
            .setDescription("Reminder id or prefix from /reminder list")
            .setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("auto-translate")
    .setDescription("Configure automatic translation for this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand((sub) =>
      sub
        .setName("enable")
        .setDescription("Auto-translate messages in this channel into a thread")
        .addStringOption((opt) =>
          opt
            .setName("languages")
            .setDescription(
              `Comma-separated language codes (default: ${DEFAULT_TARGET_LANGUAGE_CODES})`,
            )
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("cleanup_minutes")
            .setDescription(
              "Archive translation threads after N min if no replies (0 = never; default 5)",
            )
            .setMinValue(0)
            .setMaxValue(10080)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("disable")
        .setDescription("Stop auto-translating in this channel"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reset")
        .setDescription("Remove this channel override and use the default"),
    )
    .addSubcommand((sub) =>
      sub
        .setName("status")
        .setDescription("Show auto-translate config for this channel"),
    ),
].map((c) => c.toJSON());

export const contextMenus = [
  new ContextMenuCommandBuilder()
    .setName("Translate Message")
    .setType(ApplicationCommandType.Message),
  new ContextMenuCommandBuilder()
    .setName("Open Translation Thread")
    .setType(ApplicationCommandType.Message),
].map((c) => c.toJSON());

type CommandJson =
  | (typeof slashCommands)[number]
  | (typeof cmsSlashCommandJson)[number]
  | (typeof contextMenus)[number];

export function buildAllCommands(
  options: { includeCms?: boolean } = {},
): CommandJson[] {
  const includeCms = options.includeCms ?? isCmsConfigured();
  return [
    ...slashCommands,
    ...(includeCms ? cmsSlashCommandJson : []),
    ...contextMenus,
  ];
}

export const allCommands = buildAllCommands();
