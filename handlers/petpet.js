import { getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { generatePetpet } from '../utils/petpet.js';
import { addStickerMetadata } from '../utils/metadata.js';

const logger = pino({ level: 'silent' });

export async function handlePetpet(sock, msg) {
  try {
    const jid = msg.key.remoteJid;

    // Must be a reply
    const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
    if (!contextInfo?.quotedMessage) {
      await sock.sendMessage(jid, {
        text: '❌ Please *reply to an image or sticker* with `.pet`.',
      }, { quoted: msg });
      return;
    }

    const quotedMsg = {
      key: {
        remoteJid:   jid,
        id:          contextInfo.stanzaId,
        fromMe:      contextInfo.participant === sock.user?.id,
        participant: contextInfo.participant,
      },
      message: contextInfo.quotedMessage,
    };

    const msgType    = getContentType(quotedMsg.message);
    const isImage    = msgType === 'imageMessage';
    const isSticker  = msgType === 'stickerMessage';

    if (!isImage && !isSticker) {
      await sock.sendMessage(jid, {
        text: '❌ I can only petpet *images* or *stickers*. Reply to one with `.pet`.',
      }, { quoted: msg });
      return;
    }

    // Show processing reaction
    await sock.sendMessage(jid, { react: { text: '🐾', key: msg.key } });

    // Download the media
    console.log('[petpet] downloading media, type:', msgType);
    const mediaBuffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, { logger });
    console.log('[petpet] downloaded bytes:', mediaBuffer?.length ?? 0);

    // Generate the petpet animation
    const webpBuffer = await generatePetpet(mediaBuffer);
    console.log('[petpet] animated WebP bytes:', webpBuffer?.length ?? 0);

    // Embed sticker metadata
    const stickerBuffer = await addStickerMetadata(webpBuffer, 'petpet', 'prawmathean', true);

    // Send as sticker
    await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });

    // Done reaction
    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('[petpet] Error:', err.message, err.stack);
    await sock.sendMessage(msg.key.remoteJid, {
      text: `❌ Failed to generate petpet: ${err.message}`,
    }, { quoted: msg });
    await sock.sendMessage(msg.key.remoteJid, { react: { text: '❌', key: msg.key } });
  }
}
