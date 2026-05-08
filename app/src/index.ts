import { startClient } from "./discord/client.js";
import { logger } from "./logger.js";

async function main() {
  const client = await startClient();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await client.destroy();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (err) => {
    logger.error({ err }, "unhandledRejection");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "startup failed");
  process.exit(1);
});
