import { config } from "../../config.js";
import { logger } from "../../logger.js";

export interface TavilySearchInput {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResponse {
  answer: string | null;
  results: TavilySearchResult[];
}

export class TavilyError extends Error {}

export async function tavilySearch(
  input: TavilySearchInput,
): Promise<TavilySearchResponse> {
  if (!config.TAVILY_API_KEY) {
    throw new TavilyError("TAVILY_API_KEY is not set");
  }

  const body = {
    query: input.query,
    max_results: input.maxResults ?? 5,
    search_depth: input.searchDepth ?? "basic",
    include_answer: true,
  };

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.TAVILY_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ status: res.status, body: text }, "tavily search failed");
    throw new TavilyError(`tavily ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as {
    answer?: string | null;
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      score?: number;
    }>;
  };

  return {
    answer: data.answer ?? null,
    results: (data.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
      score: r.score,
    })),
  };
}
