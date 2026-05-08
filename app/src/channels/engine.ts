import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { channelSettings, type ChannelSetting } from "../db/schema.js";

export class ChannelEngine {
  async get(channelId: string): Promise<ChannelSetting | null> {
    const rows = await db
      .select()
      .from(channelSettings)
      .where(eq(channelSettings.channelId, channelId))
      .limit(1);
    return rows[0] ?? null;
  }

  async enableAutoTranslate(args: {
    channelId: string;
    guildId: string | null;
    targetLanguages: string[];
    cleanupMinutes: number | null;
  }): Promise<ChannelSetting> {
    const [row] = await db
      .insert(channelSettings)
      .values({
        channelId: args.channelId,
        guildId: args.guildId,
        autoTranslate: true,
        targetLanguages: args.targetLanguages,
        cleanupMinutes: args.cleanupMinutes,
      })
      .onConflictDoUpdate({
        target: channelSettings.channelId,
        set: {
          autoTranslate: true,
          targetLanguages: args.targetLanguages,
          guildId: args.guildId,
          cleanupMinutes: args.cleanupMinutes,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return row!;
  }

  async disableAutoTranslate(channelId: string): Promise<void> {
    await db
      .insert(channelSettings)
      .values({
        channelId,
        autoTranslate: false,
        targetLanguages: [],
      })
      .onConflictDoUpdate({
        target: channelSettings.channelId,
        set: { autoTranslate: false, updatedAt: sql`now()` },
      });
  }
}

export const channels = new ChannelEngine();
