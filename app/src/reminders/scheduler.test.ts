import { describe, expect, test } from "bun:test";
import type { Reminder } from "../db/schema.js";
import {
  REMINDER_RECONCILIATION_MS,
  REMINDER_SENDING_LEASE_MS,
  ReminderScheduler,
  type ReminderSchedulerOptions,
  type ReminderSchedulerStore,
  type ScheduledTimeout,
} from "./scheduler.js";

const START_MS = Date.parse("2026-07-24T12:00:00.000Z");

function reminder(
  id: string,
  remindAtMs: number,
  overrides: Partial<Reminder> = {},
): Reminder {
  const now = new Date(START_MS);
  return {
    id,
    creatorId: `creator-${id}`,
    guildId: "guild-1",
    channelId: null,
    deliveryTarget: "dm",
    remindAt: new Date(remindAtMs),
    message: `Reminder ${id}`,
    link: null,
    status: "pending",
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    sentAt: null,
    ...overrides,
  };
}

class FakeClock {
  private nextId = 1;
  private readonly timers = new Map<
    number,
    { at: number; callback: () => void }
  >();

  constructor(private currentMs = START_MS) {}

  readonly now = (): Date => new Date(this.currentMs);

  readonly scheduleTimeout = (
    callback: () => void,
    delayMs: number,
  ): ScheduledTimeout => {
    const id = this.nextId++;
    this.timers.set(id, {
      at: this.currentMs + Math.max(0, delayMs),
      callback,
    });
    return { cancel: () => this.timers.delete(id) };
  };

  get pendingCount(): number {
    return this.timers.size;
  }

  nextDelay(): number | null {
    const next = [...this.timers.values()].sort((a, b) => a.at - b.at)[0];
    return next ? next.at - this.currentMs : null;
  }

  advanceBy(ms: number): void {
    this.currentMs += ms;
    const due = [...this.timers.entries()]
      .filter(([, timer]) => timer.at <= this.currentMs)
      .sort(([, a], [, b]) => a.at - b.at);
    for (const [id, timer] of due) {
      if (!this.timers.delete(id)) continue;
      timer.callback();
    }
  }
}

class FakeChanges {
  private listener: (() => void) | null = null;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  };

  emit(): void {
    this.listener?.();
  }
}

class Deferred {
  readonly promise: Promise<void>;
  private resolvePromise!: () => void;

  constructor() {
    this.promise = new Promise<void>((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  resolve(): void {
    this.resolvePromise();
  }
}

class FakeStore implements ReminderSchedulerStore {
  claimCalls = 0;
  recoverCalls = 0;
  activeClaims = 0;
  maxActiveClaims = 0;
  recoverFailures = 0;
  blockNextClaim: Deferred | null = null;
  blockNextPendingQuery: Deferred | null = null;

  constructor(readonly rows: Reminder[] = []) {}

  async claimDue(now: Date, limit: number): Promise<Reminder[]> {
    this.claimCalls++;
    this.activeClaims++;
    this.maxActiveClaims = Math.max(this.maxActiveClaims, this.activeClaims);
    const blocker = this.blockNextClaim;
    this.blockNextClaim = null;

    try {
      if (blocker) await blocker.promise;
      const due = this.rows
        .filter(
          (row) =>
            row.status === "pending" && row.remindAt.getTime() <= now.getTime(),
        )
        .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())
        .slice(0, limit);
      for (const row of due) {
        row.status = "sending";
        row.updatedAt = now;
      }
      return due;
    } finally {
      this.activeClaims--;
    }
  }

  async markSent(id: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) {
      row.status = "sent";
      row.sentAt = new Date(row.updatedAt);
    }
  }

  async markFailed(id: string, reason: string): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row) {
      row.status = "failed";
      row.failureReason = reason;
    }
  }

  async nextPendingAt(): Promise<Date | null> {
    const blocker = this.blockNextPendingQuery;
    this.blockNextPendingQuery = null;
    if (blocker) await blocker.promise;
    return (
      this.rows
        .filter((row) => row.status === "pending")
        .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())[0]
        ?.remindAt ?? null
    );
  }

  async nextSendingUpdatedAt(): Promise<Date | null> {
    return (
      this.rows
        .filter((row) => row.status === "sending")
        .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0]
        ?.updatedAt ?? null
    );
  }

  async recoverStaleSending(cutoff: Date): Promise<number> {
    this.recoverCalls++;
    if (this.recoverFailures > 0) {
      this.recoverFailures--;
      throw new Error("database unavailable");
    }

    let recovered = 0;
    for (const row of this.rows) {
      if (
        row.status === "sending" &&
        row.updatedAt.getTime() <= cutoff.getTime()
      ) {
        row.status = "pending";
        recovered++;
      }
    }
    return recovered;
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  throw new Error("condition did not settle");
}

function createScheduler(
  store: FakeStore,
  clock: FakeClock,
  changes: FakeChanges,
  deliver: (row: Reminder) => Promise<void> = async () => {},
  options: ReminderSchedulerOptions = {},
): ReminderScheduler {
  return new ReminderScheduler(store, deliver, {
    now: clock.now,
    scheduleTimeout: clock.scheduleTimeout,
    subscribe: changes.subscribe,
    ...options,
  });
}

describe("ReminderScheduler", () => {
  test("stays idle without polling until the six-hour reconciliation", async () => {
    const store = new FakeStore();
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes);

    scheduler.start();
    await waitFor(() => clock.pendingCount === 1);

    expect(store.claimCalls).toBe(1);
    expect(clock.nextDelay()).toBe(REMINDER_RECONCILIATION_MS);

    clock.advanceBy(30_000);
    await settle();
    expect(store.claimCalls).toBe(1);
    scheduler.stop();
  });

  test("arms the next due reminder and delivers it on time", async () => {
    const row = reminder("next", START_MS + 60_000);
    const store = new FakeStore([row]);
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const delivered: string[] = [];
    const scheduler = createScheduler(store, clock, changes, async (due) => {
      delivered.push(due.id);
    });

    scheduler.start();
    await waitFor(() => clock.nextDelay() === 60_000);
    clock.advanceBy(59_999);
    await settle();
    expect(delivered).toEqual([]);

    clock.advanceBy(1);
    await waitFor(() => row.status === "sent");
    await waitFor(() => clock.pendingCount === 1);
    expect(delivered).toEqual(["next"]);
    expect(clock.nextDelay()).toBe(REMINDER_RECONCILIATION_MS);
    scheduler.stop();
  });

  test("coalesces create/cancel notifications and replans the one-shot timer", async () => {
    const later = reminder("later", START_MS + 60 * 60_000);
    const store = new FakeStore([later]);
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes);

    scheduler.start();
    await waitFor(() => clock.nextDelay() === 60 * 60_000);

    const earlier = reminder("earlier", START_MS + 60_000);
    store.rows.push(earlier);
    changes.emit();
    changes.emit();
    await waitFor(() => clock.nextDelay() === 60_000);

    earlier.status = "cancelled";
    changes.emit();
    await waitFor(() => clock.nextDelay() === 60 * 60_000);
    scheduler.stop();
  });

  test("recovers a sending reminder when its lease expires", async () => {
    const row = reminder("leased", START_MS - 60_000, {
      status: "sending",
      updatedAt: new Date(START_MS - 60_000),
    });
    const store = new FakeStore([row]);
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const delivered: string[] = [];
    const scheduler = createScheduler(store, clock, changes, async (due) => {
      delivered.push(due.id);
    });

    scheduler.start();
    await waitFor(
      () => clock.nextDelay() === REMINDER_SENDING_LEASE_MS - 60_000,
    );
    expect(delivered).toEqual([]);

    clock.advanceBy(REMINDER_SENDING_LEASE_MS - 60_000);
    await waitFor(() => row.status === "sent");
    expect(delivered).toEqual(["leased"]);
    scheduler.stop();
  });

  test("caps long timers at the configured safe horizon", async () => {
    const store = new FakeStore();
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes, async () => {}, {
      reconciliationMs: 10_000,
      maxTimerDelayMs: 1_000,
    });

    scheduler.start();
    await waitFor(() => clock.pendingCount === 1);
    expect(clock.nextDelay()).toBe(1_000);
    scheduler.stop();
  });

  test("backs off after database errors and resets after success", async () => {
    const store = new FakeStore();
    store.recoverFailures = 2;
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes, async () => {}, {
      reconciliationMs: 1_000,
      initialRetryMs: 100,
      maxRetryMs: 400,
    });

    scheduler.start();
    await waitFor(() => clock.nextDelay() === 100);
    clock.advanceBy(100);
    await waitFor(() => clock.nextDelay() === 200);
    clock.advanceBy(200);
    await waitFor(() => clock.nextDelay() === 1_000);

    expect(store.recoverCalls).toBe(3);
    scheduler.stop();
  });

  test("never overlaps claim loops when changes arrive during a cycle", async () => {
    const store = new FakeStore();
    const blocker = new Deferred();
    store.blockNextClaim = blocker;
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes);

    scheduler.start();
    await waitFor(() => store.activeClaims === 1);
    changes.emit();
    changes.emit();
    expect(store.maxActiveClaims).toBe(1);

    blocker.resolve();
    await waitFor(() => clock.pendingCount === 1);
    expect(store.claimCalls).toBe(2);
    expect(store.maxActiveClaims).toBe(1);
    scheduler.stop();
  });

  test("continues a claimed batch after one delivery fails", async () => {
    const first = reminder("first", START_MS - 1);
    const second = reminder("second", START_MS - 1);
    const store = new FakeStore([first, second]);
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes, async (row) => {
      if (row.id === "first") throw new Error("Discord rejected the message");
    });

    scheduler.start();
    await waitFor(() => first.status === "failed" && second.status === "sent");
    expect(first.failureReason).toBe("Discord rejected the message");
    scheduler.stop();
  });

  test("drains due reminders in bounded batches", async () => {
    const rows = Array.from({ length: 11 }, (_, index) =>
      reminder(`due-${index}`, START_MS - 1),
    );
    const store = new FakeStore(rows);
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const delivered: string[] = [];
    const scheduler = createScheduler(
      store,
      clock,
      changes,
      async (row) => {
        delivered.push(row.id);
      },
      { claimLimit: 10, maxBatchesPerCycle: 1 },
    );

    scheduler.start();
    await waitFor(
      () =>
        rows.filter((row) => row.status === "sent").length === 10 &&
        clock.nextDelay() === 0,
    );
    expect(rows.filter((row) => row.status === "pending")).toHaveLength(1);

    clock.advanceBy(0);
    await waitFor(() => rows.every((row) => row.status === "sent"));

    expect(delivered).toHaveLength(11);
    expect(store.claimCalls).toBe(2);
    scheduler.stop();
  });

  test("stop cancels timers and unsubscribes from schedule changes", async () => {
    const store = new FakeStore();
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes);

    scheduler.start();
    await waitFor(() => clock.pendingCount === 1);
    scheduler.stop();
    expect(clock.pendingCount).toBe(0);

    changes.emit();
    clock.advanceBy(REMINDER_RECONCILIATION_MS);
    await settle();
    expect(store.claimCalls).toBe(1);
  });

  test("stop cannot be undone by an in-flight planning query", async () => {
    const store = new FakeStore();
    const blocker = new Deferred();
    store.blockNextPendingQuery = blocker;
    const clock = new FakeClock();
    const changes = new FakeChanges();
    const scheduler = createScheduler(store, clock, changes);

    scheduler.start();
    await waitFor(
      () => store.claimCalls === 1 && store.blockNextPendingQuery === null,
    );
    scheduler.stop();
    blocker.resolve();
    await settle();

    expect(clock.pendingCount).toBe(0);
  });
});
