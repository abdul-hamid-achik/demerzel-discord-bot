import { hashText, readCache, writeCache } from "./cache.js";
import { detectLanguage } from "./language-detect.js";
import { getProvider } from "./providers/index.js";

export interface TranslateRequest {
  text: string;
  targetLanguage: string;
  sourceLanguage?: string;
}

export interface TranslateResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  cached: boolean;
}

export class TranslationOrchestrator {
  async translate(req: TranslateRequest): Promise<TranslateResult> {
    const text = req.text.trim();
    if (!text) {
      return {
        translatedText: "",
        sourceLanguage: req.sourceLanguage ?? "und",
        targetLanguage: req.targetLanguage,
        provider: "noop",
        cached: false,
      };
    }

    const sourceLanguage = req.sourceLanguage ?? (await detectLanguage(text));

    if (sourceLanguage && sourceLanguage === req.targetLanguage) {
      return {
        translatedText: text,
        sourceLanguage,
        targetLanguage: req.targetLanguage,
        provider: "noop",
        cached: false,
      };
    }

    const hash = hashText(text);
    const hit = await readCache(hash, sourceLanguage, req.targetLanguage);
    if (hit) {
      return {
        translatedText: hit,
        sourceLanguage,
        targetLanguage: req.targetLanguage,
        provider: "cache",
        cached: true,
      };
    }

    const provider = getProvider();
    const result = await provider.translate({
      text,
      sourceLanguage: sourceLanguage === "und" ? undefined : sourceLanguage,
      targetLanguage: req.targetLanguage,
    });

    const finalSource =
      result.detectedSourceLanguage?.toLowerCase() ?? sourceLanguage;

    await writeCache({
      originalHash: hash,
      sourceLanguage: finalSource,
      targetLanguage: req.targetLanguage,
      translatedText: result.translatedText,
      provider: result.provider,
    });

    return {
      translatedText: result.translatedText,
      sourceLanguage: finalSource,
      targetLanguage: req.targetLanguage,
      provider: result.provider,
      cached: false,
    };
  }
}

export const translator = new TranslationOrchestrator();
