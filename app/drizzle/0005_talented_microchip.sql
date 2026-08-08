CREATE TABLE IF NOT EXISTS "welcome_events" (
	"event_key" varchar(128) PRIMARY KEY NOT NULL,
	"guild_id" varchar(32) NOT NULL,
	"discord_user_id" varchar(32) NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"thread_id" varchar(32),
	"joined_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
