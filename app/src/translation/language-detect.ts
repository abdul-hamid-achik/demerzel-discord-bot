import { getProvider } from "./providers/index.js";

const SUPPORTED = ["en", "es", "it", "pt", "fr", "de", "ru", "ja", "zh"] as const;

// Cheap heuristic for very short strings; fall back to provider detection otherwise.
const HINTS: Array<[RegExp, string]> = [
  [/\b(the|and|you|are|with|that)\b/i, "en"],
  [/\b(que|para|con|los|las|esto|hola)\b/i, "es"],
  [/\b(che|sono|della|delle|grazie|ciao|andiamo|ragazzi)\b/i, "it"],
  [/\b(que|para|com|você|obrigado|galera)\b/i, "pt"],
];

export async function detectLanguage(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "und";

  if (trimmed.length < 40) {
    for (const [pattern, code] of HINTS) {
      if (pattern.test(trimmed)) return code;
    }
  }

  const provider = getProvider();
  if (provider.detectLanguage) {
    try {
      const code = await provider.detectLanguage(trimmed);
      return SUPPORTED.includes(code as (typeof SUPPORTED)[number]) ? code : code || "und";
    } catch {
      return "und";
    }
  }
  return "und";
}
