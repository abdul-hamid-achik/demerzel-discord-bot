const RELATIVE_RE =
  /^in\s+(\d+)\s*(minute|minutes|min|mins|m|hour|hours|hr|hrs|h|day|days|d|week|weeks|w)$/i;

const DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/;

const UNIT_MS: Record<string, number> = {
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  m: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  h: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  d: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000,
  w: 604_800_000,
};

export function parseReminderTime(raw: string, now = new Date()): Date | null {
  const input = raw.trim();
  if (!input) return null;

  const relative = RELATIVE_RE.exec(input);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2]?.toLowerCase();
    const ms = unit ? UNIT_MS[unit] : undefined;
    if (Number.isFinite(amount) && ms)
      return new Date(now.getTime() + amount * ms);
  }

  const dateTime = DATE_TIME_RE.exec(input);
  if (dateTime) {
    const [, day, hour, minute] = dateTime;
    const normalized = `${day}T${hour!.padStart(2, "0")}:${minute}:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isFutureReminderTime(
  date: Date,
  now = new Date(),
  minLeadMs = 10_000,
): boolean {
  return date.getTime() >= now.getTime() + minLeadMs;
}

export function formatReminderTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
  }).format(date);
}
