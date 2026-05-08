import { describe, expect, mock, test } from "bun:test";
import type OpenAI from "openai";
import { OpenAIProvider } from "./openai.js";

function fakeOpenAI(contents: string[]) {
  const create = mock(async (_request: Record<string, unknown>) => ({
    choices: [{ message: { content: contents.shift() ?? "" } }],
  }));

  return {
    client: {
      chat: {
        completions: { create },
      },
    } as unknown as OpenAI,
    create,
  };
}

describe("OpenAIProvider", () => {
  test("sends the configured model for translation and language detection", async () => {
    const { client, create } = fakeOpenAI(["hola", "es"]);
    const provider = new OpenAIProvider({
      client,
      model: "gpt-test-translation-model",
    });

    const translated = await provider.translate({
      text: "hello",
      targetLanguage: "es",
    });
    const detected = await provider.detectLanguage("hola");

    expect(translated.translatedText).toBe("hola");
    expect(detected).toBe("es");
    expect(create).toHaveBeenCalledTimes(2);

    for (const call of create.mock.calls) {
      const request = call[0] as Record<string, unknown>;
      expect(request.model).toBe("gpt-test-translation-model");
      expect(request).not.toHaveProperty("temperature");
    }
  });
});
