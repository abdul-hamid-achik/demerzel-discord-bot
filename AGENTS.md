# Agent Notes

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
