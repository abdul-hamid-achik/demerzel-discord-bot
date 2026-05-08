CREATE TABLE IF NOT EXISTS "message_index" (
	"discord_message_id" varchar(32) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"author_id" varchar(32) NOT NULL,
	"original_text" text NOT NULL,
	"original_hash" varchar(64) NOT NULL,
	"source_language" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translation_cache" (
	"original_hash" varchar(64) NOT NULL,
	"source_language" varchar(8) NOT NULL,
	"target_language" varchar(8) NOT NULL,
	"translated_text" text NOT NULL,
	"provider" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_cache_original_hash_source_language_target_language_pk" PRIMARY KEY("original_hash","source_language","target_language")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "translation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"discord_message_id" varchar(32),
	"channel_id" varchar(32) NOT NULL,
	"source_language" varchar(8),
	"target_language" varchar(8) NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"discord_user_id" varchar(32) PRIMARY KEY NOT NULL,
	"primary_language" varchar(8) NOT NULL,
	"secondary_languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"auto_translate" boolean DEFAULT false NOT NULL,
	"show_original" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_index_hash_idx" ON "message_index" USING btree ("original_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_index_channel_idx" ON "message_index" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_index_author_idx" ON "message_index" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_events_user_idx" ON "translation_events" USING btree ("discord_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_events_channel_idx" ON "translation_events" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "translation_events_type_idx" ON "translation_events" USING btree ("event_type");