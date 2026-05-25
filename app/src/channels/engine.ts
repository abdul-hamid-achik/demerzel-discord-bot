import { eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { channelSettings, type ChannelSetting } from "../db/schema.js";
import { DEFAULT_TARGET_LANGUAGES } from "../translation/lang-util.js";

export interface EffectiveAutoTranslateSetting {
  channelId: string;
  guildId: string | null;
  autoTranslate: boolean;
  targetLanguages: string[];
  cleanupMinutes: number | null;
  isDefault: boolean;
}

export function effectiveAutoTranslateSetting(args: {
  channelId: string;
  guildId?: string | null;
  setting: ChannelSetting | null;
}): EffectiveAutoTranslateSetting {
  if (args.setting) {
    return {
      channelId: args.setting.channelId,
      guildId: args.setting.guildId,
      autoTranslate: args.setting.autoTranslate,
      targetLanguages: args.setting.autoTranslate
        ? [...args.setting.targetLanguages]
        : [],
      cleanupMinutes: args.setting.cleanupMinutes,
      isDefault: false,
    };
  }

  return {
    channelId: args.channelId,
    guildId: args.guildId ?? null,
    autoTranslate: true,
    targetLanguages: [...DEFAULT_TARGET_LANGUAGES],
    cleanupMinutes: null,
    isDefault: true,
  };
}

export class ChannelEngine {
  async get(channelId: string): Promise<ChannelSetting | null> {
    const rows = await db
      .select()
      .from(channelSettings)
      .where(eq(channelSettings.channelId, channelId))
      .limit(1);
    return rows[0] ?? null;
  }

  async getEffectiveAutoTranslate(args: {
    channelId: string;
    guildId?: string | null;
  }): Promise<EffectiveAutoTranslateSetting> {
    return effectiveAutoTranslateSetting({
      channelId: args.channelId,
      guildId: args.guildId,
      setting: await this.get(args.channelId),
    });
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
        set: {
          autoTranslate: false,
          targetLanguages: [],
          updatedAt: sql`now()`,
        },
      });
  }

  async clearAutoTranslateOverride(channelId: string): Promise<void> {
    await db
      .delete(channelSettings)
      .where(eq(channelSettings.channelId, channelId));
  }
}

export const channels = new ChannelEngine();
