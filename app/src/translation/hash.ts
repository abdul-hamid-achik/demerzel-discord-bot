import { createHash } from "node:crypto";

/**
 * Stable cache key for translation lookups. Whitespace-trimmed so that a
 * trailing newline or accidental indentation doesn't bust the cache. Pure;
 * no I/O — safe to import from tests.
 */
export function hashText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}
