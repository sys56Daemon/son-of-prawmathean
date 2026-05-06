import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getNumber } from '../utils/permissions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '../assets/fonts');

// Dynamically load canvas so the bot doesn't crash on Termux
let canvasSupported = false;
let createCanvas, GlobalFonts;

try {
  const canvasMod = await import('@napi-rs/canvas');
  createCanvas = canvasMod.createCanvas;
  GlobalFonts = canvasMod.GlobalFonts;

  // Register explicit fonts
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSerif-Regular.ttf'), 'Noto Serif');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSerif-Bold.ttf'), 'Noto Serif');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSerif-Italic.ttf'), 'Noto Serif');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSerif-BoldItalic.ttf'), 'Noto Serif');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Regular.ttf'), 'Noto Sans');
  GlobalFonts.registerFromPath(join(FONT_DIR, 'NotoSans-Bold.ttf'), 'Noto Sans');
  
  canvasSupported = true;
} catch (e) {
  console.warn('\n⚠️  @napi-rs/canvas could not be loaded. Certificate generation will be disabled.');
  console.warn('   (This is expected on some Termux/Android environments without native binaries)\n');
}

// ─── Arg Parser ───────────────────────────────────────────────────────────────

/**
 * Parses args and the message context to extract { name, position }.
 *
 * Priority:
 *  1. If the message has a @mention → name = mentioned person's number,
 *     role = remaining text after stripping the @xxxxxxxxx part.
 *  2. Quoted strings  →  certify "John Doe" "Chief Meme Officer"
 *  3. Space-separated →  certify Johnny Chief Meme Officer
 */
function parseArgs(rawText, mentionedJids = []) {
  if (mentionedJids.length > 0) {
    // Name from first mentioned JID (strip country code prefix for readability)
    const num  = getNumber(mentionedJids[0]);
    const name = num || 'Unknown';
    // Role = everything after removing the @<digits> mention token
    const role = rawText.replace(/@\d+/g, '').trim() || 'Distinguished Member';
    return { name, position: role };
  }

  // Try two quoted strings first
  const quoted = rawText.match(/['"]([^'"]+)['"]\s+['"]([^'"]+)['"]/);
  if (quoted) return { name: quoted[1].trim(), position: quoted[2].trim() };

  // Fallback: first word = name, rest = role
  const parts = rawText.trim().split(/\s+/);
  return {
    name:     parts[0] ?? 'Unknown',
    position: parts.slice(1).join(' ') || 'Professional Memer',
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function handleCertificate(sock, msg, args) {
  const jid = msg.key.remoteJid;

  if (!canvasSupported) {
    await sock.sendMessage(jid, {
      text: '❌ *Certificate generation is not supported on this device.*\nNative canvas modules are missing (often happens on Termux).',
    }, { quoted: msg });
    return;
  }

  if (!args.length) {
    await sock.sendMessage(jid, {
      text:
        '❌ *Usage:*\n' +
        '  `certify @mention Role`\n' +
        '  `certify Name Role`\n' +
        '  `certify "John Doe" "Chief Meme Officer"`\n\n' +
        '📌 *Example:* `certify @John Chief of Vibes`',
    }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

  // Extract @mentions from WhatsApp context
  const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
  const { name, position } = parseArgs(args.join(' '), mentionedJids);
  const imgBuffer = await generateCertificate(name, position);

  // Tag the mentioned person in the reply if present
  const sendOpts = { quoted: msg };
  if (mentionedJids.length > 0) sendOpts.mentions = mentionedJids;

  await sock.sendMessage(jid, {
    image:   imgBuffer,
    caption: `🏆 *Congrats ${name}!*`,
    ...sendOpts,
  });

  await sock.sendMessage(jid, { react: { text: '🏆', key: msg.key } });
}

// ─── Canvas Generator ─────────────────────────────────────────────────────────

async function generateCertificate(name, position) {
  const W = 1200;
  const H = 860;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── Background ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   '#fefae8');
  bg.addColorStop(0.5, '#fdf5dc');
  bg.addColorStop(1,   '#faefd0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Diagonal watermark ──────────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.font        = 'bold 170px "Noto Serif"';
  ctx.fillStyle   = '#8B6914';
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-Math.PI / 8);
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CERTIFIED', 0, 0);
  ctx.restore();

  // ── Outer gold border ────────────────────────────────────────────────────────
  const GOLD   = '#c8a030';
  const GOLD2  = '#e6c060';
  const BORDER = 18;

  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = BORDER;
  ctx.strokeRect(BORDER / 2, BORDER / 2, W - BORDER, H - BORDER);

  ctx.strokeStyle = GOLD2;
  ctx.lineWidth   = 2;
  ctx.strokeRect(BORDER + 8, BORDER + 8, W - (BORDER + 8) * 2, H - (BORDER + 8) * 2);

  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = 1;
  ctx.strokeRect(BORDER + 14, BORDER + 14, W - (BORDER + 14) * 2, H - (BORDER + 14) * 2);

  // ── Corner diamond ornaments ─────────────────────────────────────────────────
  const drawDiamond = (cx, cy) => {
    [20, 14, 8].forEach((r, i) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = i === 0 ? GOLD : GOLD2;
      ctx.lineWidth   = i === 0 ? 2 : 1;
      ctx.strokeRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    });
  };
  const PAD = 50;
  drawDiamond(PAD, PAD);
  drawDiamond(W - PAD, PAD);
  drawDiamond(PAD, H - PAD);
  drawDiamond(W - PAD, H - PAD);

  // ── Decorative top row of stars ──────────────────────────────────────────────
  ctx.textAlign = 'center';
  ctx.font      = '22px "Noto Sans"';
  ctx.fillStyle = GOLD;
  ctx.fillText('✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦', W / 2, 100);

  // ── Header ───────────────────────────────────────────────────────────────────
  ctx.font      = 'bold 64px "Noto Serif"';
  ctx.fillStyle = '#7a1020';
  ctx.fillText('CERTIFICATE', W / 2, 175);

  ctx.font      = 'bold 26px "Noto Serif"';
  ctx.fillStyle = GOLD;
  ctx.letterSpacing = '6px';
  ctx.fillText('O F  A C H I E V E M E N T', W / 2, 220);
  ctx.letterSpacing = '0px';

  // ── Gold divider ─────────────────────────────────────────────────────────────
  const divider = (y) => {
    ctx.strokeStyle = GOLD;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 380, y);
    ctx.lineTo(W / 2 - 20,  y);
    ctx.moveTo(W / 2 + 20,  y);
    ctx.lineTo(W / 2 + 380, y);
    ctx.stroke();
    ctx.font      = '14px "Noto Sans"';
    ctx.fillStyle = GOLD;
    ctx.fillText('❖', W / 2, y + 5);
  };
  divider(245);

  // ── Body text ─────────────────────────────────────────────────────────────────
  ctx.font      = 'italic 23px "Noto Serif"';
  ctx.fillStyle = '#5c3a1e';
  ctx.fillText('This is to officially certify that the individual known as', W / 2, 305);

  // ── Recipient name ────────────────────────────────────────────────────────────
  // Clamp font size if name is too long
  let nameFontSize = 82;
  ctx.font = `bold ${nameFontSize}px "Noto Serif"`;
  while (ctx.measureText(name).width > W - 200 && nameFontSize > 40) {
    nameFontSize -= 4;
    ctx.font = `bold ${nameFontSize}px "Noto Serif"`;
  }
  ctx.fillStyle = '#1a0800';
  ctx.fillText(name, W / 2, 405);

  // Underline
  const nw = ctx.measureText(name).width;
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - nw / 2, 420);
  ctx.lineTo(W / 2 + nw / 2, 420);
  ctx.stroke();

  // ── Position text ─────────────────────────────────────────────────────────────
  ctx.font      = 'italic 23px "Noto Serif"';
  ctx.fillStyle = '#5c3a1e';
  ctx.fillText('has been appointed as the official', W / 2, 470);

  let posFontSize = 44;
  ctx.font = `bold italic ${posFontSize}px "Noto Serif"`;
  while (ctx.measureText(`"${position}"`).width > W - 160 && posFontSize > 24) {
    posFontSize -= 2;
    ctx.font = `bold italic ${posFontSize}px "Noto Serif"`;
  }
  ctx.fillStyle = '#7a1020';
  ctx.fillText(`"${position}"`, W / 2, 535);

  ctx.font      = 'italic 22px "Noto Serif"';
  ctx.fillStyle = '#5c3a1e';
  ctx.fillText('as recognized by the Council of Prawmathean Republic™', W / 2, 583);

  divider(610);

  // ── Date ─────────────────────────────────────────────────────────────────────
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  ctx.font      = '19px "Noto Serif"';
  ctx.fillStyle = '#6b4e2a';
  ctx.fillText(`Issued on ${date}`, W / 2, 648);

  // ── Signature lines ───────────────────────────────────────────────────────────
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth   = 1.5;

  // Left
  ctx.beginPath(); ctx.moveTo(130, 740); ctx.lineTo(410, 740); ctx.stroke();
  ctx.font = 'bold italic 18px "Noto Serif"'; ctx.fillStyle = '#5c3a1e';
  ctx.fillText('Prawmathean Republic', 270, 763);
  ctx.font = '14px "Noto Serif"'; ctx.fillStyle = '#999';
  ctx.fillText('Mr Robot', 270, 782);

  // // Right
  // ctx.beginPath(); ctx.moveTo(790, 740); ctx.lineTo(1070, 740); ctx.stroke();
  // ctx.font = 'bold italic 18px serif'; ctx.fillStyle = '#5c3a1e';
  // ctx.fillText('Your Phone', 930, 763);
  // ctx.font = '14px serif'; ctx.fillStyle = '#999';
  // ctx.fillText('Official Witness', 930, 782);

  // ── Circular seal ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(W / 2, 735);

  // Glow
  ctx.shadowColor = GOLD;
  ctx.shadowBlur  = 15;

  // Outer fill
  ctx.beginPath();
  ctx.arc(0, 0, 62, 0, Math.PI * 2);
  ctx.fillStyle   = 'rgba(212,175,55,0.12)';
  ctx.fill();

  // Rings
  ctx.shadowBlur  = 0;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth   = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.arc(0, 0, 52, 0, Math.PI * 2); ctx.stroke();

  // Seal text
  ctx.font        = 'bold 13px "Noto Sans"';
  ctx.fillStyle   = '#8B6914';
  ctx.textAlign   = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⭐   ⭐', 0, -14);
  ctx.fillText('FSOCIETY', 0, 4);
  ctx.font = '11px "Noto Sans"';
  ctx.fillStyle = '#696969ff';
  ctx.fillText('WE ARE FSOCIETY', 0, 22);

  ctx.restore();

  // ── Fine print ────────────────────────────────────────────────────────────────
  ctx.font      = '12px "Noto Sans"';
  ctx.fillStyle = '#bbb';
  ctx.textAlign = 'center';
  ctx.fillText(
    '* This certificate is generated for entertainment purpose only. Ktu points not applicable',
    W / 2, 825,
  );

  // ── Bottom stars ─────────────────────────────────────────────────────────────
  ctx.font      = '18px "Noto Sans"';
  ctx.fillStyle = GOLD;
  ctx.fillText('✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦  ✦', W / 2, 848);

  return canvas.toBuffer('image/png');
}
