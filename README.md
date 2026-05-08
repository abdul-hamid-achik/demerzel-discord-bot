# Hermes Translator — Discord Bot + DigitalOcean IaC

Multilingual Discord assistant. Pulumi (TypeScript) provisions a DigitalOcean
droplet; the bot runs in Docker on that droplet and uses NeonDB for storage.

## Layout

```
.
├── infra/        Pulumi TS — DO droplet, firewall, project, cloud-init
└── app/          discord.js bot, Drizzle schema, translation providers
```

## Prerequisites

- [Pulumi CLI](https://www.pulumi.com/docs/install/) (`brew install pulumi/tap/pulumi`)
- [Bun](https://bun.sh) (`curl -fsSL https://bun.sh/install | bash`)
- [Task](https://taskfile.dev) (`brew install go-task`) — run `task` to see all commands
- DigitalOcean Personal Access Token (Read/Write)
- SSH keypair (`~/.ssh/id_ed25519` + `.pub`)
- A [NeonDB](https://neon.tech) project (free tier is fine)
- A Discord application + bot — see "Discord setup" below

## 1. Provision the droplet

```bash
cd infra
bun install

# initialize a stack
pulumi stack init dev

# secrets + config
pulumi config set digitalocean:token <DO_PAT> --secret
cp Pulumi.dev.yaml.example Pulumi.dev.yaml   # then edit the values

# provision
pulumi up
pulumi stack output       # prints droplet IP, ssh command
```

Defaults: `s-1vcpu-2gb` Ubuntu 24.04 droplet in `nyc3`, with monitoring on,
backups off. The cloud-init script installs Docker + Compose plugin, creates a
hardened `deploy` user, enables UFW + fail2ban, and sets up a 2 GB swapfile.

To restrict SSH ingress to your IP:

```bash
pulumi config set hermes-translator-infra:sshAllowedCidr "1.2.3.4/32"
pulumi up
```

## 2. NeonDB

1. Create a project at neon.tech.
2. Copy the **pooled** connection string (the one ending with `-pooler`).
3. Put it in `app/.env` as `DATABASE_URL=...` (must include `?sslmode=require`).

## 3. Discord setup

1. Create an application at https://discord.com/developers/applications.
2. Under **Bot**, create a bot user; copy the token → `DISCORD_TOKEN`.
3. Enable **Message Content Intent** (required).
4. Under **OAuth2 → URL Generator**, select `bot` + `applications.commands`
   scopes, and the permissions: Send Messages, Read Message History,
   Create Public Threads, Send Messages in Threads, Embed Links, Add Reactions.
5. Copy the **Application ID** → `DISCORD_CLIENT_ID`.
6. Open the generated URL to invite the bot to your guild.

## 4. App configuration

```bash
cp app/.env.example app/.env
# fill in DISCORD_TOKEN, DISCORD_CLIENT_ID, DATABASE_URL,
# and the API key for whichever TRANSLATION_PROVIDER you choose.
```

## 5. Register slash commands

```bash
task register
```

For development, set `DISCORD_GUILD_ID` to scope commands to a single guild —
guild commands update instantly, global commands take up to an hour.

## 6. Run migrations

```bash
task migrate     # drizzle-kit generate + drizzle-kit migrate
```

## 7. Deploy

```bash
task deploy
```

This rsyncs `app/` to `/opt/hermes/app` on the droplet and runs
`docker compose up -d --build`. Tail logs with:

```bash
task remote:logs
```

## Local development

```bash
task dev          # bun --watch
```

Or with Docker:

```bash
task compose:up
task compose:logs
```

Run `task` (or `task --list`) to see all available commands.

## Swapping translation provider

Set `TRANSLATION_PROVIDER` to `openai`, `deepl`, or `google`. Each provider is
behind a small interface (`app/src/translation/providers/index.ts`) — adding a
new one means implementing `translate()` and registering it in the factory.

## Design notes

- Original messages are never edited or deleted. Translations are surfaced
  through ephemeral replies, DMs (reaction trigger), or threads.
- Translation cache key: `(sha256(text), source_lang, target_lang)`. Cache hits
  are still recorded as analytics events with `event_type='cache_hit'`.
- The `HermesAgent` class is the orchestration seam — Discord handlers call it,
  it owns the translation/cache/analytics flow. Future work (Hermes Agent
  framework, web overlay, summaries) plugs in here without touching handlers.

## Costs

- Droplet `s-1vcpu-2gb`: ~$12/month
- NeonDB: free tier sufficient for early use
- Translation API: variable; cache hits are free

## Tearing it down

```bash
task infra:destroy
```
