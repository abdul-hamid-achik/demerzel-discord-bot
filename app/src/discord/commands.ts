import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
} from "discord.js";

const LANGUAGE_CHOICES = [
  { name: "English", value: "en" },
  { name: "Español", value: "es" },
  { name: "Italiano", value: "it" },
  { name: "Português", value: "pt" },
  { name: "Français", value: "fr" },
  { name: "Deutsch", value: "de" },
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
    )
    .addSubcommand((sub) =>
      sub
        .setName("auto")
        .setDescription("Toggle auto-translate on/off")
        .addBooleanOption((opt) =>
          opt.setName("enabled").setDescription("Enable").setRequired(true),
        ),
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
        .setRequired(false)
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
