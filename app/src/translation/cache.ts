import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { translationCache } from "../db/schema.js";

export { hashText } from "./hash.js";

export async function readCache(
  originalHash: string,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string | null> {
  const rows = await db
    .select({ translatedText: translationCache.translatedText })
    .from(translationCache)
    .where(
      and(
        eq(translationCache.originalHash, originalHash),
        eq(translationCache.sourceLanguage, sourceLanguage),
        eq(translationCache.targetLanguage, targetLanguage),
      ),
    )
    .limit(1);
  return rows[0]?.translatedText ?? null;
}

export async function writeCache(args: {
  originalHash: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  provider: string;
}): Promise<void> {
  await db
    .insert(translationCache)
    .values(args)
    .onConflictDoNothing({
      target: [
        translationCache.originalHash,
        translationCache.sourceLanguage,
        translationCache.targetLanguage,
      ],
    });
}
