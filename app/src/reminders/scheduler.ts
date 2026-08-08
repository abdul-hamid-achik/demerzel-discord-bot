import type { Client } from "discord.js";
import {
  isDiscordChunkTarget,
  sendDiscordChunks,
} from "../discord/messages.js";
import { logger } from "../logger.js";
import type { Reminder } from "../db/schema.js";
import { reminderEngine, shortReminderId } from "./engine.js";
import { subscribeReminderScheduleChanged } from "./events.js";
import { formatReminderTime } from "./time.js";

export const REMINDER_RECONCILIATION_MS = 6 * 60 * 60_000;
export const REMINDER_SENDING_LEASE_MS = 5 * 60_000;
export const MAX_TIMER_DELAY_MS = 2_147_483_647;

const CLAIM_LIMIT = 10;
const MAX_BATCHES_PER_CYCLE = 10;
const INITIAL_RETRY_MS = 60_000;
const MAX_RETRY_MS = 15 * 60_000;

export interface ReminderSchedulerStore {
  claimDue(now: Date, limit: number): Promise<Reminder[]>;
  markSent(id: string): Promise<void>;
  markFailed(id: string, reason: string): Promise<void>;
  nextPendingAt(): Promise<Date | null>;
  nextSendingUpdatedAt(): Promise<Date | null>;
  recoverStaleSending(cutoff: Date): Promise<number>;
}

export interface ScheduledTimeout {
  cancel(): void;
}

export interface ReminderSchedulerOptions {
  now?: () => Date;
  scheduleTimeout?: (callback: () => void, delayMs: number) => ScheduledTimeout;
  subscribe?: (listener: () => void) => () => void;
  reconciliationMs?: number;
  sendingLeaseMs?: number;
  maxTimerDelayMs?: number;
  claimLimit?: number;
  maxBatchesPerCycle?: number;
  initialRetryMs?: number;
  maxRetryMs?: number;
}

function systemScheduleTimeout(
  callback: () => void,
  delayMs: number,
): ScheduledTimeout {
  const timer = setTimeout(callback, delayMs);
  timer.unref?.();
  return { cancel: () => clearTimeout(timer) };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

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
    await sendDiscordChunks(user, content, {
      operation: "reminder-dm",
      reminderId: reminder.id,
      userId: reminder.creatorId,
    });
    return;
  }

  if (!reminder.channelId) {
    throw new Error("channel reminder has no channelId");
  }

  const channel = await client.channels.fetch(reminder.channelId);
  if (!channel?.isTextBased() || !isDiscordChunkTarget(channel)) {
    throw new Error(`channel ${reminder.channelId} is not sendable`);
  }

  await sendDiscordChunks(channel, content, {
    operation: "reminder-channel",
    reminderId: reminder.id,
    channelId: reminder.channelId,
  });
}

export class ReminderScheduler {
  private readonly now: () => Date;
  private readonly scheduleTimeout: (
    callback: () => void,
    delayMs: number,
  ) => ScheduledTimeout;
  private readonly subscribe: (listener: () => void) => () => void;
  private readonly reconciliationMs: number;
  private readonly sendingLeaseMs: number;
  private readonly maxTimerDelayMs: number;
  private readonly claimLimit: number;
  private readonly maxBatchesPerCycle: number;
  private readonly initialRetryMs: number;
  private readonly maxRetryMs: number;

  private timer: ScheduledTimeout | null = null;
  private timerGeneration = 0;
  private unsubscribe: (() => void) | null = null;
  private started = false;
  private stopped = true;
  private running = false;
  private rerunRequested = false;
  private retryMs: number;

  constructor(
    private readonly store: ReminderSchedulerStore,
    private readonly deliver: (reminder: Reminder) => Promise<void>,
    options: ReminderSchedulerOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.scheduleTimeout = options.scheduleTimeout ?? systemScheduleTimeout;
    this.subscribe = options.subscribe ?? subscribeReminderScheduleChanged;
    this.reconciliationMs = positiveInteger(
      options.reconciliationMs,
      REMINDER_RECONCILIATION_MS,
    );
    this.sendingLeaseMs = positiveInteger(
      options.sendingLeaseMs,
      REMINDER_SENDING_LEASE_MS,
    );
    this.maxTimerDelayMs = positiveInteger(
      options.maxTimerDelayMs,
      MAX_TIMER_DELAY_MS,
    );
    this.claimLimit = positiveInteger(options.claimLimit, CLAIM_LIMIT);
    this.maxBatchesPerCycle = positiveInteger(
      options.maxBatchesPerCycle,
      MAX_BATCHES_PER_CYCLE,
    );
    this.initialRetryMs = positiveInteger(
      options.initialRetryMs,
      INITIAL_RETRY_MS,
    );
    this.maxRetryMs = Math.max(
      this.initialRetryMs,
      positiveInteger(options.maxRetryMs, MAX_RETRY_MS),
    );
    this.retryMs = this.initialRetryMs;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.stopped = false;
    this.unsubscribe = this.subscribe(() => this.requestRun());
    this.requestRun();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.rerunRequested = false;
    this.clearTimer();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private requestRun(): void {
    if (this.stopped) return;

    this.rerunRequested = true;
    this.clearTimer();
    if (this.running) return;

    this.running = true;
    void this.run();
  }

  private async run(): Promise<void> {
    let backlogPending = false;
    try {
      while (this.rerunRequested && !this.stopped) {
        this.rerunRequested = false;
        backlogPending = (await this.processCycle()) || backlogPending;
      }

      if (!this.stopped) {
        if (backlogPending) this.armTimer(0);
        else await this.planNextRun();
        this.retryMs = this.initialRetryMs;
      }
    } catch (err) {
      if (!this.stopped) {
        const retryMs = this.retryMs;
        this.retryMs = Math.min(this.retryMs * 2, this.maxRetryMs);
        logger.warn(
          { err, retryMs },
          "reminder scheduler cycle failed; retry scheduled",
        );
        this.armTimer(retryMs);
      }
    } finally {
      this.running = false;
      if (this.rerunRequested && !this.stopped) this.requestRun();
    }
  }

  private async processCycle(): Promise<boolean> {
    const cutoff = new Date(this.now().getTime() - this.sendingLeaseMs);
    const recovered = await this.store.recoverStaleSending(cutoff);
    if (recovered > 0) {
      // Discord delivery and the status update cannot be atomic. A crash after
      // Discord accepts a message can therefore produce an at-least-once retry.
      logger.warn({ recovered }, "recovered stale reminder deliveries");
    }

    for (let batch = 0; batch < this.maxBatchesPerCycle; batch++) {
      const due = await this.store.claimDue(this.now(), this.claimLimit);
      if (due.length === 0) return false;

      for (const reminder of due) {
        try {
          await this.deliver(reminder);
          await this.store.markSent(reminder.id);
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
          try {
            await this.store.markFailed(reminder.id, reason);
          } catch (markErr) {
            logger.warn(
              { err: markErr, reminderId: reminder.id },
              "reminder failure status update failed",
            );
          }
          logger.warn(
            { err, reminderId: reminder.id },
            "reminder delivery failed",
          );
        }
      }

      if (due.length < this.claimLimit || this.stopped) return false;
    }

    // Yield to the event loop after a bounded amount of delivery work.
    return true;
  }

  private async planNextRun(): Promise<void> {
    const [nextPendingAt, nextSendingUpdatedAt] = await Promise.all([
      this.store.nextPendingAt(),
      this.store.nextSendingUpdatedAt(),
    ]);
    const nowMs = this.now().getTime();
    const reconciliationAt = nowMs + this.reconciliationMs;
    const sendingLeaseAt = nextSendingUpdatedAt
      ? nextSendingUpdatedAt.getTime() + this.sendingLeaseMs
      : Number.POSITIVE_INFINITY;
    const pendingAt = nextPendingAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const targetAt = Math.min(reconciliationAt, sendingLeaseAt, pendingAt);
    const delayMs = Math.min(
      Math.max(0, targetAt - nowMs),
      this.maxTimerDelayMs,
    );

    this.armTimer(delayMs);
  }

  private armTimer(delayMs: number): void {
    if (this.stopped) return;
    this.clearTimer();
    const generation = ++this.timerGeneration;
    this.timer = this.scheduleTimeout(() => {
      if (generation !== this.timerGeneration || this.stopped) return;
      this.timer = null;
      this.requestRun();
    }, delayMs);
  }

  private clearTimer(): void {
    this.timerGeneration++;
    this.timer?.cancel();
    this.timer = null;
  }
}

let activeScheduler: { stop(): void } | null = null;

export function startReminderScheduler(client: Client): { stop(): void } {
  if (activeScheduler) return activeScheduler;

  const scheduler = new ReminderScheduler(reminderEngine, (reminder) =>
    deliverReminder(client, reminder),
  );
  scheduler.start();

  const handle = {
    stop() {
      scheduler.stop();
      if (activeScheduler === handle) activeScheduler = null;
    },
  };
  activeScheduler = handle;

  logger.info(
    { reconciliationMs: REMINDER_RECONCILIATION_MS },
    "reminder scheduler started",
  );
  return handle;
}
