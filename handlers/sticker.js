import { getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { convertToStaticWebP, convertToAnimatedWebP } from '../utils/converter.js';
import { addStickerMetadata } from '../utils/metadata.js';

const logger = pino({ level: 'silent' });

// Matches: .sticker, sticker, .sticker Pack, .sticker Pack Author
const COMMAND_REGEX = /^\.?sticker(?:\s+(\S+))?(?:\s+(\S+))?$/i;
const DEFAULT_PACK = 'yo mama so fat';
const DEFAULT_AUTHOR = 'prawmathean';

export async function handleStickerCommand(sock, msg, args) {
  try {
    const jid = msg.key.remoteJid;

    // Parse pack and author from args (supports: .sticker "Pack Name" "Author Name")
    const argMatch = args.match(/"([^"]+)"|'([^']+)'|(\S+)/g) || [];
    const packName   = (argMatch[0] || DEFAULT_PACK).replace(/['"]/g, '');
    const authorName = (argMatch[1] || DEFAULT_AUTHOR).replace(/['"]/g, '');

    // Determine the source of the media (either the message itself or a quoted one)
    let targetMsg = msg;
    let msgType   = getContentType(msg.message);

    const contextInfo = 
      msg.message?.extendedTextMessage?.contextInfo ||
      msg.message?.imageMessage?.contextInfo ||
      msg.message?.videoMessage?.contextInfo;

    if (contextInfo?.quotedMessage) {
      targetMsg = {
        key: {
          remoteJid: jid,
          id: contextInfo.stanzaId,
          fromMe: false,
          participant: contextInfo.participant,
        },
        message: contextInfo.quotedMessage,
      };
      msgType = getContentType(targetMsg.message);
    }

    const isImage = msgType === 'imageMessage';
    const isVideo = msgType === 'videoMessage';
    const isGif   = isVideo && targetMsg.message?.videoMessage?.gifPlayback === true;

    if (!isImage && !isGif) {
      await sock.sendMessage(jid, {
        text: '❌ Please *reply to an image/GIF* or send one with the `.sticker` caption.',
      }, { quoted: msg });
      return;
    }

    // Show processing reaction
    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    // Download media
    console.log('[sticker] downloading media, type:', msgType);
    const mediaBuffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger });
    console.log('[sticker] downloaded bytes:', mediaBuffer?.length ?? 0);

    // Convert to WebP
    const webpBuffer = isGif
      ? await convertToAnimatedWebP(mediaBuffer)
      : await convertToStaticWebP(mediaBuffer);
    console.log('[sticker] webp bytes:', webpBuffer?.length ?? 0);

    // Embed sticker metadata
    const stickerBuffer = await addStickerMetadata(webpBuffer, packName, authorName, isGif);
    console.log('[sticker] final sticker bytes:', stickerBuffer?.length ?? 0);

    // Send sticker
    await sock.sendMessage(jid, {
      sticker: stickerBuffer,
      mimetype: 'image/webp',
    }, { quoted: msg });

    // Done reaction
    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('[sticker] Error:', err.message, err.stack);
    await sock.sendMessage(msg.key.remoteJid, {
      text: `❌ Failed to create sticker: ${err.message}`,
    }, { quoted: msg });
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
  }
}
