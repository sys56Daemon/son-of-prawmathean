// import { downloadMediaMessage, getContentType, jidNormalizedUser } from '@whiskeysockets/baileys';
// import pino from 'pino';
// import messageStore from '../utils/messageStore.js';

// const logger = pino({ level: 'silent' });

// function deepCopy(obj) {
//   if (!obj || typeof obj !== 'object') return obj;
//   return JSON.parse(JSON.stringify(obj));
// }

// /**
//  * Extracts and unsets viewOnce flag from a WhatsApp message object.
//  * Handles:
//  *  - msg.message?.imageMessage?.viewOnce === true (and video/audio/document)
//  *  - viewOnceMessage / viewOnceMessageV2 / viewOnceMessageV2Extension
//  *  - nested wrapper messages (ephemeralMessage, documentWithCaptionMessage)
//  *
//  * @param {object} message
//  * @returns {object|null}
//  */
// export function extractViewOnce(message) {
//   if (!message) return null;
//   message = deepCopy(message);

//   let msgContent = message.message || message;

//   // 1. Unwrap nested outer wrappers like ephemeralMessage, documentWithCaptionMessage
//   for (let i = 0; i < 5; i++) {
//     if (msgContent?.ephemeralMessage?.message) {
//       msgContent = msgContent.ephemeralMessage.message;
//     } else if (msgContent?.documentWithCaptionMessage?.message) {
//       msgContent = msgContent.documentWithCaptionMessage.message;
//     } else {
//       break;
//     }
//   }

//   // 2. Check for explicit viewOnce containers
//   const viewOnce =
//     msgContent?.viewOnceMessage ||
//     msgContent?.viewOnceMessageV2 ||
//     msgContent?.viewOnceMessageV2Extension;

//   if (viewOnce?.message) {
//     for (const key in viewOnce.message) {
//       const data = viewOnce.message[key];
//       if (data && typeof data === 'object' && data.viewOnce) {
//         data.viewOnce = false;
//       }
//     }
//     message.message = viewOnce.message;
//     return message;
//   }

//   // 3. Check if the media itself is inside msgContent with viewOnce: true
//   const mediaKeys = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'];
//   for (const key of mediaKeys) {
//     if (msgContent?.[key]?.viewOnce) {
//       msgContent[key].viewOnce = false;
//       message.message = { [key]: msgContent[key] };
//       return message;
//     }
//   }

//   return null;
// }

// /**
//  * .give — Extract view-once media/message and send the extracted content back into the chat.
//  */
// export async function handleGive(sock, msg) {
//   const jid = msg.key.remoteJid;
//   const contextInfo = msg.message?.extendedTextMessage?.contextInfo;

//   if (!contextInfo?.quotedMessage) {
//     await sock.sendMessage(
//       jid,
//       { text: '❌ Please *reply to a view-once message* with `.give`.' },
//       { quoted: msg }
//     );
//     return;
//   }

//   const stanzaId = contextInfo.stanzaId;
//   const quotedParticipant = contextInfo.participant;
//   const botUserJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : '';
//   const isFromMe = quotedParticipant
//     ? jidNormalizedUser(quotedParticipant) === botUserJid
//     : Boolean(msg.key?.fromMe);

//   let targetMsg = {
//     key: {
//       remoteJid: jid,
//       id: stanzaId,
//       fromMe: isFromMe,
//       participant: quotedParticipant,
//     },
//     message: contextInfo.quotedMessage,
//   };

//   // If quotedMessage lacks mediaKey, try to pull the original complete message from the message store
//   const rawType = getContentType(targetMsg.message);
//   const mediaObj = targetMsg.message?.[rawType] ||
//     targetMsg.message?.viewOnceMessage?.message?.[getContentType(targetMsg.message?.viewOnceMessage?.message)] ||
//     targetMsg.message?.viewOnceMessageV2?.message?.[getContentType(targetMsg.message?.viewOnceMessageV2?.message)];

//   if (!mediaObj?.mediaKey && stanzaId) {
//     const storedMsg = messageStore.loadMessage(jid, stanzaId);
//     if (storedMsg?.message) {
//       targetMsg = storedMsg;
//     }
//   }

//   const extracted = extractViewOnce(targetMsg);
//   if (!extracted || !extracted.message) {
//     await sock.sendMessage(
//       jid,
//       { text: '❌ That quoted message is *not a view-once message*.' },
//       { quoted: msg }
//     );
//     return;
//   }

//   // React to acknowledge request
//   await sock.sendMessage(jid, { react: { text: '🔓', key: msg.key } }).catch(() => {});

//   // Go straight to downloading and sending decrypted media (reliable across clients)
//   try {
//     const unwrappedMsg = {
//       key: targetMsg.key,
//       message: extracted.message,
//     };

//     const mediaType = getContentType(unwrappedMsg.message);
//     const mediaContent = unwrappedMsg.message?.[mediaType];
//     const caption = mediaContent?.caption || '';

//     const downloadOpts = {
//       logger,
//       reuploadRequest: typeof sock.updateMediaMessage === 'function' ? sock.updateMediaMessage : undefined,
//     };

//     if (mediaType === 'imageMessage') {
//       const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, downloadOpts);
//       await sock.sendMessage(
//         jid,
//         { image: buffer, caption: caption ? `🔓 ${caption}` : '🔓 Extracted view-once image' },
//         { quoted: msg }
//       );
//     } else if (mediaType === 'videoMessage') {
//       const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, downloadOpts);
//       await sock.sendMessage(
//         jid,
//         {
//           video: buffer,
//           caption: caption ? `🔓 ${caption}` : '🔓 Extracted view-once video',
//           mimetype: mediaContent?.mimetype || 'video/mp4',
//         },
//         { quoted: msg }
//       );
//     } else if (mediaType === 'audioMessage') {
//       const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, downloadOpts);
//       await sock.sendMessage(
//         jid,
//         {
//           audio: buffer,
//           mimetype: mediaContent?.mimetype || 'audio/mp4',
//           ptt: Boolean(mediaContent?.ptt),
//         },
//         { quoted: msg }
//       );
//     } else {
//       await sock.sendMessage(
//         jid,
//         { text: '❌ Unsupported view-once media type.' },
//         { quoted: msg }
//       );
//     }
//   } catch (err) {
//     console.error('[give] Failed to download and re-send view-once media:', err.message);
//     await sock.sendMessage(
//       jid,
//       { text: `❌ Failed to extract view-once message: ${err.message}` },
//       { quoted: msg }
//     );
//   }
// }

import {
  downloadMediaMessage,
  getContentType,
  jidNormalizedUser,
} from '@whiskeysockets/baileys';

/**
 * Unwraps view-once containers and clears the viewOnce boolean flag
 * so the media can be downloaded and re-sent normally.
 */
function unwrapViewOnce(quotedMessage) {
  if (!quotedMessage) return null;

  // 1. Check for legacy/wrapper containers
  const innerMessage =
    quotedMessage.viewOnceMessage?.message ||
    quotedMessage.viewOnceMessageV2?.message ||
    quotedMessage.viewOnceMessageV2Extension?.message ||
    quotedMessage;

  const mediaType = getContentType(innerMessage);
  const mediaContent = innerMessage?.[mediaType];

  // 2. Verify it is actually a view-once media message
  const isWrapped = Boolean(
    quotedMessage.viewOnceMessage ||
    quotedMessage.viewOnceMessageV2 ||
    quotedMessage.viewOnceMessageV2Extension
  );
  const hasViewOnceFlag = Boolean(mediaContent?.viewOnce);

  if (!isWrapped && !hasViewOnceFlag) {
    return null;
  }

  // 3. Clone and remove the viewOnce flag so re-sending doesn't stay view-once
  const cleanMediaContent = { ...mediaContent };
  delete cleanMediaContent.viewOnce;

  return {
    mediaType,
    message: {
      [mediaType]: cleanMediaContent,
    },
  };
}

export async function handleGive(sock, msg, logger) {
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

  const extracted = unwrapViewOnce(contextInfo.quotedMessage);
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

  const unwrappedMsg = {
    key: {
      remoteJid: jid,
      id: contextInfo.stanzaId,
      fromMe:
        jidNormalizedUser(contextInfo.participant) ===
        jidNormalizedUser(sock.user?.id),
      participant: contextInfo.participant,
    },
    message: extracted.message,
  };

  try {
    const { mediaType } = extracted;
    const mediaContent = extracted.message[mediaType];
    const caption = mediaContent?.caption || '';

    const downloadOptions = {
      logger,
      reuploadRequest: sock.updateMediaMessage,
    };

    if (mediaType === 'imageMessage') {
      const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, downloadOptions);
      await sock.sendMessage(
        jid,
        {
          image: buffer,
          caption: caption ? `🔓 ${caption}` : '🔓 Extracted view-once image',
        },
        { quoted: msg }
      );
    } else if (mediaType === 'videoMessage') {
      const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, downloadOptions);
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
      const buffer = await downloadMediaMessage(unwrappedMsg, 'buffer', {}, downloadOptions);
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
