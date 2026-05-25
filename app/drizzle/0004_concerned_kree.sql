CREATE TABLE IF NOT EXISTS "release_announcements" (
	"release_id" varchar(128) PRIMARY KEY NOT NULL,
	"channel_id" varchar(32) NOT NULL,
	"message_id" varchar(32),
	"notes_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
