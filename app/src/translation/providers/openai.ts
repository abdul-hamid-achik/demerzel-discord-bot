import OpenAI from "openai";
import { config } from "../../config.js";
import type { TranslateInput, TranslateOutput, TranslationProvider } from "./index.js";

export class OpenAIProvider implements TranslationProvider {
  readonly name = "openai";
  private client: OpenAI;
  private model = "gpt-4o-mini";

  constructor() {
    if (!config.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required when TRANSLATION_PROVIDER=openai");
    }
    this.client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }

  async translate(input: TranslateInput): Promise<TranslateOutput> {
    const system = [
      "You are a precise translator for a gaming Discord community.",
      "Preserve tone, slang, and gamer terminology. Keep mentions, emojis, channel refs intact.",
      "Output ONLY the translation — no quotes, no commentary, no language labels.",
    ].join(" ");

    const user = input.sourceLanguage
      ? `Translate from ${input.sourceLanguage} to ${input.targetLanguage}:\n\n${input.text}`
      : `Translate to ${input.targetLanguage}:\n\n${input.text}`;

    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const translatedText = completion.choices[0]?.message?.content?.trim() ?? "";
    return {
      translatedText,
      detectedSourceLanguage: input.sourceLanguage,
      provider: this.name,
    };
  }

  async detectLanguage(text: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Identify the language of the text. Respond with only the ISO 639-1 code (e.g. en, es, it, pt). If uncertain, reply 'und'.",
        },
        { role: "user", content: text },
      ],
    });
    const code = completion.choices[0]?.message?.content?.trim().toLowerCase() ?? "und";
    return code.slice(0, 3);
  }
}
