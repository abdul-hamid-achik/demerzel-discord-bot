import pino, { type LoggerOptions } from "pino";
import { config } from "./config.js";

const isDev = config.NODE_ENV === "development";
const isTest = config.NODE_ENV === "test";

const opts: LoggerOptions = isDev
  ? {
      level: config.LOG_LEVEL,
      transport: { target: "pino-pretty", options: { colorize: true } },
    }
  : isTest
    ? { level: "silent" }
    : {
        level: config.LOG_LEVEL,
        transport: {
          targets: [
            // 1 = stdout (so `docker compose logs` keeps working)
            {
              target: "pino/file",
              level: config.LOG_LEVEL,
              options: { destination: 1 },
            },
            // Persistent file so failures are inspectable after a crash/restart.
            {
              target: "pino/file",
              level: config.LOG_LEVEL,
              options: { destination: "logs/bot.log", mkdir: true },
            },
          ],
        },
      };

export const logger = pino(opts);
