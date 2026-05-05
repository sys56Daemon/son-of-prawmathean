import config from '../config.js';

const BOT_START_TIME = Date.now();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUptime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function memMB() {
  return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** .ping — measures round-trip latency */
export async function handlePing(sock, msg) {
  const jid   = msg.key.remoteJid;
  const start = Date.now();
  await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: msg });
  const latency = Date.now() - start;
  const uptime  = formatUptime(Date.now() - BOT_START_TIME);
  await sock.sendMessage(jid, {
    text: `🏓 *Pong!*\n\n⚡ *Latency:* ${latency}ms\n⏱️ *Uptime:* ${uptime}`,
  }, { quoted: msg });
}

/** .alive — simple status check */
export async function handleAlive(sock, msg) {
  const jid    = msg.key.remoteJid;
  const uptime = formatUptime(Date.now() - BOT_START_TIME);
  await sock.sendMessage(jid, {
    text: `✅ *${config.botName} is alive!*\n\n⏱️ *Uptime:* ${uptime}\n🟢 *Status:* Online`,
  }, { quoted: msg });
}

/** .info — bot stats */
export async function handleInfo(sock, msg) {
  const jid    = msg.key.remoteJid;
  const uptime = formatUptime(Date.now() - BOT_START_TIME);
  const mem    = memMB();
  const nodeVer = process.version;
  await sock.sendMessage(jid, {
    text: [
      `ℹ️ *${config.botName} — Info*`,
      ``,
      `🤖 *Version:* ${config.version}`,
      `⏱️ *Uptime:* ${uptime}`,
      `💾 *Memory:* ${mem} MB`,
      `🟢 *Status:* Online`,
      `⚙️ *Node.js:* ${nodeVer}`,
      `🔒 *Mode:* ${config.private ? 'Private' : 'Public'}`,
    ].join('\n'),
  }, { quoted: msg });
}

/** .help — command list */
export async function handleHelp(sock, msg) {
  const jid = msg.key.remoteJid;
  const p   = config.prefix;
  await sock.sendMessage(jid, {
    text: [
      `🤖 *${config.botName} — Commands*`,
      ``,
      `*🖼️ Sticker*`,
      `› \`${p}sticker [pack] [author]\` — Image/GIF → sticker`,
      `› \`${p}toimg\` — Sticker → image`,
      ``,
      `*🎨 Generators*`,
      `› \`certificate <name> <role>\` — Generate a (goofy) certificate`,
      `› \`qr <text>\` — Generate a scannable QR code`,
      ``,
      `*📋 General*`,
      `› \`${p}ping\` — Check latency & uptime`,
      `› \`${p}alive\` — Check if bot is online`,
      `› \`${p}info\` — Bot stats`,
      `› \`${p}help\` — This menu`,
      ``,
      `*👥 Group (admins only)*`,
      `› \`${p}tagall [msg]\` — Mention all members`,
      `› \`${p}kick @user\` — Kick a member`,
      `› \`${p}promote @user\` — Make admin`,
      `› \`${p}demote @user\` — Remove admin`,
      ``,
      `_Prefix: \`${p}\`_`,
    ].join('\n'),
  }, { quoted: msg });
}

/** .toimg — convert a quoted sticker back to PNG */
export async function handleToImg(sock, msg) {
  const { default: Jimp }                = await import('jimp');
  const { downloadMediaMessage }         = await import('@whiskeysockets/baileys');
  const { default: pino }                = await import('pino');
  const logger                           = pino({ level: 'silent' });
  const jid                              = msg.key.remoteJid;
  const contextInfo                      = msg.message?.extendedTextMessage?.contextInfo;

  if (!contextInfo?.quotedMessage) {
    await sock.sendMessage(jid, { text: '❌ Reply to a *sticker* with `.toimg`.' }, { quoted: msg });
    return;
  }

  const quotedMsg = {
    key: {
      remoteJid:   jid,
      id:          contextInfo.stanzaId,
      fromMe:      false,
      participant: contextInfo.participant,
    },
    message: contextInfo.quotedMessage,
  };

  const { getContentType } = await import('@whiskeysockets/baileys');
  if (getContentType(quotedMsg.message) !== 'stickerMessage') {
    await sock.sendMessage(jid, { text: '❌ That\'s not a sticker.' }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

  const webpBuf = await downloadMediaMessage(quotedMsg, 'buffer', {}, { logger });
  // Use jimp (pure JS) — works on Termux/android-arm64 without native binaries
  const image   = await Jimp.read(webpBuf);
  const pngBuf  = await image.getBufferAsync(Jimp.MIME_PNG);

  await sock.sendMessage(jid, {
    image:   pngBuf,
    caption: '🖼️ Here\'s your image!',
  }, { quoted: msg });

  await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
}
