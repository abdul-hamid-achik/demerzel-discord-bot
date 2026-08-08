# Agent Notes

- Repository layout:
  - `app/` is the Bun/TypeScript Discord bot, including Discord handlers,
    Drizzle schema/migrations, translation providers, reminders, and CMS
    command integration.
  - `infra/` is Pulumi TypeScript for the DigitalOcean droplet, firewall,
    project, and cloud-init.
- Prefer Taskfile commands from the repo root for routine work:
  - `task test` runs the Bun unit test suite.
  - `task lint` runs TypeScript type-checking.
  - `task register` registers Discord slash/context commands.
  - `task deploy` rsyncs `app/` to the droplet and rebuilds the Docker Compose
    service.
- `task` is installed on this machine but Codex/agent shells may miss Homebrew
  in `PATH`. If `task` is not found, run
  `export PATH="/opt/homebrew/bin:$PATH"` and retry the `task ...` command
  before falling back to manual Bun/Pulumi/rsync commands.
- Pulumi for this repo uses an intentionally empty config passphrase. When
  running Pulumi commands under `infra/`, set `PULUMI_CONFIG_PASSPHRASE=''`
  (spelled `PASSPHRASE`). Do not assume there is a non-empty passphrase or
  passphrase file. Taskfile commands that read Pulumi outputs, such as
  `task deploy`, `task remote:logs`, `task remote:restart`, and `task ssh`,
  need that same environment variable.
- Do not run install-dependent Taskfile commands in parallel. `task lint` and
  `task test` both depend on `task install`, and parallel `bun install` runs can
  race while linking packages.
- Deployment announcements are idempotent. Demerzel announces on startup only
  when `app/RELEASE_NOTES.md` changes, or when `DEMERZEL_RELEASE_ID` is set to a
  new value. The displayed release version comes from `app/package.json` unless
  `DEMERZEL_RELEASE_ID` is set. Update both `app/package.json` and
  `app/RELEASE_NOTES.md` for every user-visible deploy. Keep
  `app/RELEASE_NOTES.md` current-release-only, not a cumulative changelog,
  because Demerzel posts the whole file verbatim. Otherwise logs will say
  `release announcement already sent` and no Discord message will appear, the
  message will keep showing the old version, or old bullets will be re-announced.
- New-member welcomes are enabled by default in code. The Discord application
  must have **Server Members Intent** enabled in the Developer Portal; if it is
  missing, Demerzel retries startup without the member intent and logs the
  issue. In that fallback mode, Demerzel can still welcome from Discord native
  `USER_JOIN` system messages if the server has a System Messages Channel with
  join messages enabled. Do not add an env flag to control welcomes unless the
  product requirement changes. Welcome channel resolution is
  `DEMERZEL_WELCOME_CHANNEL_ID`, then
  `DEMERZEL_ANNOUNCEMENT_CHANNEL_ID`, then a text/announcement channel with
  `home` in the name inside `DISCORD_GUILD_ID`.
- For member access to text channels, prefer Discord roles and category
  permissions. The current product request explicitly grants per-member access
  on join through `app/src/onboarding/channel-access.ts`: all text/announcement
  channels by default, with `DEMERZEL_ONBOARDING_EXCLUDED_CHANNEL_IDS` and
  `DEMERZEL_ONBOARDING_EXCLUDED_CATEGORY_IDS` protecting private areas.
  `DEMERZEL_ONBOARDING_ACCESS_SCOPE=configured` restores the older configured
  channel/category selection. This needs Discord permission overwrite rights
  (`Manage Roles` / manage permissions). If the product later accepts a cleaner
  model, migrate this to assigning one configured "member" role on join.
- The bot branding is Demerzel, but some legacy Pulumi identifiers still use
  `hermes-translator-infra`, and `infra/cloud-init.yaml` still references
  `/opt/hermes`. Do not rename those casually: the project namespace affects
  stack/config identity, and changing Droplet `userData` can replace the
  production droplet. Always run `pulumi preview` and stop on any droplet
  replacement.
- CMS slash commands are optional. They should only be registered when
  `VOID_API_BASE_URL` (or legacy `VOID_API_URL`) and `VOID_API_KEY` are
  configured; blank optional env values should be treated as unset so a
  translator-only bot can still boot.
