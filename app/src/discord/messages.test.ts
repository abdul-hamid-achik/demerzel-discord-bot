import { describe, expect, test } from "bun:test";
import { discordErrorDetails } from "./messages.js";

describe("discordErrorDetails", () => {
  test("extracts useful Discord REST error fields without request bodies", () => {
    const err = Object.assign(new Error("Missing Permissions"), {
      code: 50013,
      status: 403,
      method: "POST",
      url: "https://discord.com/api/v10/channels/123/messages",
      route: "/channels/:id/messages",
      requestBody: { json: { content: "do not log this" } },
      rawError: {
        code: 50013,
        message: "Missing Permissions",
      },
    });

    const details = discordErrorDetails(err);

    expect(details).toEqual({
      name: "Error",
      message: "Missing Permissions",
      code: 50013,
      status: 403,
      method: "POST",
      url: "https://discord.com/api/v10/channels/123/messages",
      route: "/channels/:id/messages",
      rawCode: 50013,
      rawMessage: "Missing Permissions",
    });
    expect(details).not.toHaveProperty("requestBody");
  });
});
