CREATE TABLE IF NOT EXISTS "channel_settings" (
	"channel_id" varchar(32) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32),
	"auto_translate" boolean DEFAULT false NOT NULL,
	"target_languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
