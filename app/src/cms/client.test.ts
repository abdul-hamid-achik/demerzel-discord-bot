import { describe, expect, test } from "bun:test";
import { normalizeCmsApiBaseUrl } from "./client.js";

describe("normalizeCmsApiBaseUrl", () => {
  test("accepts a site origin and points it at /api", () => {
    expect(normalizeCmsApiBaseUrl("https://www.starwarrior.org")).toBe(
      "https://www.starwarrior.org/api",
    );
  });

  test("keeps an explicit /api base unchanged", () => {
    expect(normalizeCmsApiBaseUrl("https://www.starwarrior.org/api")).toBe(
      "https://www.starwarrior.org/api",
    );
  });

  test("normalizes trailing slash, query, and hash", () => {
    expect(
      normalizeCmsApiBaseUrl("https://www.starwarrior.org/api/?x=1#section"),
    ).toBe("https://www.starwarrior.org/api");
  });

  test("supports local development origins", () => {
    expect(normalizeCmsApiBaseUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/api",
    );
  });
});
