import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userPreferences = pgTable("user_preferences", {
  discordUserId: varchar("discord_user_id", { length: 32 }).primaryKey(),
  primaryLanguage: varchar("primary_language", { length: 8 }).notNull(),
  secondaryLanguages: text("secondary_languages")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  autoTranslate: boolean("auto_translate").notNull().default(false),
  showOriginal: boolean("show_original").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const messageIndex = pgTable(
  "message_index",
  {
    discordMessageId: varchar("discord_message_id", {
      length: 32,
    }).primaryKey(),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    authorId: varchar("author_id", { length: 32 }).notNull(),
    originalText: text("original_text").notNull(),
    originalHash: varchar("original_hash", { length: 64 }).notNull(),
    sourceLanguage: varchar("source_language", { length: 8 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    hashIdx: index("message_index_hash_idx").on(t.originalHash),
    channelIdx: index("message_index_channel_idx").on(t.channelId),
    authorIdx: index("message_index_author_idx").on(t.authorId),
  }),
);

export const translationCache = pgTable(
  "translation_cache",
  {
    originalHash: varchar("original_hash", { length: 64 }).notNull(),
    sourceLanguage: varchar("source_language", { length: 8 }).notNull(),
    targetLanguage: varchar("target_language", { length: 8 }).notNull(),
    translatedText: text("translated_text").notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.originalHash, t.sourceLanguage, t.targetLanguage],
    }),
  }),
);

export const translationEvents = pgTable(
  "translation_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    discordUserId: varchar("discord_user_id", { length: 32 }).notNull(),
    discordMessageId: varchar("discord_message_id", { length: 32 }),
    channelId: varchar("channel_id", { length: 32 }).notNull(),
    sourceLanguage: varchar("source_language", { length: 8 }),
    targetLanguage: varchar("target_language", { length: 8 }).notNull(),
    eventType: varchar("event_type", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("translation_events_user_idx").on(t.discordUserId),
    channelIdx: index("translation_events_channel_idx").on(t.channelId),
    typeIdx: index("translation_events_type_idx").on(t.eventType),
  }),
);

export const channelSettings = pgTable("channel_settings", {
  channelId: varchar("channel_id", { length: 32 }).primaryKey(),
  guildId: varchar("guild_id", { length: 32 }),
  autoTranslate: boolean("auto_translate").notNull().default(false),
  targetLanguages: text("target_languages")
    .array()
    .notNull()
    .default(sql`ARRAY[]::text[]`),
  // Minutes after which a translation thread is auto-cleaned up if it has no
  // human replies. 0 = never delete. NULL = use the app default.
  cleanupMinutes: integer("cleanup_minutes").default(5),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: varchar("creator_id", { length: 32 }).notNull(),
    guildId: varchar("guild_id", { length: 32 }),
    channelId: varchar("channel_id", { length: 32 }),
    deliveryTarget: varchar("delivery_target", { length: 16 }).notNull(),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    message: text("message").notNull(),
    link: text("link"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => ({
    dueIdx: index("reminders_due_idx").on(t.status, t.remindAt),
    creatorIdx: index("reminders_creator_idx").on(t.creatorId),
    channelIdx: index("reminders_channel_idx").on(t.channelId),
  }),
);

export const releaseAnnouncements = pgTable("release_announcements", {
  releaseId: varchar("release_id", { length: 128 }).primaryKey(),
  channelId: varchar("channel_id", { length: 32 }).notNull(),
  messageId: varchar("message_id", { length: 32 }),
  notesHash: varchar("notes_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type NewUserPreference = typeof userPreferences.$inferInsert;
export type MessageIndexRow = typeof messageIndex.$inferSelect;
export type NewMessageIndexRow = typeof messageIndex.$inferInsert;
export type TranslationCacheRow = typeof translationCache.$inferSelect;
export type NewTranslationCacheRow = typeof translationCache.$inferInsert;
export type TranslationEvent = typeof translationEvents.$inferSelect;
export type NewTranslationEvent = typeof translationEvents.$inferInsert;
export type ChannelSetting = typeof channelSettings.$inferSelect;
export type NewChannelSetting = typeof channelSettings.$inferInsert;
export type Reminder = typeof reminders.$inferSelect;
export type NewReminder = typeof reminders.$inferInsert;
export type ReleaseAnnouncement = typeof releaseAnnouncements.$inferSelect;
export type NewReleaseAnnouncement = typeof releaseAnnouncements.$inferInsert;
