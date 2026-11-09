import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import { convertToStaticWebP } from '../utils/converter.js';
import { addStickerMetadata } from '../utils/metadata.js';
import { trackStickerConversion } from '../utils/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_PATH = path.resolve(__dirname, '../assets/thinksay-template.png');

// Register font if available
const FONT_PATH = path.resolve(__dirname, '../assets/fonts/NotoSans-Bold.ttf');
if (fs.existsSync(FONT_PATH)) {
  GlobalFonts.registerFromPath(FONT_PATH, 'NotoSansMeme');
}

// Bounding boxes calibrated for assets/thinksay-template.png (613x500)
const THINK_BOX = { x: 35, y: 135, width: 220, height: 215 };
const SAY_BOX   = { x: 395, y: 135, width: 185, height: 185 };

/**
 * Split text into lines that fit within maxWidth for a given font size
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Render wrapped & vertically/horizontally centered text inside a box
 */
function drawTextInBox(ctx, text, box) {
  if (!text) return;

  const fontFam = GlobalFonts.has('NotoSansMeme') ? 'NotoSansMeme' : 'sans-serif';
  let fontSize = 28;
  const minFontSize = 11;
  let lines = [];
  let lineHeight = fontSize * 1.25;

  // Dynamically shrink font size until text fits within box height & width
  while (fontSize >= minFontSize) {
    ctx.font = `bold ${fontSize}px ${fontFam}`;
    lineHeight = fontSize * 1.25;
    lines = wrapText(ctx, text, box.width);
    const totalHeight = lines.length * lineHeight;

    const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    if (totalHeight <= box.height && maxLineWidth <= box.width) {
      break;
    }
    fontSize -= 1.5;
  }

  ctx.font = `bold ${fontSize}px ${fontFam}`;
  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const totalBlockHeight = lines.length * lineHeight;
  let startY = box.y + (box.height - totalBlockHeight) / 2 + lineHeight / 2;
  const centerX = box.x + box.width / 2;

  for (const line of lines) {
    ctx.fillText(line, centerX, startY);
    startY += lineHeight;
  }
}

/**
 * Parse input string into { thinkText, sayText, isSticker }
 * Supports:
 *   .thinksay -s "think something" "say something"
 *   .thinksay -s think something | say something
 *   .thinksay think something | say something
 */
export function parseThinkSayArgs(rawText) {
  let text = rawText.trim();

  // Strip command prefix / name (.thinksay, thinksay, .think, etc.)
  text = text.replace(/^\.?(?:thinksay|think)\b/i, '').trim();

  let isSticker = false;
  // Check for sticker flag: -s or --sticker
  const flagMatch = text.match(/(?:^|\s)(-[sS]|--sticker)(?:\s|$)/);
  if (flagMatch) {
    isSticker = true;
    text = text.replace(flagMatch[0], ' ').trim();
  }

  let thinkText = '';
  let sayText = '';

  // Case 1: Quotes e.g. "think text" "say text" or 'think' 'say'
  const quoteMatches = [...text.matchAll(/["“']([^"”']+)["”']/g)];
  if (quoteMatches.length >= 2) {
    thinkText = quoteMatches[0][1].trim();
    sayText = quoteMatches[1][1].trim();
  } else if (text.includes('|')) {
    // Case 2: Pipe separated e.g. think text | say text
    const parts = text.split('|');
    thinkText = parts[0]?.trim() || '';
    sayText = parts.slice(1).join('|').trim();
  } else if (quoteMatches.length === 1) {
    // One quoted part, remaining as the second part
    thinkText = quoteMatches[0][1].trim();
    sayText = text.replace(quoteMatches[0][0], '').trim();
  }

  return { thinkText, sayText, isSticker };
}

/**
 * Generate ThinkSay meme canvas buffer
 */
export async function generateThinkSayMeme(thinkText, sayText) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error('Meme template not found at assets/thinksay-template.png');
  }

  const templateImage = await loadImage(TEMPLATE_PATH);
  const canvas = createCanvas(templateImage.width, templateImage.height);
  const ctx = canvas.getContext('2d');

  // Draw background template
  ctx.drawImage(templateImage, 0, 0);

  // Draw thinking text and saying text
  drawTextInBox(ctx, thinkText, THINK_BOX);
  drawTextInBox(ctx, sayText, SAY_BOX);

  return canvas.toBuffer('image/png');
}

/**
 * Handler for WhatsApp command
 */
export async function handleThinkSay(sock, msg, rawArgs) {
  const jid = msg.key.remoteJid;
  const rawText = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  ).trim();

  const { thinkText, sayText, isSticker } = parseThinkSayArgs(rawText);

  if (!thinkText || !sayText) {
    const helpMsg = [
      '💭 *Think & Say Meme Generator*',
      '',
      '*Usage:*',
      '• `.thinksay "thinking text" "saying text"`',
      '• `.thinksay thinking text | saying text`',
      '',
      '*Options:*',
      '• Add `-s` to send directly as a WhatsApp sticker!',
      '',
      '*Examples:*',
      '› `.thinksay "damn this is cool" "Nice"`',
      '› `.thinksay -s "I hate Mondays" "Good morning team!"`',
      '› `.thinksay -s thinking | saying`'
    ].join('\n');

    await sock.sendMessage(jid, { text: helpMsg }, { quoted: msg });
    return;
  }

  try {
    // Send thinking reaction
    await sock.sendMessage(jid, { react: { text: '🎨', key: msg.key } }).catch(() => {});

    const pngBuffer = await generateThinkSayMeme(thinkText, sayText);

    if (isSticker) {
      const webpBuffer = await convertToStaticWebP(pngBuffer);
      const stickerBuffer = await addStickerMetadata(webpBuffer, 'ThinkSay', 'prawmathean', false);
      await sock.sendMessage(jid, { sticker: stickerBuffer }, { quoted: msg });

      const sender = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);
      trackStickerConversion(sender, msg.pushName);
    } else {
      await sock.sendMessage(jid, {
        image: pngBuffer,
        caption: `💭 *${thinkText}*  ➔  🗣️ *${sayText}*`
      }, { quoted: msg });
    }

    // Done reaction
    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }).catch(() => {});

  } catch (err) {
    console.error('[thinksay] Error generating meme:', err);
    await sock.sendMessage(jid, {
      text: `❌ Failed to generate meme: ${err.message}`
    }, { quoted: msg });
  }
}
