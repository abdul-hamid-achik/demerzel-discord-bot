# Claude Notes

- Use the repository instructions in `AGENTS.md` as the source of truth.
- Prefer `task` commands from the repo root for routine work:
  - `task test`
  - `task lint`
  - `task register`
  - `task deploy`
- `task` is installed at `/opt/homebrew/bin/task`, but some agent shells do not
  include Homebrew in `PATH`. If `task` is not found, run
  `export PATH="/opt/homebrew/bin:$PATH"` and retry the `task ...` command before
  using lower-level fallback commands.
