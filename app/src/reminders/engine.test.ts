import { describe, expect, test } from "bun:test";
import type { Reminder } from "../db/schema.js";
import { ReminderEngine, type CreateReminderInput } from "./engine.js";

type EngineDatabase = NonNullable<
  ConstructorParameters<typeof ReminderEngine>[0]
>;

const NOW = new Date("2026-07-24T12:00:00.000Z");

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    creatorId: "creator-1",
    guildId: "guild-1",
    channelId: null,
    deliveryTarget: "dm",
    remindAt: new Date(NOW.getTime() + 60_000),
    message: "Check the fleet",
    link: null,
    status: "pending",
    failureReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    sentAt: null,
    ...overrides,
  };
}

const CREATE_INPUT: CreateReminderInput = {
  creatorId: "creator-1",
  guildId: "guild-1",
  channelId: null,
  deliveryTarget: "dm",
  remindAt: new Date(NOW.getTime() + 60_000),
  message: "Check the fleet",
};

function fakeDatabase(options: {
  pending?: Reminder[];
  pendingCount?: number;
  inserted?: Reminder;
  insertError?: Error;
  cancelled?: Reminder;
}): EngineDatabase {
  return {
    select(selection?: Record<string, unknown>) {
      if (selection && "count" in selection) {
        return {
          from: () => ({
            where: async () => [{ count: options.pendingCount ?? 0 }],
          }),
        };
      }

      return {
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: async () => options.pending ?? [],
            }),
          }),
        }),
      };
    },
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (options.insertError) throw options.insertError;
          return options.inserted ? [options.inserted] : [];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => (options.cancelled ? [options.cancelled] : []),
        }),
      }),
    }),
  } as unknown as EngineDatabase;
}

describe("ReminderEngine schedule notifications", () => {
  test("notifies after a reminder is persisted", async () => {
    const row = reminder();
    let notifications = 0;
    const engine = new ReminderEngine(
      fakeDatabase({ inserted: row }),
      () => notifications++,
    );

    await expect(engine.create(CREATE_INPUT)).resolves.toEqual(row);
    expect(notifications).toBe(1);
  });

  test("does not notify when reminder persistence fails", async () => {
    let notifications = 0;
    const engine = new ReminderEngine(
      fakeDatabase({ insertError: new Error("database unavailable") }),
      () => notifications++,
    );

    await expect(engine.create(CREATE_INPUT)).rejects.toThrow(
      "database unavailable",
    );
    expect(notifications).toBe(0);
  });

  test("notifies only when cancellation wins the pending-status CAS", async () => {
    const pending = reminder();
    const cancelled = reminder({ status: "cancelled" });
    let notifications = 0;
    const successful = new ReminderEngine(
      fakeDatabase({ pending: [pending], cancelled }),
      () => notifications++,
    );

    await expect(
      successful.cancelByUser(pending.creatorId, pending.id.slice(0, 8)),
    ).resolves.toEqual({ status: "cancelled", reminder: cancelled });
    expect(notifications).toBe(1);

    const lostRace = new ReminderEngine(
      fakeDatabase({ pending: [pending] }),
      () => notifications++,
    );
    await expect(
      lostRace.cancelByUser(pending.creatorId, pending.id.slice(0, 8)),
    ).resolves.toEqual({ status: "not_found" });
    expect(notifications).toBe(1);
  });
});
