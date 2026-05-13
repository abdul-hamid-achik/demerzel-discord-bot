/**
 * Shapes mirrored from the Void API. Kept narrow to what the bot consumes;
 * tighten as we add commands.
 */

export type Permission = "admin" | "editor" | "viewer" | "none";

export type Entry<F = Record<string, unknown>> = {
  id: string;
  typeId: string;
  slug: string;
  status: "draft" | "published" | "archived";
  fields: F;
  createdBy: string;
  publishedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export type EntryList<F = Record<string, unknown>> = {
  items: Entry<F>[];
  total: number;
  limit: number;
  offset: number;
};

export type MemberFields = {
  name: string;
  power: number;
  rank: number;
  role?: string;
  avatarUrl?: string;
  discordUserId?: string;
};

export type OperationFields = {
  title: string;
  status: "planning" | "upcoming" | "active" | "completed" | "cancelled";
  startsAt?: string;
  region?: string;
  category?: string;
  description?: string;
};

export type EventFields = {
  title: string;
  day?: string;
  month?: string;
  time?: string;
  tone?: "amber" | "cyan" | "green" | "gold";
  description?: string;
};

export type PostFields = {
  title: string;
  body: string;
  excerpt?: string;
  image?: string;
  tags?: string[];
};

export type PageFields = {
  title: string;
  body: string;
  excerpt?: string;
};

export type AnnouncementFields = {
  title: string;
  body: string;
  image?: string;
  priority?: "low" | "normal" | "high" | "urgent";
};

export type I18nOverride = {
  id: string;
  locale: string;
  key: string;
  value: string;
  updatedBy: string;
  updatedAt: number;
};

export type RolePermission = "viewer" | "editor" | "admin";

export type DiscordRoleMapping = {
  id: string;
  guildId: string;
  roleId: string;
  roleName: string;
  permission: RolePermission;
};
