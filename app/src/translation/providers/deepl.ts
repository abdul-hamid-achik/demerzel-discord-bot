import { config } from "../../config.js";
import type { TranslateInput, TranslateOutput, TranslationProvider } from "./index.js";

const ENDPOINT = "https://api-free.deepl.com/v2/translate";

export class DeepLProvider implements TranslationProvider {
  readonly name = "deepl";

  constructor() {
    if (!config.DEEPL_API_KEY) {
      throw new Error("DEEPL_API_KEY is required when TRANSLATION_PROVIDER=deepl");
    }
  }

  async translate(input: TranslateInput): Promise<TranslateOutput> {
    const params = new URLSearchParams();
    params.append("text", input.text);
    params.append("target_lang", input.targetLanguage.toUpperCase());
    if (input.sourceLanguage) {
      params.append("source_lang", input.sourceLanguage.toUpperCase());
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${config.DEEPL_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    if (!res.ok) {
      throw new Error(`DeepL translate failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      translations: { detected_source_language?: string; text: string }[];
    };
    const first = data.translations[0];
    if (!first) throw new Error("DeepL returned no translations");
    return {
      translatedText: first.text,
      detectedSourceLanguage: first.detected_source_language?.toLowerCase(),
      provider: this.name,
    };
  }
}
