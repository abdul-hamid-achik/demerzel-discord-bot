import type { Message } from "discord.js";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { messageIndex } from "../db/schema.js";
import { analytics } from "../analytics/engine.js";
import { preferences } from "../preferences/engine.js";
import { hashText } from "../translation/cache.js";
import { detectLanguage } from "../translation/language-detect.js";
import { translator, type TranslateResult } from "../translation/orchestrator.js";
import { logger } from "../logger.js";

const FLAGS: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  it: "🇮🇹",
  pt: "🇧🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
};

export interface IndexedMessage {
  discordMessageId: string;
  channelId: string;
  authorId: string;
  originalText: string;
  originalHash: string;
  sourceLanguage: string;
}

/**
 * Hermes orchestrates the translation lifecycle: indexing, on-demand
 * translation, and thread fan-out. Translation providers, the cache, and
 * analytics live behind this surface so callers don't have to wire them up.
 */
export class HermesAgent {
  flag(language: string): string {
    return FLAGS[language] ?? "🌐";
  }

  async indexMessage(message: Message): Promise<IndexedMessage> {
    const content = message.content ?? "";
    const hash = hashText(content);
    const sourceLanguage = await detectLanguage(content);

    const row: IndexedMessage = {
      discordMessageId: message.id,
      channelId: message.channelId,
      authorId: message.author.id,
      originalText: content,
      originalHash: hash,
      sourceLanguage,
    };

    await db
      .insert(messageIndex)
      .values(row)
      .onConflictDoUpdate({
        target: messageIndex.discordMessageId,
        set: {
          originalText: content,
          originalHash: hash,
          sourceLanguage,
          createdAt: sql`now()`,
        },
      });

    return row;
  }

  async translateForUser(args: {
    text: string;
    requesterId: string;
    channelId: string;
    discordMessageId?: string;
    targetLanguage?: string;
    sourceLanguage?: string;
  }): Promise<TranslateResult> {
    const target =
      args.targetLanguage ?? (await preferences.getPrimaryLanguage(args.requesterId));

    const result = await translator.translate({
      text: args.text,
      targetLanguage: target,
      sourceLanguage: args.sourceLanguage,
    });

    await analytics.record({
      discordUserId: args.requesterId,
      discordMessageId: args.discordMessageId ?? null,
      channelId: args.channelId,
      sourceLanguage: result.sourceLanguage,
      targetLanguage: result.targetLanguage,
      eventType: result.cached ? "cache_hit" : "translation_request",
    });

    return result;
  }

  async createTranslationThread(
    message: Message,
    languages: string[],
  ): Promise<void> {
    if (!message.channel.isTextBased() || !("threads" in message.channel)) {
      logger.warn({ channelId: message.channelId }, "channel does not support threads");
      return;
    }

    const indexed = await this.indexMessage(message);

    const thread = await message.startThread({
      name: `Translations · ${message.author.username}`.slice(0, 90),
      autoArchiveDuration: 60,
    });

    const lines: string[] = [];
    for (const lang of languages) {
      if (lang === indexed.sourceLanguage) continue;
      const result = await translator.translate({
        text: indexed.originalText,
        sourceLanguage: indexed.sourceLanguage,
        targetLanguage: lang,
      });
      lines.push(`${this.flag(lang)} ${result.translatedText}`);

      await analytics.record({
        discordUserId: message.author.id,
        discordMessageId: message.id,
        channelId: message.channelId,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        eventType: "translation_thread",
      });
    }

    if (lines.length === 0) {
      await thread.send("_No additional languages to translate to._");
      return;
    }
    await thread.send(lines.join("\n"));
  }
}

export const hermes = new HermesAgent();
