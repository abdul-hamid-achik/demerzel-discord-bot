import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { userPreferences, type UserPreference } from "../db/schema.js";

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

}

export const preferences = new PreferenceEngine();
