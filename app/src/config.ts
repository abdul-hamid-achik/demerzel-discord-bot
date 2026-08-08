import "dotenv/config";
import { z } from "zod";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().optional(),
);

const optionalUrl = z.preprocess(
  emptyStringToUndefined,
  z.string().url().optional(),
);

const onboardingAccessScope = z.preprocess(
  emptyStringToUndefined,
  z.enum(["all_text", "configured"]).default("all_text"),
);

export const schema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: optionalString,
  DATABASE_URL: z.string().url(),
  TRANSLATION_PROVIDER: z.enum(["openai", "deepl", "google"]).default("openai"),
  OPENAI_API_KEY: optionalString,
  OPENAI_CHAT_MODEL: z.string().min(1).default(DEFAULT_OPENAI_MODEL),
  OPENAI_TRANSLATION_MODEL: z.string().min(1).default(DEFAULT_OPENAI_MODEL),
  DEEPL_API_KEY: optionalString,
  GOOGLE_TRANSLATE_API_KEY: optionalString,
  TAVILY_API_KEY: optionalString,
  REDIS_URL: optionalString,
  DEMERZEL_ANNOUNCEMENT_CHANNEL_ID: optionalString,
  DEMERZEL_WELCOME_CHANNEL_ID: optionalString,
  DEMERZEL_ONBOARDING_ACCESS_SCOPE: onboardingAccessScope,
  DEMERZEL_ONBOARDING_CHANNEL_IDS: optionalString,
  DEMERZEL_ONBOARDING_CATEGORY_ID: optionalString,
  DEMERZEL_ONBOARDING_EXCLUDED_CHANNEL_IDS: optionalString,
  DEMERZEL_ONBOARDING_EXCLUDED_CATEGORY_IDS: optionalString,
  DEMERZEL_RELEASE_ID: optionalString,
  DEMERZEL_RELEASE_NOTES: optionalString,
  DEMERZEL_RELEASE_NOTES_FILE: optionalString,
  // StarWarrior CMS via Void API. CMS commands (`/cms-*`) are skipped if
  // VOID_API_BASE_URL/VOID_API_URL or VOID_API_KEY is unset, so the bot still
  // runs as a pure translator.
  VOID_API_BASE_URL: optionalUrl,
  VOID_API_URL: optionalUrl,
  VOID_API_KEY: optionalString,
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export function parseConfig(env: Record<string, string | undefined>): Config {
  return schema.parse(env);
}

export type Config = z.infer<typeof schema>;

export const config = parseConfig(process.env);

type CmsConfig = Partial<
  Pick<Config, "VOID_API_BASE_URL" | "VOID_API_URL" | "VOID_API_KEY">
>;

export function getCmsApiBaseUrl(env: CmsConfig = config): string | undefined {
  return env.VOID_API_BASE_URL?.trim() || env.VOID_API_URL?.trim();
}

export function isCmsConfigured(env: CmsConfig = config): boolean {
  return Boolean(getCmsApiBaseUrl(env) && env.VOID_API_KEY?.trim());
}
