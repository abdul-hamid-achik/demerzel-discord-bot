import { describe, expect, test } from "bun:test";
import { GatewayIntentBits } from "discord.js";
import { buildClient, isDisallowedIntentError } from "./client.js";

describe("buildClient", () => {
  test("requests Server Members Intent by default so welcomes are enabled", () => {
    const client = buildClient();

    expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(
      true,
    );
    client.destroy();
  });

  test("can build a fallback client without Server Members Intent", () => {
    const client = buildClient({ welcomeEnabled: false });

    expect(client.options.intents.has(GatewayIntentBits.GuildMembers)).toBe(
      false,
    );
    client.destroy();
  });
});

describe("isDisallowedIntentError", () => {
  test("matches Discord's disallowed intent startup error", () => {
    expect(isDisallowedIntentError(new Error("Used disallowed intents"))).toBe(
      true,
    );
    expect(isDisallowedIntentError(new Error("bad token"))).toBe(false);
    expect(isDisallowedIntentError("Used disallowed intents")).toBe(false);
  });
});
