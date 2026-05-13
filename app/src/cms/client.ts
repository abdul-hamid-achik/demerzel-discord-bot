/**
 * Typed HTTP client for the StarWarrior Void API. All authenticated calls
 * include `Authorization: Bearer <VOID_API_KEY>`. Public read endpoints
 * (under /api/public/*) skip auth.
 *
 * The client is created lazily in `getCmsClient()` so the bot still boots
 * when the CMS API base URL is unset — CMS commands self-disable in that mode.
 */
import { config, getCmsApiBaseUrl } from "../config.js";
import { logger } from "../logger.js";
import type {
  AnnouncementFields,
  DiscordRoleMapping,
  Entry,
  EntryList,
  EventFields,
  I18nOverride,
  MemberFields,
  OperationFields,
  PageFields,
  Permission,
  PostFields,
  RolePermission,
} from "./types.js";

export class CmsApiError extends Error {
  constructor(
    public status: number,
    public bodyText: string,
    public url: string,
  ) {
    super(`Void API ${status} on ${url}: ${bodyText.slice(0, 200)}`);
    this.name = "CmsApiError";
  }
}

export class CmsClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {
    this.baseUrl = normalizeCmsApiBaseUrl(baseUrl);
  }

  // ─── Low-level ───────────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    init: RequestInit = {},
    opts: { auth?: boolean } = { auth: true },
  ): Promise<T> {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.baseUrl}${normalizedPath}`;
    const headers = new Headers(init.headers);
    if (opts.auth !== false) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new CmsApiError(res.status, text, url);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ─── Generic content ─────────────────────────────────────────────────────

  list<F>(
    type: string,
    params: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<EntryList<F>> {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.offset !== undefined) q.set("offset", String(params.offset));
    const query = q.toString() ? `?${q}` : "";
    return this.request<EntryList<F>>(`/content/${type}${query}`);
  }

  getBySlug<F>(type: string, slug: string): Promise<Entry<F>> {
    return this.request<Entry<F>>(
      `/content/${type}/slug/${encodeURIComponent(slug)}`,
    );
  }

  create<F>(
    type: string,
    body: { fields: F; status?: "draft" | "published"; discordUserId?: string },
  ): Promise<Entry<F>> {
    return this.request<Entry<F>>(`/content/${type}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  update<F>(
    type: string,
    id: string,
    body: { fields: Partial<F>; discordUserId?: string },
  ): Promise<Entry<F>> {
    return this.request<Entry<F>>(`/content/${type}/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  remove(type: string, id: string): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(`/content/${type}/${id}`, {
      method: "DELETE",
    });
  }

  publish<F>(type: string, id: string): Promise<Entry<F>> {
    return this.request<Entry<F>>(`/content/${type}/${id}/publish`, {
      method: "POST",
    });
  }

  unpublish<F>(type: string, id: string): Promise<Entry<F>> {
    return this.request<Entry<F>>(`/content/${type}/${id}/draft`, {
      method: "POST",
    });
  }

  // ─── Members ─────────────────────────────────────────────────────────────

  members(): Promise<EntryList<MemberFields>> {
    return this.list<MemberFields>("member", { limit: 200 });
  }

  memberByDiscordUser(userId: string): Promise<Entry<MemberFields>> {
    return this.request<Entry<MemberFields>>(
      `/content/member-by-discord/${encodeURIComponent(userId)}`,
    );
  }

  // ─── Operations / Events / Posts / Pages / Announcements ─────────────────

  operations(): Promise<EntryList<OperationFields>> {
    return this.list<OperationFields>("operation", { limit: 100 });
  }

  events(): Promise<EntryList<EventFields>> {
    return this.list<EventFields>("event", { limit: 100 });
  }

  posts(): Promise<EntryList<PostFields>> {
    return this.list<PostFields>("post", { limit: 100 });
  }

  pages(): Promise<EntryList<PageFields>> {
    return this.list<PageFields>("page", { limit: 100 });
  }

  announcements(): Promise<EntryList<AnnouncementFields>> {
    return this.list<AnnouncementFields>("announcement", { limit: 100 });
  }

  // ─── i18n overrides ──────────────────────────────────────────────────────

  setI18nOverride(
    locale: string,
    key: string,
    value: string,
    discordUserId?: string,
  ): Promise<I18nOverride> {
    return this.request<I18nOverride>(
      `/i18n/overrides/${encodeURIComponent(locale)}`,
      {
        method: "PUT",
        body: JSON.stringify({ key, value, discordUserId }),
      },
    );
  }

  removeI18nOverride(
    locale: string,
    key: string,
  ): Promise<{ deleted: boolean }> {
    return this.request<{ deleted: boolean }>(
      `/i18n/overrides/${encodeURIComponent(locale)}`,
      {
        method: "DELETE",
        body: JSON.stringify({ key }),
      },
    );
  }

  listI18nOverrides(): Promise<I18nOverride[]> {
    return this.request<I18nOverride[]>(`/i18n/overrides`);
  }

  // ─── Discord guild registry + role sync ──────────────────────────────────

  registerGuild(args: {
    guildId: string;
    guildName: string;
    defaultViewer?: boolean;
  }): Promise<unknown> {
    return this.request(`/discord/guilds`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  }

  syncRoles(args: {
    guildId: string;
    roles: { roleId: string; roleName: string; permission: RolePermission }[];
  }): Promise<{ synced: number }> {
    return this.request<{ synced: number }>(`/discord/roles/sync`, {
      method: "POST",
      body: JSON.stringify(args),
    });
  }

  listRoles(guildId: string): Promise<{
    guildId: string;
    roles: DiscordRoleMapping[];
  }> {
    return this.request(
      `/discord/roles?guildId=${encodeURIComponent(guildId)}`,
    );
  }

  // ─── Permissions ─────────────────────────────────────────────────────────

  resolvePermission(args: {
    guildId: string;
    userId: string;
    roleIds: string[];
  }): Promise<{ guildId: string; userId: string; permission: Permission }> {
    const q = new URLSearchParams({
      guildId: args.guildId,
      userId: args.userId,
      roleIds: args.roleIds.join(","),
    });
    return this.request(`/discord/permissions?${q}`);
  }
}

export function normalizeCmsApiBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.search = "";

  const path = url.pathname.replace(/\/+$/, "");
  url.pathname =
    path === "" || path === "/"
      ? "/api"
      : path.endsWith("/api")
        ? path
        : `${path}/api`;

  return url.toString().replace(/\/$/, "");
}

let cached: CmsClient | null = null;
let cmsDisabledLogged = false;

export function getCmsClient(): CmsClient | null {
  if (cached) return cached;
  const apiBaseUrl = getCmsApiBaseUrl();
  if (!apiBaseUrl || !config.VOID_API_KEY) {
    if (!cmsDisabledLogged) {
      logger.info(
        "VOID_API_BASE_URL/VOID_API_URL or VOID_API_KEY not set — CMS commands disabled",
      );
      cmsDisabledLogged = true;
    }
    return null;
  }
  cached = new CmsClient(apiBaseUrl, config.VOID_API_KEY);
  return cached;
}
