import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'silent' });

function deepCopy(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Extracts and unsets viewOnce flag from a WhatsApp message object.
 * Handles:
 *  - viewOnceMessage / viewOnceMessageV2 / viewOnceMessageV2Extension
 *  - nested wrapper messages (ephemeralMessage, documentWithCaptionMessage)
 *  - media objects (imageMessage, videoMessage, audioMessage, documentMessage) where viewOnce flag is directly on the media
 *
 * @param {object} message
 * @returns {object|null}
 */
export function extractViewOnce(message) {
  if (!message) return null;
  message = deepCopy(message);

  let msgContent = message.message || message;

  // 1. Unwrap nested outer wrappers like ephemeralMessage, documentWithCaptionMessage
  for (let i = 0; i < 5; i++) {
    if (msgContent?.ephemeralMessage?.message) {
      msgContent = msgContent.ephemeralMessage.message;
    } else if (msgContent?.documentWithCaptionMessage?.message) {
      msgContent = msgContent.documentWithCaptionMessage.message;
    } else {
      break;
    }
  }

  // 2. Check for explicit viewOnce containers
  const viewOnce =
    msgContent?.viewOnceMessage ||
    msgContent?.viewOnceMessageV2 ||
    msgContent?.viewOnceMessageV2Extension;

  if (viewOnce?.message) {
    for (const key in viewOnce.message) {
      const data = viewOnce.message[key];
      if (data && typeof data === 'object' && data.viewOnce) {
        data.viewOnce = false;
      }
    }
    message.message = viewOnce.message;
    return message;
  }

  // 3. Check if the media itself is inside msgContent with viewOnce: true
  const mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
  for (const key of mediaKeys) {
    if (msgContent?.[key]) {
      const media = msgContent[key];
      if (media.viewOnce) {
        media.viewOnce = false;
        message.message = { [key]: media };
        return message;
      }
    }
  }

  return null;
}

/**
 * .give — Extract view-once media/message and send the extracted content back into the chat.
 */
export async function handleGive(sock, msg) {
  const jid = msg.key.remoteJid;
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;

  if (!contextInfo?.quotedMessage) {
    await sock.sendMessage(
      jid,
      { text: '❌ Please *reply to a view-once message* with `.give`.' },
      { quoted: msg }
    );
    return;
  }

  const quotedMsg = {
    key: {
      remoteJid: jid,
      id: contextInfo.stanzaId,
      fromMe: contextInfo.participant === sock.user?.id,
      participant: contextInfo.participant,
    },
    message: contextInfo.quotedMessage,
  };

  const extracted = extractViewOnce(quotedMsg);
  if (!extracted || !extracted.message) {
    await sock.sendMessage(
      jid,
      { text: '❌ That quoted message is *not a view-once message*.' },
      { quoted: msg }
    );
    return;
  }

  // React to acknowledge request
  await sock.sendMessage(jid, { react: { text: '🔓', key: msg.key } }).catch(() => {});

  // Try relaying the unwrapped message directly
  let relaySuccess = false;
  try {
    if (typeof sock.relayMessage === 'function') {
      await sock.relayMessage(jid, extracted.message, {});
      relaySuccess = true;
    }
  } catch (err) {
    console.warn('[give] relayMessage failed, falling back to download & send:', err.message);
  }

  if (relaySuccess) return;

  // Fallback: download the media buffer and re-send as regular media
  try {
    const unwrappedMsg = {
      key: quotedMsg.key,
      message: extracted.message,
    };

    const mediaType = getContentType(unwrappedMsg.message);
    const mediaContent = unwrappedMsg.message?.[mediaType];
    const caption = mediaContent?.caption || '';

    if (mediaType === 'imageMessage') {
      const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, { logger });
      await sock.sendMessage(
        jid,
        { image: buffer, caption: caption ? `🔓 ${caption}` : '🔓 Extracted view-once image' },
        { quoted: msg }
      );
    } else if (mediaType === 'videoMessage') {
      const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, { logger });
      await sock.sendMessage(
        jid,
        {
          video: buffer,
          caption: caption ? `🔓 ${caption}` : '🔓 Extracted view-once video',
          mimetype: mediaContent?.mimetype || 'video/mp4',
        },
        { quoted: msg }
      );
    } else if (mediaType === 'audioMessage') {
      const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, { logger });
      await sock.sendMessage(
        jid,
        {
          audio: buffer,
          mimetype: mediaContent?.mimetype || 'audio/mp4',
          ptt: Boolean(mediaContent?.ptt),
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        jid,
        { text: '❌ Unsupported view-once media type.' },
        { quoted: msg }
      );
    }
  } catch (err) {
    console.error('[give] Failed to download and re-send view-once media:', err.message);
    await sock.sendMessage(
      jid,
      { text: `❌ Failed to extract view-once message: ${err.message}` },
      { quoted: msg }
    );
  }
}
