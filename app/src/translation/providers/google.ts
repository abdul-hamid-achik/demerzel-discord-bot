import { config } from "../../config.js";
import type { TranslateInput, TranslateOutput, TranslationProvider } from "./index.js";

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

export class GoogleProvider implements TranslationProvider {
  readonly name = "google";

  constructor() {
    if (!config.GOOGLE_TRANSLATE_API_KEY) {
      throw new Error(
        "GOOGLE_TRANSLATE_API_KEY is required when TRANSLATION_PROVIDER=google",
      );
    }
  }

  async translate(input: TranslateInput): Promise<TranslateOutput> {
    const url = `${ENDPOINT}?key=${config.GOOGLE_TRANSLATE_API_KEY}`;
    const body: Record<string, string> = {
      q: input.text,
      target: input.targetLanguage,
      format: "text",
    };
    if (input.sourceLanguage) body.source = input.sourceLanguage;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Google translate failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      data: {
        translations: { translatedText: string; detectedSourceLanguage?: string }[];
      };
    };
    const first = data.data.translations[0];
    if (!first) throw new Error("Google returned no translations");
    return {
      translatedText: first.translatedText,
      detectedSourceLanguage: first.detectedSourceLanguage,
      provider: this.name,
    };
  }

  async detectLanguage(text: string): Promise<string> {
    const url = `https://translation.googleapis.com/language/translate/v2/detect?key=${config.GOOGLE_TRANSLATE_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text }),
    });
    if (!res.ok) throw new Error(`Google detect failed: ${res.status}`);
    const data = (await res.json()) as {
      data: { detections: { language: string }[][] };
    };
    return data.data.detections[0]?.[0]?.language ?? "und";
  }
}
