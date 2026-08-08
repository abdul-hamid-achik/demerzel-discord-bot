/**
 * Pure helpers around language codes. No I/O — safe to unit-test.
 */

export const SUPPORTED_LANGUAGES = [
  "en",
  "es",
  "it",
  "pt",
  "fr",
  "de",
  "pl",
  "ru",
  "ja",
  "ko",
  "zh",
  "ar",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const SUPPORTED_SET = new Set<string>(SUPPORTED_LANGUAGES);

export const DEFAULT_TARGET_LANGUAGES: string[] = [...SUPPORTED_LANGUAGES];
export const DEFAULT_TARGET_LANGUAGE_CODES = DEFAULT_TARGET_LANGUAGES.join(",");

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return SUPPORTED_SET.has(code);
}

/**
 * Parse a comma-separated list of language codes. Falls back to the default
 * targets when the input is empty or contains no recognized codes.
 */
export function parseLanguages(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_TARGET_LANGUAGES];
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => isSupportedLanguage(s));
  return parsed.length > 0 ? parsed : [...DEFAULT_TARGET_LANGUAGES];
}
