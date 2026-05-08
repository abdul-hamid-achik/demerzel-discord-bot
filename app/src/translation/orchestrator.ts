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
  private inFlight = new Map<string, Promise<TranslateResult>>();

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

    const inFlightKey = `${hash}:${sourceLanguage}:${req.targetLanguage}`;
    const existing = this.inFlight.get(inFlightKey);
    if (existing) return existing;

    const work = this.translateUncached({
      text,
      hash,
      sourceLanguage,
      targetLanguage: req.targetLanguage,
    }).finally(() => {
      this.inFlight.delete(inFlightKey);
    });
    this.inFlight.set(inFlightKey, work);
    return work;
  }

  private async translateUncached(args: {
    text: string;
    hash: string;
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<TranslateResult> {
    const provider = getProvider();
    const result = await provider.translate({
      text: args.text,
      sourceLanguage:
        args.sourceLanguage === "und" ? undefined : args.sourceLanguage,
      targetLanguage: args.targetLanguage,
    });

    const finalSource =
      result.detectedSourceLanguage?.toLowerCase() ?? args.sourceLanguage;

    await writeCache({
      originalHash: args.hash,
      sourceLanguage: finalSource,
      targetLanguage: args.targetLanguage,
      translatedText: result.translatedText,
      provider: result.provider,
    });

    if (args.sourceLanguage !== finalSource) {
      await writeCache({
        originalHash: args.hash,
        sourceLanguage: args.sourceLanguage,
        targetLanguage: args.targetLanguage,
        translatedText: result.translatedText,
        provider: result.provider,
      });
    }

    return {
      translatedText: result.translatedText,
      sourceLanguage: finalSource,
      targetLanguage: args.targetLanguage,
      provider: result.provider,
      cached: false,
    };
  }
}

export const translator = new TranslationOrchestrator();
