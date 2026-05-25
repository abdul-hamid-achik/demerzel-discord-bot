import { describe, expect, test } from "bun:test";
import { buildAllCommands } from "./commands.js";
import {
  DEFAULT_TARGET_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
} from "../translation/lang-util.js";

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

  test("language choices include every supported language", () => {
    const commands = buildAllCommands({ includeCms: false }) as Array<{
      name: string;
      options?: Array<{
        name: string;
        options?: Array<{
          name: string;
          choices?: Array<{ name: string; value: string }>;
        }>;
      }>;
    }>;
    const language = commands.find((command) => command.name === "language");
    const setSubcommand = language?.options?.find(
      (option) => option.name === "set",
    );
    const codeOption = setSubcommand?.options?.find(
      (option) => option.name === "code",
    );

    expect(codeOption?.choices?.map((choice) => choice.value)).toEqual([
      ...SUPPORTED_LANGUAGES,
    ]);
    expect(
      codeOption?.choices?.find((choice) => choice.value === "pt")?.name,
    ).toContain("Brasil");
  });

  test("translation command descriptions show the full default language list", () => {
    const commands = buildAllCommands({ includeCms: false }) as Array<{
      name: string;
      options?: Array<{
        name: string;
        options?: Array<{ name: string; description?: string }>;
        description?: string;
      }>;
    }>;
    const translateThread = commands.find(
      (command) => command.name === "translate-thread",
    );
    const translateThreadLanguages = translateThread?.options?.find(
      (option) => option.name === "languages",
    );
    const autoTranslate = commands.find(
      (command) => command.name === "auto-translate",
    );
    const enable = autoTranslate?.options?.find(
      (option) => option.name === "enable",
    );
    const reset = autoTranslate?.options?.find(
      (option) => option.name === "reset",
    );
    const languages = enable?.options?.find(
      (option) => option.name === "languages",
    );

    expect(translateThreadLanguages?.description).toContain(
      DEFAULT_TARGET_LANGUAGE_CODES,
    );
    expect(languages?.description).toContain(DEFAULT_TARGET_LANGUAGE_CODES);
    expect(reset?.description).toContain("default");
  });
});
