import { getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { convertToStaticWebP, convertToAnimatedWebP } from '../utils/converter.js';
import { addStickerMetadata } from '../utils/metadata.js';

const logger = pino({ level: 'silent' });

// Matches: .sticker, sticker, .sticker Pack, .sticker Pack Author
const COMMAND_REGEX = /^\.?sticker(?:\s+(\S+))?(?:\s+(\S+))?$/i;
const DEFAULT_PACK = 'yo mama so fat';
const DEFAULT_AUTHOR = 'prawmathean';

export async function handleStickerCommand(sock, msg) {
  try {
    // Extract text from either a plain or extended text message
    const text =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      '';

    const match = text.trim().match(COMMAND_REGEX);
    if (!match) return;

    const packName   = match[1] || DEFAULT_PACK;
    const authorName = match[2] || DEFAULT_AUTHOR;
    const jid        = msg.key.remoteJid;

    // Must be a reply
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo?.quotedMessage) {
      await sock.sendMessage(jid, {
        text: '❌ Please *reply to an image or GIF* with the `.sticker` command.',
      }, { quoted: msg });
      return;
    }

    const quotedMsg = {
      key: {
        remoteJid: jid,
        id: contextInfo.stanzaId,
        fromMe: false,
        participant: contextInfo.participant,
      },
      message: contextInfo.quotedMessage,
    };

    const msgType = getContentType(quotedMsg.message);
    const isImage = msgType === 'imageMessage';
    const isVideo = msgType === 'videoMessage';
    const isGif   = isVideo && quotedMsg.message?.videoMessage?.gifPlayback === true;

    if (!isImage && !isGif) {
      await sock.sendMessage(jid, {
        text: '❌ I can only convert *images* and *GIFs* to stickers.',
      }, { quoted: msg });
      return;
    }

    // Show processing reaction
    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    // Download media
    const mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, { logger });

    // Convert to WebP
    const webpBuffer = isGif
      ? await convertToAnimatedWebP(mediaBuffer)
      : await convertToStaticWebP(mediaBuffer);

    // Embed sticker metadata
    const stickerBuffer = await addStickerMetadata(webpBuffer, packName, authorName, isGif);

    // Send sticker
    await sock.sendMessage(jid, {
      sticker: stickerBuffer,
    }, { quoted: msg });

    // Done reaction
    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('[sticker] Error:', err.message);
    await sock.sendMessage(msg.key.remoteJid, {
      text: `❌ Failed to create sticker: ${err.message}`,
    }, { quoted: msg });
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
  }
}
