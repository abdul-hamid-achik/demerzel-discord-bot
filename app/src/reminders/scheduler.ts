import type { Client } from "discord.js";
import { logger } from "../logger.js";
import {
  isDiscordChunkTarget,
  sendDiscordChunks,
} from "../discord/messages.js";
import { reminderEngine, shortReminderId } from "./engine.js";
import { formatReminderTime } from "./time.js";
import type { Reminder } from "../db/schema.js";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const CLAIM_LIMIT = 10;

let activeScheduler: { stop(): void } | null = null;

function reminderContent(reminder: Reminder): string {
  const lines = [
    `Reminder ${shortReminderId(reminder.id)} from <@${reminder.creatorId}>`,
    `Scheduled for ${formatReminderTime(reminder.remindAt)}`,
    "",
    reminder.message,
  ];
  if (reminder.link) lines.push("", reminder.link);
  return lines.join("\n");
}

async function deliverReminder(
  client: Client,
  reminder: Reminder,
): Promise<void> {
  const content = reminderContent(reminder);

  if (reminder.deliveryTarget === "dm") {
    const user = await client.users.fetch(reminder.creatorId);
    await sendDiscordChunks(user, content);
    return;
  }

  if (!reminder.channelId) {
    throw new Error("channel reminder has no channelId");
  }

  const channel = await client.channels.fetch(reminder.channelId);
  if (!channel?.isTextBased() || !isDiscordChunkTarget(channel)) {
    throw new Error(`channel ${reminder.channelId} is not sendable`);
  }

  await sendDiscordChunks(channel, content);
}

export function startReminderScheduler(
  client: Client,
  intervalMs = DEFAULT_POLL_INTERVAL_MS,
): { stop(): void } {
  if (activeScheduler) return activeScheduler;

  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const due = await reminderEngine.claimDue(new Date(), CLAIM_LIMIT);
      for (const reminder of due) {
        try {
          await deliverReminder(client, reminder);
          await reminderEngine.markSent(reminder.id);
          logger.info(
            {
              reminderId: reminder.id,
              deliveryTarget: reminder.deliveryTarget,
              channelId: reminder.channelId,
            },
            "reminder delivered",
          );
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await reminderEngine.markFailed(reminder.id, reason);
          logger.warn(
            { err, reminderId: reminder.id },
            "reminder delivery failed",
          );
        }
      }
    } catch (err) {
      logger.warn({ err }, "reminder scheduler tick failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  void tick();

  activeScheduler = {
    stop() {
      clearInterval(timer);
      activeScheduler = null;
    },
  };

  logger.info({ intervalMs }, "reminder scheduler started");
  return activeScheduler;
}
