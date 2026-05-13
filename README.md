# Demerzel — Discord Bot + DigitalOcean IaC

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

For StarWarrior CMS commands, also set:

```bash
VOID_API_BASE_URL=https://www.starwarrior.org/api
VOID_API_KEY=<same value as BOT_API_KEY in the StarWarrior Void project>
```

`DATABASE_URL` is Demerzel's own Neon/Postgres database for translation state,
preferences, and reminders. It is not the StarWarrior CMS database. CMS writes go
through the Void API with the bearer key above.

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

This rsyncs `app/` to `/opt/demerzel/app` on the droplet and runs
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

## Reminders and Demerzel

The bot can schedule one-time reminders backed by Postgres, so reminders
survive bot restarts. Use slash commands directly:

```text
/reminder create when:"in 2 hours" message:"Check the event signup" delivery:"Private DM"
/reminder create when:"2026-05-09T18:00:00-06:00" message:"Fleet event starts" delivery:"This channel"
/reminder list
/reminder cancel id:"abcd1234"
```

When `TAVILY_API_KEY` is set, Demerzel can also search live web results before
scheduling. Example:

```text
@Demerzel search when the next Foundation Galactic Empire event is, then remind this channel one hour before with the link.
```

Channel reminders are posted without allowed mentions, so generated text cannot
accidentally ping roles, users, or `@everyone`.

## Swapping translation provider

Set `TRANSLATION_PROVIDER` to `openai`, `deepl`, or `google`. Each provider is
behind a small interface (`app/src/translation/providers/index.ts`) — adding a
new one means implementing `translate()` and registering it in the factory.

OpenAI-backed chat and translation default to `gpt-5.4-nano` to keep Discord
usage inexpensive. Set `OPENAI_CHAT_MODEL` or `OPENAI_TRANSLATION_MODEL` to
`gpt-5.4-mini` if you need stronger replies and can accept the higher token
cost.

## Design notes

- Original messages are never edited or deleted. Translations are surfaced
  through ephemeral replies, DMs (reaction trigger), or threads.
- Translation cache key: `(sha256(text), source_lang, target_lang)`. Cache hits
  are still recorded as analytics events with `event_type='cache_hit'`.
- The bot only indexes messages when a feature needs it, instead of running
  language detection for every message in every channel.
- Reminders are claimed from the database before delivery, which avoids obvious
  duplicate sends if more than one bot process is running.
- The `BotAgent` class is the orchestration seam — Discord handlers call it,
  it owns the translation/cache/analytics flow. Future work such as a web
  overlay or summaries plugs in here without touching handlers.

## Costs

- Droplet `s-1vcpu-2gb`: ~$12/month
- NeonDB: free tier sufficient for early use
- OpenAI API: defaults to `gpt-5.4-nano`; cache hits are free for translations

## Tearing it down

```bash
task infra:destroy
```
