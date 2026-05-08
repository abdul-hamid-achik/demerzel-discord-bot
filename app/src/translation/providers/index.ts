import { config } from "../../config.js";
import { DeepLProvider } from "./deepl.js";
import { GoogleProvider } from "./google.js";
import { OpenAIProvider } from "./openai.js";

export interface TranslateInput {
  text: string;
  sourceLanguage?: string;
  targetLanguage: string;
}

export interface TranslateOutput {
  translatedText: string;
  detectedSourceLanguage?: string;
  provider: string;
}

export interface TranslationProvider {
  readonly name: string;
  translate(input: TranslateInput): Promise<TranslateOutput>;
  detectLanguage?(text: string): Promise<string>;
}

let cached: TranslationProvider | undefined;

export function getProvider(): TranslationProvider {
  if (cached) return cached;
  switch (config.TRANSLATION_PROVIDER) {
    case "openai":
      cached = new OpenAIProvider();
      break;
    case "deepl":
      cached = new DeepLProvider();
      break;
    case "google":
      cached = new GoogleProvider();
      break;
  }
  return cached;
}
