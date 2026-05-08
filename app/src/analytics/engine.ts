import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { translationEvents, type NewTranslationEvent } from "../db/schema.js";

export type EventType =
  | "translation_request"
  | "translation_thread"
  | "auto_translate"
  | "language_set"
  | "cache_hit";

export class AnalyticsEngine {
  async record(event: Omit<NewTranslationEvent, "id" | "createdAt">): Promise<void> {
    await db.insert(translationEvents).values(event);
  }

  async languagePopularity(limit = 10) {
    return db
      .select({
        language: translationEvents.targetLanguage,
        count: sql<number>`count(*)::int`,
      })
      .from(translationEvents)
      .groupBy(translationEvents.targetLanguage)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  }

  async channelActivity(limit = 10) {
    return db
      .select({
        channelId: translationEvents.channelId,
        count: sql<number>`count(*)::int`,
      })
      .from(translationEvents)
      .groupBy(translationEvents.channelId)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
  }

  async userRequestCount(discordUserId: string): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(translationEvents)
      .where(eq(translationEvents.discordUserId, discordUserId));
    return rows[0]?.count ?? 0;
  }
}

export const analytics = new AnalyticsEngine();
