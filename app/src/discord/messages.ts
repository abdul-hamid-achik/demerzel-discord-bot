import type { MessageMentionOptions } from "discord.js";

export const NO_MENTIONS: MessageMentionOptions = { parse: [] };
export const NO_REPLY_MENTIONS: MessageMentionOptions = {
  parse: [],
  repliedUser: false,
};

export interface DiscordChunkTarget {
  send(options: {
    content: string;
    allowedMentions?: MessageMentionOptions;
  }): Promise<unknown>;
}

export function isDiscordChunkTarget(
  value: unknown,
): value is DiscordChunkTarget {
  if (!value || typeof value !== "object") return false;
  const maybe = value as { send?: unknown };
  return typeof maybe.send === "function";
}

const DISCORD_MESSAGE_LIMIT = 2000;
const DEFAULT_CHUNK_SIZE = 1900;

export function chunkDiscordText(
  text: string,
  maxLength = DEFAULT_CHUNK_SIZE,
): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let buffer = "";

  for (const line of text.split("\n")) {
    if (line.length > maxLength) {
      if (buffer) {
        chunks.push(buffer);
        buffer = "";
      }
      for (let i = 0; i < line.length; i += maxLength) {
        chunks.push(line.slice(i, i + maxLength));
      }
      continue;
    }

    const next = buffer ? `${buffer}\n${line}` : line;
    if (next.length > maxLength) {
      if (buffer) chunks.push(buffer);
      buffer = line;
    } else {
      buffer = next;
    }
  }

  if (buffer) chunks.push(buffer);
  return chunks.length > 0 ? chunks : [text.slice(0, DISCORD_MESSAGE_LIMIT)];
}

export async function sendDiscordChunks(
  target: DiscordChunkTarget,
  content: string,
): Promise<void> {
  for (const chunk of chunkDiscordText(content)) {
    await target.send({ content: chunk, allowedMentions: NO_MENTIONS });
  }
}
