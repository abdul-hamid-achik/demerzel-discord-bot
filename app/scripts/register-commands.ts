import { REST, Routes } from "discord.js";
import { config } from "../src/config.js";
import { allCommands } from "../src/discord/commands.js";

async function main() {
  const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

  const route = config.DISCORD_GUILD_ID
    ? Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID)
    : Routes.applicationCommands(config.DISCORD_CLIENT_ID);

  console.log(
    `Registering ${allCommands.length} commands ${
      config.DISCORD_GUILD_ID ? `to guild ${config.DISCORD_GUILD_ID}` : "globally"
    }...`,
  );

  await rest.put(route, { body: allCommands });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
