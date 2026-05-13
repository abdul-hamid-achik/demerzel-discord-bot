import { describe, expect, test } from "bun:test";
import { buildAllCommands } from "./commands.js";

function commandNames(commands: unknown[]): string[] {
  return commands.map((command) => {
    if (
      command &&
      typeof command === "object" &&
      "name" in command &&
      typeof command.name === "string"
    ) {
      return command.name;
    }
    throw new Error("command is missing a string name");
  });
}

describe("buildAllCommands", () => {
  test("omits CMS commands when CMS is disabled", () => {
    const commands = buildAllCommands({ includeCms: false });
    const names = commandNames(commands);

    expect(names).not.toContain("cms-member");
    expect(names).not.toContain("cms-operation");
    expect(names).not.toContain("cms-event");
    expect(names).not.toContain("cms-i18n");
    expect(names).not.toContain("cms-content");
  });

  test("adds CMS commands when CMS is enabled", () => {
    const withoutCms = buildAllCommands({ includeCms: false });
    const withCms = buildAllCommands({ includeCms: true });
    const names = commandNames(withCms);

    expect(withCms.length).toBe(withoutCms.length + 5);
    expect(names).toContain("cms-member");
    expect(names).toContain("cms-operation");
    expect(names).toContain("cms-event");
    expect(names).toContain("cms-i18n");
    expect(names).toContain("cms-content");
  });
});
