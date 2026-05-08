CREATE TABLE IF NOT EXISTS "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" varchar(32) NOT NULL,
	"guild_id" varchar(32),
	"channel_id" varchar(32),
	"delivery_target" varchar(16) NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"status" varchar(16) DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "channel_settings" ALTER COLUMN "cleanup_minutes" SET DEFAULT 5;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_due_idx" ON "reminders" USING btree ("status","remind_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_creator_idx" ON "reminders" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reminders_channel_idx" ON "reminders" USING btree ("channel_id");