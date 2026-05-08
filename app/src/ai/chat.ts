import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { PermissionFlagsBits, type Message } from "discord.js";
import { agent } from "../agent/agent.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import {
  reminderEngine,
  shortReminderId,
  type ReminderDeliveryTarget,
} from "../reminders/engine.js";
import {
  formatReminderTime,
  isFutureReminderTime,
  parseReminderTime,
} from "../reminders/time.js";
import { tavilySearch } from "./tools/tavily.js";

const MAX_TOOL_ITERATIONS = 4;

const SYSTEM_PROMPT = [
  "You are Demerzel, the Discord assistant for the StarWarrior community.",
  "Be concise (keep replies under ~1500 chars) and friendly. Match the language the user wrote in.",
  "Call tavily_search when a question needs current information from the web (news, prices, recent events, sports, patches, releases).",
  "Call archive_translations when the user asks to archive, clear, clean up, or hide the translation threads/messages in their channel.",
  "Call create_reminder when the user asks you to remind them or a channel later. Search first if the reminder depends on a public event date or current information.",
  "If the question is purely conversational or about something you already know, just answer — don't search needlessly.",
  "Cite sources inline as plain URLs when you used tavily_search results.",
].join(" ");

function systemPrompt(): string {
  return [
    SYSTEM_PROMPT,
    `Current date/time: ${new Date().toISOString()}.`,
    "For create_reminder, always pass a future ISO 8601 timestamp with a timezone or Z suffix.",
    "Channel reminders are visible to the current channel; private reminders are sent by DM.",
  ].join("\n");
}

const SEARCH_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "tavily_search",
    description:
      "Search the live web via Tavily. Use for fresh info: news, recent events, prices, weather, patch notes, or anything that may have changed since your training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query in natural language.",
        },
        max_results: {
          type: "integer",
          description: "How many results to retrieve (1-10).",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["query"],
    },
  },
};

const ARCHIVE_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "archive_translations",
    description:
      "Archive bot-owned translation threads in the current channel — they leave the channel sidebar but message history is preserved. By default keeps threads that have human replies; set force=true to archive those as well.",
    parameters: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "If true, also archive threads that have replies.",
        },
      },
    },
  },
};

const CREATE_REMINDER_TOOL: ChatCompletionTool = {
  type: "function",
  function: {
    name: "create_reminder",
    description:
      "Schedule a one-time reminder. Use after tavily_search when the user asks to be reminded about an event whose date/time needs live lookup.",
    parameters: {
      type: "object",
      properties: {
        remind_at_iso: {
          type: "string",
          description:
            "Future ISO 8601 date-time with timezone or Z suffix, e.g. 2026-05-09T18:00:00-06:00.",
        },
        message: {
          type: "string",
          description:
            "Reminder body to send. Include the event name, useful context, and any source URL if relevant.",
        },
        delivery: {
          type: "string",
          enum: ["dm", "channel"],
          description:
            "dm sends privately to the requester; channel sends in the current channel.",
        },
        link: {
          type: "string",
          description: "Optional source URL or event URL.",
        },
      },
      required: ["remind_at_iso", "message", "delivery"],
    },
  },
};

export interface ChatRequest {
  userMessage: string;
  authorTag: string;
  repliedToText?: string;
  repliedToAuthorTag?: string;
  /** Discord message used for tool calls that need channel context. */
  triggerMessage?: Message;
}

export interface ChatResult {
  reply: string;
  toolCallsUsed: number;
}

interface DemerzelChatOptions {
  client?: OpenAI;
  model?: string;
}

export class DemerzelChat {
  private client: OpenAI;
  private model: string;

  constructor(options: DemerzelChatOptions = {}) {
    if (!options.client && !config.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for Demerzel chat");
    }
    this.client =
      options.client ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.model = options.model ?? config.OPENAI_CHAT_MODEL;
  }

  async respond(req: ChatRequest): Promise<ChatResult> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt() },
    ];

    if (req.repliedToText) {
      messages.push({
        role: "user",
        content: `[context — ${req.repliedToAuthorTag ?? "earlier message"}]: ${req.repliedToText}`,
      });
    }

    messages.push({
      role: "user",
      content: `[${req.authorTag}]: ${req.userMessage}`,
    });

    let toolCallsUsed = 0;

    // Tool-calling loop. Bounded to avoid runaway iterations on a confused model.
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const tools: ChatCompletionTool[] = [];
      if (config.TAVILY_API_KEY) tools.push(SEARCH_TOOL);
      if (req.triggerMessage) tools.push(ARCHIVE_TOOL);
      if (req.triggerMessage) tools.push(CREATE_REMINDER_TOOL);

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
      });

      const choice = completion.choices[0];
      if (!choice) throw new Error("openai returned no choices");
      const msg = choice.message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return {
          reply: (msg.content ?? "").trim() || "…",
          toolCallsUsed,
        };
      }

      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      });

      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        toolCallsUsed++;
        const toolResult = await this.runTool(
          call.function.name,
          call.function.arguments,
          req,
        );
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: toolResult,
        });
      }
    }

    logger.warn({ toolCallsUsed }, "demerzel chat hit max tool iterations");
    return {
      reply: "I had trouble finishing that — try rephrasing?",
      toolCallsUsed,
    };
  }

  private async runTool(
    name: string,
    rawArgs: string,
    req: ChatRequest,
  ): Promise<string> {
    let args: Record<string, unknown> = {};
    try {
      args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
    } catch (err) {
      logger.warn({ err, name, rawArgs }, "tool args JSON parse failed");
      return JSON.stringify({ error: "could not parse tool arguments" });
    }

    if (name === "tavily_search") {
      const query = typeof args.query === "string" ? args.query : "";
      const maxResults =
        typeof args.max_results === "number" ? args.max_results : 5;
      if (!query) return JSON.stringify({ error: "query is required" });
      try {
        const res = await tavilySearch({ query, maxResults });
        // Trim the payload — the model doesn't need full content, snippets are enough.
        return JSON.stringify({
          answer: res.answer,
          results: res.results.slice(0, maxResults).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.content.slice(0, 400),
          })),
        });
      } catch (err) {
        logger.warn({ err, query }, "tavily_search tool failed");
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    if (name === "archive_translations") {
      if (!req.triggerMessage) {
        return JSON.stringify({ error: "no channel context for archive" });
      }
      if (
        !req.triggerMessage.member?.permissions.has(
          PermissionFlagsBits.ManageChannels,
        )
      ) {
        return JSON.stringify({
          error: "user needs Manage Channels to archive translation threads",
        });
      }
      const force = args.force === true;
      try {
        const { archived, kept } = await agent.archiveBotThreadsInChannel(
          req.triggerMessage.channel,
          { force },
        );
        return JSON.stringify({ archived, kept, force });
      } catch (err) {
        logger.warn({ err }, "archive_translations tool failed");
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    if (name === "create_reminder") {
      if (!req.triggerMessage) {
        return JSON.stringify({ error: "no message context for reminder" });
      }

      const remindAtRaw =
        typeof args.remind_at_iso === "string" ? args.remind_at_iso : "";
      const message =
        typeof args.message === "string" ? args.message.trim() : "";
      const delivery: ReminderDeliveryTarget =
        args.delivery === "channel" ? "channel" : "dm";
      const link =
        typeof args.link === "string" && args.link.trim()
          ? args.link.trim()
          : null;

      const remindAt = parseReminderTime(remindAtRaw);
      if (!remindAt || !isFutureReminderTime(remindAt)) {
        return JSON.stringify({
          error: "remind_at_iso must be a valid future date-time",
        });
      }
      if (!message) return JSON.stringify({ error: "message is required" });
      if (delivery === "channel" && !req.triggerMessage.inGuild()) {
        return JSON.stringify({
          error: "channel reminders require a server channel",
        });
      }

      try {
        const reminder = await reminderEngine.create({
          creatorId: req.triggerMessage.author.id,
          guildId: req.triggerMessage.guildId,
          channelId:
            delivery === "channel" ? req.triggerMessage.channelId : null,
          deliveryTarget: delivery,
          remindAt,
          message,
          link,
        });
        return JSON.stringify({
          scheduled: true,
          id: shortReminderId(reminder.id),
          remind_at: reminder.remindAt.toISOString(),
          remind_at_display: formatReminderTime(reminder.remindAt),
          delivery,
        });
      } catch (err) {
        logger.warn({ err }, "create_reminder tool failed");
        return JSON.stringify({ error: (err as Error).message });
      }
    }

    return JSON.stringify({ error: `unknown tool: ${name}` });
  }
}

let _instance: DemerzelChat | null = null;
export function demerzelChat(): DemerzelChat {
  if (!_instance) _instance = new DemerzelChat();
  return _instance;
}
