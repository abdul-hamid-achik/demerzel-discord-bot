import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { reminders, type NewReminder, type Reminder } from "../db/schema.js";

export type ReminderDeliveryTarget = "dm" | "channel";
export type ReminderStatus =
  | "pending"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

export interface CreateReminderInput {
  creatorId: string;
  guildId: string | null;
  channelId: string | null;
  deliveryTarget: ReminderDeliveryTarget;
  remindAt: Date;
  message: string;
  link?: string | null;
}

const MAX_PENDING_PER_USER = 25;

export function shortReminderId(id: string): string {
  return id.slice(0, 8);
}

export class ReminderEngine {
  async create(input: CreateReminderInput): Promise<Reminder> {
    const pending = await this.pendingCountForUser(input.creatorId);
    if (pending >= MAX_PENDING_PER_USER) {
      throw new Error(
        `You already have ${MAX_PENDING_PER_USER} pending reminders. Cancel one before adding another.`,
      );
    }

    const values: NewReminder = {
      creatorId: input.creatorId,
      guildId: input.guildId,
      channelId: input.deliveryTarget === "channel" ? input.channelId : null,
      deliveryTarget: input.deliveryTarget,
      remindAt: input.remindAt,
      message: input.message,
      link: input.link ?? null,
      status: "pending",
    };

    const [row] = await db.insert(reminders).values(values).returning();
    return row!;
  }

  async pendingCountForUser(creatorId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reminders)
      .where(
        and(
          eq(reminders.creatorId, creatorId),
          eq(reminders.status, "pending"),
        ),
      );
    return row?.count ?? 0;
  }

  async listPendingForUser(creatorId: string, limit = 10): Promise<Reminder[]> {
    return db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.creatorId, creatorId),
          eq(reminders.status, "pending"),
        ),
      )
      .orderBy(asc(reminders.remindAt))
      .limit(limit);
  }

  async listRecentForUser(creatorId: string, limit = 10): Promise<Reminder[]> {
    return db
      .select()
      .from(reminders)
      .where(eq(reminders.creatorId, creatorId))
      .orderBy(desc(reminders.createdAt))
      .limit(limit);
  }

  async cancelByUser(
    creatorId: string,
    idOrPrefix: string,
  ): Promise<
    | { status: "cancelled"; reminder: Reminder }
    | { status: "not_found" }
    | { status: "ambiguous"; matches: Reminder[] }
  > {
    const rows = await this.listPendingForUser(creatorId, 25);
    const matches = rows.filter((r) => r.id.startsWith(idOrPrefix));
    if (matches.length === 0) return { status: "not_found" };
    if (matches.length > 1) return { status: "ambiguous", matches };

    const target = matches[0]!;
    const [updated] = await db
      .update(reminders)
      .set({ status: "cancelled", updatedAt: sql`now()` })
      .where(and(eq(reminders.id, target.id), eq(reminders.status, "pending")))
      .returning();

    return updated
      ? { status: "cancelled", reminder: updated }
      : { status: "not_found" };
  }

  async claimDue(now = new Date(), limit = 10): Promise<Reminder[]> {
    const candidates = await db
      .select()
      .from(reminders)
      .where(and(eq(reminders.status, "pending"), lte(reminders.remindAt, now)))
      .orderBy(asc(reminders.remindAt))
      .limit(limit);

    const claimed: Reminder[] = [];
    for (const candidate of candidates) {
      const [row] = await db
        .update(reminders)
        .set({ status: "sending", updatedAt: sql`now()` })
        .where(
          and(eq(reminders.id, candidate.id), eq(reminders.status, "pending")),
        )
        .returning();
      if (row) claimed.push(row);
    }

    return claimed;
  }

  async markSent(id: string): Promise<void> {
    await db
      .update(reminders)
      .set({
        status: "sent",
        sentAt: sql`now()`,
        updatedAt: sql`now()`,
        failureReason: null,
      })
      .where(eq(reminders.id, id));
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await db
      .update(reminders)
      .set({
        status: "failed",
        failureReason: reason.slice(0, 1000),
        updatedAt: sql`now()`,
      })
      .where(eq(reminders.id, id));
  }
}

export const reminderEngine = new ReminderEngine();
