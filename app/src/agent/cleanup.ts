/**
 * Pure logic for deciding whether a translation thread can be auto-cleaned.
 * Called with the bot's own user ID and a list of message authors observed
 * in the thread. Pure → unit-testable without any Discord plumbing.
 */
export interface ThreadAuthor {
  bot: boolean;
  id: string;
}

export const DEFAULT_CLEANUP_MINUTES = 5;

/**
 * A translation thread is safe to delete when nobody other than our bot has
 * posted in it. Any human reply, or even another bot replying, means real
 * conversation kicked off and we keep the history.
 */
export function shouldCleanupThread(
  authors: ThreadAuthor[],
  ourBotId: string,
): boolean {
  if (authors.length === 0) return true;
  return authors.every((a) => a.bot && a.id === ourBotId);
}

/**
 * Resolve the effective cleanup minutes for a channel:
 *   null/undefined → app default
 *   0              → never clean up
 *   N > 0          → clean up after N minutes
 */
export function effectiveCleanupMinutes(
  value: number | null | undefined,
): number {
  if (value === null || value === undefined) return DEFAULT_CLEANUP_MINUTES;
  if (value < 0) return 0;
  return Math.floor(value);
}
