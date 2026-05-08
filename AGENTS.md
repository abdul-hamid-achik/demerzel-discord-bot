# Agent Notes

- Pulumi for this repo uses an intentionally empty config passphrase. When
  running Pulumi commands under `infra/`, set `PULUMI_CONFIG_PASSPHRASE=''`
  (spelled `PASSPHRASE`). Do not assume there is a non-empty passphrase or
  passphrase file.
