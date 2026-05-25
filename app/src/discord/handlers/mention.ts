import { ChannelType, type Message } from "discord.js";
import { demerzelChat } from "../../ai/chat.js";
import { agent, autoTranslateDeliveryForChannelType } from "../../agent/agent.js";
import { logger } from "../../logger.js";
import { detectLanguage } from "../../translation/language-detect.js";
import {
  DEFAULT_TARGET_LANGUAGES,
  type SupportedLanguage,
} from "../../translation/lang-util.js";
import { translator } from "../../translation/orchestrator.js";
import {
  chunkDiscordText,
  type DiscordChunkTarget,
  discordErrorDetails,
  isDiscordChunkTarget,
  NO_MENTIONS,
  NO_REPLY_MENTIONS,
  sendDiscordChunks,
} from "../messages.js";

const DEMERZEL_THREAD_PREFIX = "Demerzel";
const CONVERSATION_THREAD_HINT =
  "Reply here to keep chatting with Demerzel. She can continue reminders, translations, and channel settings in this thread.";
const CHAT_TRANSLATIONS_HEADER = "Other languages:";

export function isDemerzelConversationThread(
  channel: { type: ChannelType; ownerId?: string | null; name?: string | null },
  botId: string,
): boolean {
  if (channel.ownerId !== botId) return false;
  if (!channel.name?.startsWith(DEMERZEL_THREAD_PREFIX)) return false;
  return autoTranslateDeliveryForChannelType(channel.type) === "reply-in-thread";
}

export function chatReplyTranslationTargets(
  sourceLanguage: string,
  targets: readonly string[] = DEFAULT_TARGET_LANGUAGES,
): string[] {
  return targets.filter((target) => target && target !== sourceLanguage);
}

/**
 * Returns true if the message is addressed at us — either an @-mention of the
 * bot user, a reply to one of the bot's previous messages, or any message in
 * a Demerzel-owned conversation thread.
 */
export async function isAddressedToBot(message: Message): Promise<boolean> {
  const me = message.client.user;
  if (!me) return false;
  if (message.author.id === me.id) return false;
  if (isDemerzelConversationThread(message.channel, me.id)) return true;
  if (message.mentions.users.has(me.id)) return true;
  if (message.mentions.repliedUser?.id === me.id) return true;
  if (message.reference?.messageId) {
    try {
      const ref = await message.channel.messages.fetch(
        message.reference.messageId,
      );
      if (ref.author.id === me.id) return true;
    } catch {
      // Reply target deleted or inaccessible — treat as not-addressed.
    }
  }
  return false;
}

function stripBotMention(content: string, botId: string): string {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").trim();
}

function conversationThreadName(username: string): string {
  return `${DEMERZEL_THREAD_PREFIX} · ${username}`.slice(0, 90);
}

function isConversationMetaMessage(content: string): boolean {
  const trimmed = content.trim();
  return (
    trimmed === CONVERSATION_THREAD_HINT ||
    trimmed.startsWith(CHAT_TRANSLATIONS_HEADER)
  );
}

async function fetchRepliedTo(
  message: Message,
): Promise<{ text: string; authorTag: string } | null> {
  if (!message.reference?.messageId) return null;
  try {
    const ref = await message.channel.messages.fetch(
      message.reference.messageId,
    );
    if (!ref.content) return null;
    return { text: ref.content, authorTag: ref.author.tag };
  } catch {
    return null;
  }
}

async function fetchRecentConversationContext(
  message: Message,
  botId: string,
): Promise<Array<{ authorTag: string; text: string }>> {
  if (!isDemerzelConversationThread(message.channel, botId)) return [];
  if (!("messages" in message.channel)) return [];

  try {
    const fetched = await message.channel.messages.fetch({ limit: 10 });
    return Array.from(fetched.values())
      .filter((item) => item.id !== message.id && Boolean(item.content?.trim()))
      .filter((item) => !isConversationMetaMessage(item.content))
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .slice(-6)
      .map((item) => ({
        authorTag: item.author.tag,
        text: stripBotMention(item.content, botId),
      }));
  } catch (err) {
    logger.debug(
      {
        err,
        messageId: message.id,
        channelId: message.channelId,
      },
      "demerzel thread context fetch failed",
    );
    return [];
  }
}

async function resolveChatTranslationTarget(args: {
  requestMessage: Message;
  replyMessage: Message;
  botId: string;
}): Promise<{ target: DiscordChunkTarget; newThread: boolean } | null> {
  if (
    autoTranslateDeliveryForChannelType(args.requestMessage.channel.type) ===
      "reply-in-thread" &&
    isDiscordChunkTarget(args.requestMessage.channel)
  ) {
    return { target: args.requestMessage.channel, newThread: false };
  }

  if (
    args.replyMessage.channel.type !== ChannelType.GuildText &&
    args.replyMessage.channel.type !== ChannelType.GuildAnnouncement
  ) {
    return null;
  }

  try {
    const thread = await args.replyMessage.startThread({
      name: conversationThreadName(args.requestMessage.author.username),
      autoArchiveDuration: 1440,
    });
    await thread.send({
      content: CONVERSATION_THREAD_HINT,
      allowedMentions: NO_MENTIONS,
    });
    return { target: thread, newThread: true };
  } catch (err) {
    logger.warn(
      {
        err,
        discord: discordErrorDetails(err),
        messageId: args.replyMessage.id,
        channelId: args.replyMessage.channelId,
      },
      "demerzel conversation thread create failed",
    );
    return null;
  }
}

async function postChatReplyTranslations(args: {
  target: DiscordChunkTarget;
  replyText: string;
  sourceLanguage: string;
  messageId: string;
  channelId: string;
}): Promise<void> {
  const targets = chatReplyTranslationTargets(args.sourceLanguage);
  if (targets.length === 0 || !args.replyText.trim()) return;

  const results = await Promise.allSettled(
    targets.map((language) =>
      translator.translate({
        text: args.replyText,
        sourceLanguage:
          args.sourceLanguage === "und" ? undefined : args.sourceLanguage,
        targetLanguage: language,
      }),
    ),
  );

  const lines: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const language = targets[i] as SupportedLanguage;
    const result = results[i]!;
    if (result.status === "rejected") {
      logger.warn(
        {
          err: result.reason,
          messageId: args.messageId,
          channelId: args.channelId,
          language,
        },
        "demerzel reply translation failed",
      );
      continue;
    }
    if (!result.value.translatedText.trim()) continue;
    lines.push(`${agent.flag(language)} ${result.value.translatedText}`);
  }

  if (lines.length === 0) return;
  await sendDiscordChunks(
    args.target,
    `${CHAT_TRANSLATIONS_HEADER}\n${lines.join("\n")}`,
    {
      operation: "demerzel-reply-translations",
      messageId: args.messageId,
      channelId: args.channelId,
    },
  );
}

export async function handleMention(message: Message): Promise<void> {
  const me = message.client.user;
  if (!me) return;

  const cleaned = stripBotMention(message.content ?? "", me.id);
  if (!cleaned) {
    // Pure bare-mention with no question — give a brief hello rather than
    // running it through the LLM.
    await message
      .reply({
        content:
          "Hey! Ask me anything, or reply to a message asking me to translate.",
        allowedMentions: NO_REPLY_MENTIONS,
      })
      .catch((err) =>
        logger.warn(
          {
            err,
            discord: discordErrorDetails(err),
            messageId: message.id,
            channelId: message.channelId,
          },
          "bare-mention reply failed",
        ),
      );
    return;
  }

  const [repliedTo, responseLanguage, conversationContext] = await Promise.all([
    fetchRepliedTo(message),
    detectLanguage(cleaned).catch(() => "und"),
    fetchRecentConversationContext(message, me.id),
  ]);

  // Show typing while we think — gives the user a visible signal.
  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping().catch(() => undefined);
  }

  try {
    logger.info(
      {
        messageId: message.id,
        channelId: message.channelId,
        authorId: message.author.id,
        contentLen: cleaned.length,
      },
      "demerzel chat request started",
    );

    const result = await demerzelChat().respond({
      userMessage: cleaned,
      authorTag: message.author.tag,
      repliedToText: repliedTo?.text,
      repliedToAuthorTag: repliedTo?.authorTag,
      responseLanguage,
      conversationContext,
      triggerMessage: message,
    });

    logger.info(
      {
        messageId: message.id,
        authorId: message.author.id,
        toolCalls: result.toolCallsUsed,
        replyLen: result.reply.length,
      },
      "demerzel chat replied",
    );

    const parts = chunkDiscordText(result.reply);
    let first = true;
    let firstReply: Message | null = null;
    try {
      for (const part of parts) {
        if (first) {
          firstReply = await message.reply({
            content: part,
            allowedMentions: NO_REPLY_MENTIONS,
          });
          first = false;
        } else if ("send" in message.channel) {
          await message.channel.send({
            content: part,
            allowedMentions: NO_MENTIONS,
          });
        }
      }

      if (firstReply) {
        const target = await resolveChatTranslationTarget({
          requestMessage: message,
          replyMessage: firstReply,
          botId: me.id,
        });
        if (target) {
          await postChatReplyTranslations({
            target: target.target,
            replyText: result.reply,
            sourceLanguage: responseLanguage,
            messageId: firstReply.id,
            channelId: firstReply.channelId,
          });
        }
      }
    } catch (err) {
      logger.error(
        {
          err,
          discord: discordErrorDetails(err),
          messageId: message.id,
          channelId: message.channelId,
          partCount: parts.length,
        },
        "demerzel chat response send failed",
      );
      throw err;
    }
  } catch (err) {
    logger.error({ err, messageId: message.id }, "demerzel chat failed");
    await message
      .reply({
        content: "I couldn't answer that just now — try again in a moment.",
        allowedMentions: NO_REPLY_MENTIONS,
      })
      .catch((replyErr) =>
        logger.warn(
          {
            err: replyErr,
            discord: discordErrorDetails(replyErr),
            messageId: message.id,
            channelId: message.channelId,
          },
          "demerzel chat fallback reply failed",
        ),
      );
  }
}
