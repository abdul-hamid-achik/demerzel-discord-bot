import { describe, expect, test } from "bun:test";
import { hashText } from "./hash.ts";

describe("hashText", () => {
  test("returns a 64-char lowercase hex string (sha-256)", () => {
    const h = hashText("hello world");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test("is deterministic for the same input", () => {
    expect(hashText("ragazzi andiamo")).toBe(hashText("ragazzi andiamo"));
  });

  test("trims whitespace before hashing (so a trailing newline doesn't bust the cache)", () => {
    expect(hashText("hola mundo")).toBe(hashText("  hola mundo  "));
    expect(hashText("hola mundo")).toBe(hashText("hola mundo\n"));
  });

  test("differs for different content", () => {
    expect(hashText("hello")).not.toBe(hashText("hello!"));
    expect(hashText("hello")).not.toBe(hashText("Hello")); // case-sensitive
  });

  test("handles unicode (emojis, accented chars)", () => {
    const a = hashText("¡hola amigos! 🎉");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(hashText("¡hola amigos! 🎉"));
    expect(a).not.toBe(hashText("hola amigos"));
  });

  test("hashes empty string consistently", () => {
    expect(hashText("")).toBe(hashText(""));
    expect(hashText("")).toBe(hashText("   "));
  });
});
