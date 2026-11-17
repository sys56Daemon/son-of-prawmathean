import { getContentType, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { convertToStaticWebP } from '../utils/converter.js';
import { addStickerMetadata } from '../utils/metadata.js';
import { trackStickerConversion, trackRequest } from '../utils/stats.js';

const execFileAsync = promisify(execFile);
const logger = pino({ level: 'silent' });

// Classic 6-color pride rainbow
const RAINBOW_COLORS = [
  '#E40303', // Red
  '#FF8C00', // Orange
  '#FFED00', // Yellow
  '#008026', // Green
  '#24408E', // Blue
  '#732982', // Violet
];

/**
 * Apply horizontal rainbow stripes over an image buffer
 */
export async function applyRainbowFilter(imageBuffer) {
  const baseImg = await loadImage(imageBuffer);
  const width = baseImg.width;
  const height = baseImg.height;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Draw base image
  ctx.drawImage(baseImg, 0, 0, width, height);

  // Use 'source-atop' composite mode so if the input is a transparent PNG/sticker,
  // the rainbow only paints over existing opaque pixels
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.globalAlpha = 0.42;

  const stripeHeight = height / RAINBOW_COLORS.length;
  for (let i = 0; i < RAINBOW_COLORS.length; i++) {
    ctx.fillStyle = RAINBOW_COLORS[i];
    ctx.fillRect(0, Math.floor(i * stripeHeight), width, Math.ceil(stripeHeight) + 1);
  }
  ctx.restore();

  return canvas.toBuffer('image/png');
}

/**
 * Extract image buffer from quoted message or current message (image/sticker)
 */
async function extractImageBuffer(sock, msg) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  let targetMsg = null;
  let isQuoted = false;

  if (contextInfo?.quotedMessage) {
    targetMsg = {
      key: {
        remoteJid:   msg.key.remoteJid,
        id:          contextInfo.stanzaId,
        fromMe:      contextInfo.participant === sock.user?.id,
        participant: contextInfo.participant,
      },
      message: contextInfo.quotedMessage,
    };
    isQuoted = true;
  } else if (msg.message?.imageMessage) {
    targetMsg = msg;
  }

  if (!targetMsg) return null;

  const type = getContentType(targetMsg.message);
  if (type !== 'imageMessage' && type !== 'stickerMessage') {
    return null;
  }

  const rawBuffer = await downloadMediaMessage(targetMsg, 'buffer', {}, { logger });
  if (!rawBuffer) return null;

  if (type === 'imageMessage') {
    return rawBuffer;
  }

  // If sticker (WebP):
  // 1. Try decoding with @napi-rs/canvas loadImage directly (handles static and animated WebP!)
  try {
    const img = await loadImage(rawBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return canvas.toBuffer('image/png');
  } catch (canvasErr) {
    // 2. Fallback to ffmpeg if canvas decode fails
    const id = randomUUID();
    const inputPath = join(tmpdir(), `gay_in_${id}.webp`);
    const outputPath = join(tmpdir(), `gay_out_${id}.png`);

    try {
      await writeFile(inputPath, rawBuffer);
      await execFileAsync('ffmpeg', ['-y', '-i', inputPath, outputPath]);
      return await readFile(outputPath);
    } finally {
      await unlink(inputPath).catch(() => {});
      await unlink(outputPath).catch(() => {});
    }
  }
}

/**
 * Handler for .gay / gay command
 */
export async function handleGay(sock, msg, args = []) {
  const jid = msg.key.remoteJid;
  const rawText = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  ).trim();

  const isSticker = /(?:^|\s)(-[sS]|--sticker)(?:\s|$)/.test(rawText);

  try {
    const imgBuffer = await extractImageBuffer(sock, msg);
    if (!imgBuffer) {
      await sock.sendMessage(jid, {
        text: '❌ Please reply to an *image* or *sticker* with `gay` (or `gay -s` for a sticker).\nYou can also send an image with `gay` in the caption.',
      }, { quoted: msg });
      return;
    }

    // Reaction
    await sock.sendMessage(jid, { react: { text: '🌈', key: msg.key } }).catch(() => {});

    // Generate rainbow-filtered image
    const rainbowPng = await applyRainbowFilter(imgBuffer);

    if (isSticker) {
      const webpBuffer = await convertToStaticWebP(rainbowPng);
      const stickerBuffer = await addStickerMetadata(webpBuffer, 'Rainbow', 'prawmathean', false);
      await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });

      const sender = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);
      trackStickerConversion(sender, msg.pushName);
    } else {
      await sock.sendMessage(jid, {
        image: rainbowPng,
        caption: '🌈 ✨'
      }, { quoted: msg });
    }

    // Done reaction
    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});

  } catch (err) {
    console.error('[gay] Error generating rainbow tint:', err);
    await sock.sendMessage(jid, {
      text: `❌ Failed to apply rainbow tint: ${err.message}`,
    }, { quoted: msg });
  }
}
