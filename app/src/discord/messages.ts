import type { MessageMentionOptions } from "discord.js";
import { logger } from "../logger.js";

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

type JsonLogValue = string | number | boolean | null | undefined;

export type DiscordLogContext = Record<string, JsonLogValue>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function setIfPrimitive(
  target: Record<string, JsonLogValue>,
  key: string,
  value: unknown,
): void {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    target[key] = value;
  }
}

export function discordErrorDetails(err: unknown): Record<string, JsonLogValue> {
  const details: Record<string, JsonLogValue> = {};

  if (err instanceof Error) {
    details.name = err.name;
    details.message = err.message;
  }

  const record = asRecord(err);
  if (!record) return details;

  for (const key of [
    "code",
    "status",
    "method",
    "url",
    "route",
    "retryAfter",
    "global",
  ]) {
    setIfPrimitive(details, key, record[key]);
  }

  const rawError = asRecord(record.rawError);
  if (rawError) {
    setIfPrimitive(details, "rawCode", rawError.code);
    setIfPrimitive(details, "rawMessage", rawError.message);
  }

  return details;
}

function discordTargetDetails(
  target: DiscordChunkTarget,
): Record<string, JsonLogValue> {
  const record = asRecord(target);
  if (!record) return {};

  const details: Record<string, JsonLogValue> = {};
  for (const key of ["id", "type", "guildId", "channelId"]) {
    setIfPrimitive(details, key, record[key]);
  }
  return details;
}

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
  context: DiscordLogContext = {},
): Promise<void> {
  const chunks = chunkDiscordText(content);
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    try {
      await target.send({ content: chunk, allowedMentions: NO_MENTIONS });
    } catch (err) {
      logger.error(
        {
          err,
          discord: discordErrorDetails(err),
          target: discordTargetDetails(target),
          ...context,
          chunkIndex: i,
          chunkCount: chunks.length,
          chunkLen: chunk.length,
          contentLen: content.length,
        },
        "discord chunk send failed",
      );
      throw err;
    }
  }
}
