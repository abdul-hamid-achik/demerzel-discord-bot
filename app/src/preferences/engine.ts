import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { messageIndex, userPreferences, type UserPreference } from "../db/schema.js";

export const DEFAULT_LANGUAGE = "en";

export class PreferenceEngine {
  async get(discordUserId: string): Promise<UserPreference | null> {
    const rows = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.discordUserId, discordUserId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getPrimaryLanguage(discordUserId: string): Promise<string> {
    const pref = await this.get(discordUserId);
    return pref?.primaryLanguage ?? DEFAULT_LANGUAGE;
  }

  async setPrimaryLanguage(
    discordUserId: string,
    language: string,
  ): Promise<UserPreference> {
    const [row] = await db
      .insert(userPreferences)
      .values({
        discordUserId,
        primaryLanguage: language,
      })
      .onConflictDoUpdate({
        target: userPreferences.discordUserId,
        set: { primaryLanguage: language, updatedAt: sql`now()` },
      })
      .returning();
    return row!;
  }

  /**
   * Rank a channel's configured target languages by how many recently-active
   * authors in that channel have set each as their primary language. Languages
   * tied or with no signal preserve their original (configured) order.
   */
  async rankByChannelActivity(
    channelId: string,
    configuredTargets: string[],
    lookbackMessages = 100,
  ): Promise<string[]> {
    if (configuredTargets.length <= 1) return configuredTargets;

    const recent = await db
      .select({ authorId: messageIndex.authorId })
      .from(messageIndex)
      .where(eq(messageIndex.channelId, channelId))
      .orderBy(desc(messageIndex.createdAt))
      .limit(lookbackMessages);

    const uniqueAuthors = Array.from(new Set(recent.map((r) => r.authorId)));
    if (uniqueAuthors.length === 0) return configuredTargets;

    const prefs = await db
      .select({
        userId: userPreferences.discordUserId,
        lang: userPreferences.primaryLanguage,
      })
      .from(userPreferences)
      .where(inArray(userPreferences.discordUserId, uniqueAuthors));

    if (prefs.length === 0) return configuredTargets;

    const counts = new Map<string, number>();
    for (const p of prefs) counts.set(p.lang, (counts.get(p.lang) ?? 0) + 1);

    // Stable sort: pair each target with its original index, sort by count
    // desc, then original index asc to break ties.
    return configuredTargets
      .map((lang, idx) => ({ lang, idx, count: counts.get(lang) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.idx - b.idx)
      .map((x) => x.lang);
  }
}

export const preferences = new PreferenceEngine();
