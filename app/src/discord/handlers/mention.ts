import type { Message } from "discord.js";
import { demerzelChat } from "../../ai/chat.js";
import { logger } from "../../logger.js";
import {
  chunkDiscordText,
  NO_MENTIONS,
  NO_REPLY_MENTIONS,
} from "../messages.js";

/**
 * Returns true if the message is addressed at us — either an @-mention of the
 * bot user, or a reply to one of the bot's previous messages.
 */
export async function isAddressedToBot(message: Message): Promise<boolean> {
  const me = message.client.user;
  if (!me) return false;
  if (message.author.id === me.id) return false;
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
      .catch((err) => logger.warn({ err }, "bare-mention reply failed"));
    return;
  }

  const repliedTo = await fetchRepliedTo(message);

  // Show typing while we think — gives the user a visible signal.
  if ("sendTyping" in message.channel) {
    await message.channel.sendTyping().catch(() => undefined);
  }

  try {
    const result = await demerzelChat().respond({
      userMessage: cleaned,
      authorTag: message.author.tag,
      repliedToText: repliedTo?.text,
      repliedToAuthorTag: repliedTo?.authorTag,
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
    for (const part of parts) {
      if (first) {
        await message.reply({
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
  } catch (err) {
    logger.error({ err, messageId: message.id }, "demerzel chat failed");
    await message
      .reply({
        content: "I couldn't answer that just now — try again in a moment.",
        allowedMentions: NO_REPLY_MENTIONS,
      })
      .catch(() => undefined);
  }
}
