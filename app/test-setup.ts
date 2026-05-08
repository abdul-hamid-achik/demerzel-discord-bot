// Bun preloads this before each test file. We populate env vars with safe
// stubs so modules that read process.env at import time (config.ts, the DB
// client) don't blow up during unit tests. Real values from .env still win
// because we only set when unset.
process.env.DISCORD_TOKEN ??= "test-discord-token";
process.env.DISCORD_CLIENT_ID ??= "0000000000000000";
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test?sslmode=disable";
process.env.OPENAI_API_KEY ??= "sk-test";
process.env.TRANSLATION_PROVIDER ??= "openai";
process.env.NODE_ENV ??= "test";
