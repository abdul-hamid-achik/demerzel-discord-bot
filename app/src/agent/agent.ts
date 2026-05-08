import { ChannelType, type AnyThreadChannel, type Message } from "discord.js";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { messageIndex, type NewTranslationEvent } from "../db/schema.js";
import { analytics } from "../analytics/engine.js";
import { channels } from "../channels/engine.js";
import { preferences } from "../preferences/engine.js";
import { hashText } from "../translation/cache.js";
import { detectLanguage } from "../translation/language-detect.js";
import {
  translator,
  type TranslateResult,
} from "../translation/orchestrator.js";
import { logger } from "../logger.js";
import { NO_MENTIONS, sendDiscordChunks } from "../discord/messages.js";
import { effectiveCleanupMinutes, shouldCleanupThread } from "./cleanup.js";
import { shouldAutoTranslate } from "./filters.js";

const FLAGS: Record<string, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
  it: "🇮🇹",
  pt: "🇧🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  pl: "🇵🇱",
  ru: "🇷🇺",
  ja: "🇯🇵",
  ko: "🇰🇷",
  zh: "🇨🇳",
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
 * Orchestrates the translation lifecycle: indexing, on-demand translation,
 * and thread fan-out. Translation providers, the cache, and analytics all
 * live behind this surface so handlers don't have to wire them up.
 */
export class BotAgent {
  flag(language: string): string {
    return FLAGS[language] ?? "🌐";
  }

  private recordAnalytics(
    event: Omit<NewTranslationEvent, "id" | "createdAt">,
  ): void {
    void analytics.record(event).catch((err) => {
      logger.warn(
        {
          err,
          eventType: event.eventType,
          channelId: event.channelId,
          discordMessageId: event.discordMessageId,
        },
        "analytics record failed",
      );
    });
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
      args.targetLanguage ??
      (await preferences.getPrimaryLanguage(args.requesterId));

    const result = await translator.translate({
      text: args.text,
      targetLanguage: target,
      sourceLanguage: args.sourceLanguage,
    });

    this.recordAnalytics({
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
      logger.warn(
        { channelId: message.channelId },
        "channel does not support threads",
      );
      return;
    }
    if (message.hasThread) {
      logger.info(
        { messageId: message.id },
        "translation thread skipped: already has thread",
      );
      return;
    }

    const indexed = await this.indexMessage(message);
    const targets = languages.filter(
      (lang) => lang && lang !== indexed.sourceLanguage,
    );

    const results = await Promise.allSettled(
      targets.map((lang) =>
        translator.translate({
          text: indexed.originalText,
          sourceLanguage: indexed.sourceLanguage,
          targetLanguage: lang,
        }),
      ),
    );

    const thread = await message.startThread({
      name: `Translations · ${message.author.username}`.slice(0, 90),
      autoArchiveDuration: 60,
    });

    const lines: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const lang = targets[i]!;
      const r = results[i]!;
      if (r.status === "rejected") {
        logger.error(
          { err: r.reason, messageId: message.id, lang },
          "translation-thread failed for one lang",
        );
        continue;
      }
      const result = r.value;
      lines.push(`${this.flag(lang)} ${result.translatedText}`);
      this.recordAnalytics({
        discordUserId: message.author.id,
        discordMessageId: message.id,
        channelId: message.channelId,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        eventType: "translation_thread",
      });
    }

    if (lines.length === 0) {
      try {
        await thread.send({
          content: "_No additional languages to translate to._",
          allowedMentions: NO_MENTIONS,
        });
      } catch (err) {
        logger.error(
          { err, messageId: message.id, channelId: message.channelId },
          "translation-thread empty notice send failed",
        );
        throw err;
      }
      return;
    }
    await sendDiscordChunks(thread, lines.join("\n"), {
      operation: "translation-thread",
      messageId: message.id,
      channelId: message.channelId,
    });
  }

  /**
   * Auto-translation entry point: called for every message in a channel that
   * has auto-translate enabled. Decides whether the message is worth
   * translating, then posts a thread under it with one line per target lang.
   */
  async autoTranslateMessage(message: Message): Promise<void> {
    const ctx = {
      messageId: message.id,
      channelId: message.channelId,
      authorId: message.author.id,
      contentLen: message.content?.length ?? 0,
    };

    if (!shouldAutoTranslate(message)) {
      logger.debug({ ...ctx, skip: "filter" }, "auto-translate skipped");
      return;
    }

    const setting = await channels.get(message.channelId);
    if (!setting?.autoTranslate || setting.targetLanguages.length === 0) {
      logger.debug(
        { ...ctx, skip: "no-channel-config", hasSetting: !!setting },
        "auto-translate skipped",
      );
      return;
    }

    if (
      message.channel.type !== ChannelType.GuildText &&
      message.channel.type !== ChannelType.GuildAnnouncement
    ) {
      logger.info(
        { ...ctx, skip: "wrong-channel-type", type: message.channel.type },
        "auto-translate skipped: channel doesn't support threads",
      );
      return;
    }

    if (message.hasThread) {
      logger.debug(
        { ...ctx, skip: "already-has-thread" },
        "auto-translate skipped",
      );
      return;
    }

    logger.info(
      { ...ctx, targets: setting.targetLanguages },
      "auto-translating",
    );

    const indexed = await this.indexMessage(message);
    const sourceLang = indexed.sourceLanguage;

    const filtered = setting.targetLanguages.filter(
      (lang) => lang && lang !== sourceLang,
    );
    if (filtered.length === 0) return;

    // Reorder so languages preferred by recently-active authors in this
    // channel come first. Each user's primary language ends up nearest the
    // top — without dropping any of the configured targets.
    const targets = await preferences.rankByChannelActivity(
      message.channelId,
      filtered,
    );

    const results = await Promise.allSettled(
      targets.map((lang) =>
        translator.translate({
          text: indexed.originalText,
          sourceLanguage: sourceLang === "und" ? undefined : sourceLang,
          targetLanguage: lang,
        }),
      ),
    );

    const lines: string[] = [];
    for (let i = 0; i < results.length; i++) {
      const lang = targets[i]!;
      const r = results[i]!;
      if (r.status === "rejected") {
        logger.error(
          { err: r.reason, messageId: message.id, lang },
          "auto-translate failed",
        );
        continue;
      }
      const result = r.value;
      if (!result.translatedText.trim()) continue;
      lines.push(`${this.flag(lang)} ${result.translatedText}`);
      this.recordAnalytics({
        discordUserId: message.author.id,
        discordMessageId: message.id,
        channelId: message.channelId,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        eventType: result.cached ? "cache_hit" : "auto_translate",
      });
    }

    if (lines.length === 0) {
      logger.info({ ...ctx, sourceLang }, "auto-translate produced no lines");
      return;
    }

    try {
      const thread = await message.startThread({
        name: `${this.flag(sourceLang)} → ${targets.map((t) => this.flag(t)).join(" ")}`.slice(
          0,
          90,
        ),
        autoArchiveDuration: 60,
      });
      await sendDiscordChunks(thread, lines.join("\n"), {
        operation: "auto-translate",
        messageId: message.id,
        channelId: message.channelId,
      });
      logger.info(
        { ...ctx, threadId: thread.id, lines: lines.length },
        "auto-translate thread posted",
      );
      this.scheduleThreadCleanup(thread, setting.cleanupMinutes);
    } catch (err) {
      logger.error({ err, ...ctx }, "auto-translate thread post failed");
    }
  }

  /**
   * Best-effort: after `cleanupMinutes`, archive the translation thread if no
   * humans (or other bots) have replied. Archiving (vs deleting) hides the
   * thread from the channel sidebar but preserves history. In-memory timer;
   * lost on restart, which is acceptable since stale threads will eventually
   * be re-swept by `sweepStaleThreads` whenever a new message lands in the
   * channel.
   */
  private scheduleThreadCleanup(
    thread: AnyThreadChannel,
    cleanupMinutesValue: number | null,
  ): void {
    const minutes = effectiveCleanupMinutes(cleanupMinutesValue);
    if (minutes === 0) return;

    const ms = minutes * 60_000;
    const ourBotId = thread.client.user?.id;
    if (!ourBotId) return;

    setTimeout(() => {
      void this.maybeArchiveThread(thread, ourBotId);
    }, ms).unref?.();
  }

  private async maybeArchiveThread(
    thread: AnyThreadChannel,
    ourBotId: string,
    options: { force?: boolean; reason?: string } = {},
  ): Promise<boolean> {
    try {
      const fresh = await thread.fetch().catch(() => null);
      if (!fresh) return false;
      if (fresh.archived) return false;

      if (!options.force) {
        const messages = await fresh.messages.fetch({ limit: 50 });
        const authors = messages.map((m) => ({
          bot: m.author.bot,
          id: m.author.id,
        }));
        if (!shouldCleanupThread(authors, ourBotId)) {
          logger.debug(
            { threadId: fresh.id, authors: authors.length },
            "translation thread kept: human replies present",
          );
          return false;
        }
      }

      await fresh.setArchived(
        true,
        options.reason ?? "Auto-cleanup: translation thread had no replies",
      );
      logger.info(
        { threadId: fresh.id, force: !!options.force },
        "translation thread archived",
      );
      return true;
    } catch (err) {
      logger.warn({ err, threadId: thread.id }, "thread archive failed");
      return false;
    }
  }

  /**
   * Archive all active bot-owned translation threads in a given channel.
   * `force=false` (default) preserves threads that have human/other-bot
   * replies. Returns counts so callers can report back to the user.
   */
  async archiveBotThreadsInChannel(
    channel: Message["channel"],
    options: { force?: boolean } = {},
  ): Promise<{ archived: number; kept: number }> {
    const ourBotId = channel.client.user?.id;
    if (!ourBotId) return { archived: 0, kept: 0 };
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    ) {
      return { archived: 0, kept: 0 };
    }

    let archived = 0;
    let kept = 0;
    try {
      const active = await channel.threads.fetchActive();
      for (const [, thread] of active.threads) {
        if (thread.ownerId !== ourBotId) continue;
        const ok = await this.maybeArchiveThread(thread, ourBotId, {
          force: options.force,
          reason: options.force
            ? "Manual archive via /archive-translations"
            : "Manual archive (kept threads with replies)",
        });
        if (ok) archived++;
        else kept++;
      }
    } catch (err) {
      logger.warn({ err, channelId: channel.id }, "archive-bot-threads failed");
    }
    return { archived, kept };
  }

  /**
   * Restart-resilience fallback. On every incoming message, opportunistically
   * sweep older translation threads in the same channel that should have been
   * cleaned up by their setTimeout but weren't (because the bot restarted).
   */
  async sweepStaleThreads(message: Message): Promise<void> {
    const setting = await channels.get(message.channelId);
    if (!setting?.autoTranslate) return;
    const minutes = effectiveCleanupMinutes(setting.cleanupMinutes);
    if (minutes === 0) return;

    const ourBotId = message.client.user?.id;
    if (!ourBotId) return;

    const channel = message.channel;
    if (
      channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement
    )
      return;

    const cutoffMs = minutes * 60_000;
    const now = Date.now();

    try {
      const active = await channel.threads.fetchActive();
      for (const [, thread] of active.threads) {
        if (thread.ownerId !== ourBotId) continue;
        const created = thread.createdTimestamp ?? 0;
        if (now - created < cutoffMs) continue;
        await this.maybeArchiveThread(thread, ourBotId);
      }
    } catch (err) {
      logger.debug({ err }, "sweep stale threads failed");
    }
  }
}

export const agent = new BotAgent();
