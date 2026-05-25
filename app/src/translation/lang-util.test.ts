import { describe, expect, test } from "bun:test";
import {
  DEFAULT_TARGET_LANGUAGES,
  isSupportedLanguage,
  parseLanguages,
  SUPPORTED_LANGUAGES,
} from "./lang-util.ts";

describe("isSupportedLanguage", () => {
  test("accepts known codes", () => {
    for (const code of SUPPORTED_LANGUAGES) {
      expect(isSupportedLanguage(code)).toBe(true);
    }
  });

  test("rejects unknown codes", () => {
    expect(isSupportedLanguage("xx")).toBe(false);
    expect(isSupportedLanguage("EN")).toBe(false); // case-sensitive: caller normalizes
    expect(isSupportedLanguage("")).toBe(false);
  });
});

describe("parseLanguages", () => {
  test("returns defaults for null/empty/whitespace input", () => {
    expect(parseLanguages(null)).toEqual(DEFAULT_TARGET_LANGUAGES);
    expect(parseLanguages(undefined)).toEqual(DEFAULT_TARGET_LANGUAGES);
    expect(parseLanguages("")).toEqual(DEFAULT_TARGET_LANGUAGES);
  });

  test("parses a single valid code", () => {
    expect(parseLanguages("en")).toEqual(["en"]);
  });

  test("parses comma-separated codes", () => {
    expect(parseLanguages("en,es,it")).toEqual(["en", "es", "it"]);
  });

  test("trims whitespace around codes", () => {
    expect(parseLanguages(" en , es ,  it ")).toEqual(["en", "es", "it"]);
  });

  test("lowercases codes", () => {
    expect(parseLanguages("EN,Es,IT")).toEqual(["en", "es", "it"]);
  });

  test("filters out unsupported codes", () => {
    expect(parseLanguages("en,xx,es,bogus")).toEqual(["en", "es"]);
  });

  test("falls back to defaults when ALL codes are unsupported", () => {
    expect(parseLanguages("xx,yy,zz")).toEqual(DEFAULT_TARGET_LANGUAGES);
  });

  test("preserves user-specified order", () => {
    expect(parseLanguages("pt,en,es")).toEqual(["pt", "en", "es"]);
  });
});

describe("constants", () => {
  test("DEFAULT_TARGET_LANGUAGES includes every supported language", () => {
    expect(DEFAULT_TARGET_LANGUAGES).toEqual([...SUPPORTED_LANGUAGES]);
  });

  test("DEFAULT_TARGET_LANGUAGES are all supported", () => {
    for (const code of DEFAULT_TARGET_LANGUAGES) {
      expect(isSupportedLanguage(code)).toBe(true);
    }
  });

  test("SUPPORTED_LANGUAGES has no duplicates", () => {
    expect(new Set(SUPPORTED_LANGUAGES).size).toBe(SUPPORTED_LANGUAGES.length);
  });
});
