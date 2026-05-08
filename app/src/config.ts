import "dotenv/config";
import { z } from "zod";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";

export const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  DATABASE_URL: z.string().url(),
  TRANSLATION_PROVIDER: z.enum(["openai", "deepl", "google"]).default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().min(1).default(DEFAULT_OPENAI_MODEL),
  OPENAI_TRANSLATION_MODEL: z.string().min(1).default(DEFAULT_OPENAI_MODEL),
  DEEPL_API_KEY: z.string().optional(),
  GOOGLE_TRANSLATE_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export function parseConfig(
  env: Record<string, string | undefined>,
): z.infer<typeof schema> {
  return schema.parse(env);
}

export const config = parseConfig(process.env);
export type Config = typeof config;
