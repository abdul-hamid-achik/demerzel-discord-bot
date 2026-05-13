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
- Pulumi for this repo uses an intentionally empty config passphrase. When
  running Pulumi commands under `infra/`, set `PULUMI_CONFIG_PASSPHRASE=''`
  (spelled `PASSPHRASE`). Do not assume there is a non-empty passphrase or
  passphrase file.
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
