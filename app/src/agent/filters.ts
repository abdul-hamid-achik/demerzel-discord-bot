/**
 * Predicate-only: deciding whether a message is worth auto-translating.
 * Lives outside agent.ts so it can be unit-tested without a real Discord
 * Message — pass any object that has the four fields we read.
 */
export interface FilterableMessage {
  author: { bot: boolean };
  system: boolean | null;
  webhookId: string | null;
  content: string | null | undefined;
}

export function shouldAutoTranslate(message: FilterableMessage): boolean {
  if (message.author.bot) return false;
  if (message.system) return false;
  if (message.webhookId) return false;

  const text = (message.content ?? "").trim();
  if (text.length === 0) return false;

  // Strip mentions, custom emojis, and URLs so a message that's *only* a
  // mention or a URL doesn't get a translation thread.
  const stripped = text
    .replace(/<@!?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/<:\w+:\d+>/g, "")
    .replace(/<a:\w+:\d+>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .trim();

  const wordCount = stripped.split(/\s+/).filter(Boolean).length;
  if (wordCount < 1) return false;

  if (text.startsWith("/") || text.startsWith("!")) return false;

  return true;
}
