import { logger } from "../logger.js";

type ReminderScheduleListener = () => void;

const listeners = new Set<ReminderScheduleListener>();

export function subscribeReminderScheduleChanged(
  listener: ReminderScheduleListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyReminderScheduleChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (err) {
      // Persistence already succeeded, so a scheduler listener must never make
      // create/cancel look failed to the caller.
      logger.warn({ err }, "reminder schedule listener failed");
    }
  }
}
