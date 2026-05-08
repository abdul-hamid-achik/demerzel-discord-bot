import { describe, expect, mock, test } from "bun:test";
import type OpenAI from "openai";
import { DemerzelChat } from "./chat.js";

function fakeOpenAI(content: string) {
  const create = mock(async (_request: Record<string, unknown>) => ({
    choices: [{ message: { content } }],
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

describe("DemerzelChat", () => {
  test("sends the configured model to OpenAI chat completions", async () => {
    const { client, create } = fakeOpenAI("pong");
    const chat = new DemerzelChat({
      client,
      model: "gpt-test-chat-model",
    });

    const result = await chat.respond({
      userMessage: "ping",
      authorTag: "tester",
    });

    const request = create.mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(result.reply).toBe("pong");
    expect(request?.model).toBe("gpt-test-chat-model");
    expect(request).not.toHaveProperty("temperature");
  });
});
