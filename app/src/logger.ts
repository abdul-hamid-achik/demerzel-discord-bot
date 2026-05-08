import pino, { type LoggerOptions } from "pino";
import { config } from "./config.js";

const isDev = config.NODE_ENV === "development";

const opts: LoggerOptions = isDev
  ? {
      level: config.LOG_LEVEL,
      transport: { target: "pino-pretty", options: { colorize: true } },
    }
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
            options: { destination: "/app/logs/bot.log", mkdir: true },
          },
        ],
      },
    };

export const logger = pino(opts);
