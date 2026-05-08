import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

const LANGUAGE_CHOICES = [
  { name: "English", value: "en" },
  { name: "Español", value: "es" },
  { name: "Italiano", value: "it" },
  { name: "Português", value: "pt" },
  { name: "Français", value: "fr" },
  { name: "Deutsch", value: "de" },
  { name: "Polski", value: "pl" },
  { name: "日本語 (Japanese)", value: "ja" },
  { name: "한국어 (Korean)", value: "ko" },
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
      sub.setName("show").setDescription("Show your current language preferences"),
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
    .setDescription("Create a translation thread for the latest message in this channel")
    .addStringOption((opt) =>
      opt
        .setName("languages")
        .setDescription("Comma-separated language codes (default: en,es,it,pt)")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show translation analytics for this server"),

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
            .setDescription("Comma-separated language codes (default: en,es,it,pt)")
            .setRequired(false),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("cleanup_minutes")
            .setDescription(
              "Delete translation threads after N min if no replies (0 = never; default 30)",
            )
            .setMinValue(0)
            .setMaxValue(10080)
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("disable").setDescription("Stop auto-translating in this channel"),
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show auto-translate config for this channel"),
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

export const allCommands = [...slashCommands, ...contextMenus];
