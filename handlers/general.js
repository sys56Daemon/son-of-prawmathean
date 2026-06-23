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
  // await sock.sendMessage(jid, { text: '🏓 Pong!' }, { quoted: msg });
  const latency = Date.now() - start;
  const uptime  = formatUptime(Date.now() - BOT_START_TIME);
  await sock.sendMessage(jid, { react: { text: '🗿', key: msg.key } });
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
      `*${config.botName} — Info*`,
      ``,
      `🤖 *Version:* ${config.version}`,
      `⏱️ *Uptime:* ${uptime}`,
      `💾 *Memory:* ${mem} MB`,
      `🟢 *Status:* Online`,
      // `⚙️ *Node.js:* ${nodeVer}`,
      `🔒 *Mode:* ${config.private ? 'Private' : 'Public'}`,
      `👾 *Creator:* Prajwal Praveen`
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
      `› \`certificate <name> <role>\` — Generate a mock certificate`,
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
      `› \`${p}ginfo\` — Show group details`,
      ``,
      `*🎮 Fun*`,
      `› \`${p}calc <expr>\` — Calculator (e.g. \`(5+3)*2\`)`,
      `› \`${p}flip\` — Flip a coin`,
      `› \`${p}roll [NdM]\` — Roll dice (e.g. \`2d20\`, \`d100\`)`,
      `› \`${p}remind <time> <msg>\` — Set a reminder (e.g. \`10m\`, \`1h30m\`)`,
      `› \`${p}8ball <question>\` — Ask the Magic 8-Ball`,
      `› \`${p}choose opt1 | opt2 | ...\` — Pick a random option`,
      ``,
      `*🌐 Utility*`,
      `› \`${p}weather [city]\` — Current weather`,
      `› \`${p}translate <lang> <text>\` — Translate text (alias: \`${p}tr\`)`,
      `› \`${p}define <word>\` — Dictionary definition`,
      `› \`${p}tts <text>\` — Text to voice note`,
      ``,
      `*👑 Owner*`,
      `› \`${p}mode\` — Toggle Private/Public`,
      `› \`${p}public\` — Switch to Public mode`,
      `› \`${p}private\` — Switch to Private mode`,
      ``,
      `_Prefix: \`${p}\`_`,
    ].join('\n'),
  }, { quoted: msg });
}

/** .toimg — convert a quoted sticker back to PNG */
export async function handleToImg(sock, msg) {
  const { downloadMediaMessage,
          getContentType }               = await import('@whiskeysockets/baileys');
  const { default: pino }                = await import('pino');
  const { execFile }                     = await import('child_process');
  const { promisify }                    = await import('util');
  const { writeFile, readFile, unlink }  = await import('fs/promises');
  const { tmpdir }                       = await import('os');
  const { join }                         = await import('path');
  const { randomUUID }                   = await import('crypto');

  const execFileAsync = promisify(execFile);
  const logger        = pino({ level: 'silent' });
  const jid           = msg.key.remoteJid;
  const contextInfo   = msg.message?.extendedTextMessage?.contextInfo;

  if (!contextInfo?.quotedMessage) {
    await sock.sendMessage(jid, { text: '❌ Reply to a *sticker* with `.toimg`.' }, { quoted: msg });
    return;
  }

  const quotedMsg = {
    key: {
      remoteJid:   jid,
      id:          contextInfo.stanzaId,
      fromMe:      contextInfo.participant === sock.user?.id,  // Bug 2 fix — was hardcoded false
      participant: contextInfo.participant,
    },
    message: contextInfo.quotedMessage,
  };

  if (getContentType(quotedMsg.message) !== 'stickerMessage') {
    await sock.sendMessage(jid, { text: '❌ That\'s not a sticker.' }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

  const id         = randomUUID();
  const inputPath  = join(tmpdir(), `wabot_sticker_${id}.webp`);
  const outputPath = join(tmpdir(), `wabot_sticker_${id}.png`);

  try {
    const webpBuf = await downloadMediaMessage(quotedMsg, 'buffer', {}, { logger });

    // Jimp v1 cannot decode WebP — use ffmpeg (already a dependency for stickers)
    await writeFile(inputPath, webpBuf);
    await execFileAsync('ffmpeg', ['-y', '-i', inputPath, outputPath]);
    const pngBuf = await readFile(outputPath);

    await sock.sendMessage(jid, {
      image:   pngBuf,
      caption: '🖼️ Here\'s your image!',
    }, { quoted: msg });

    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}



/** .public — makes the bot usable by anyone (Owner only) */
export async function handlePublic(sock, msg) {
  const { isOwner } = await import('../utils/permissions.js');
  if (!isOwner(msg.key.participant ?? msg.key.remoteJid)) return;

  config.private = false;
  await sock.sendMessage(msg.key.remoteJid, {
    text: '🔓 *Bot is now PUBLIC.*\nAnyone can use the commands.',
  }, { quoted: msg });
}

/** .private — restricts the bot to allowedNumbers (Owner only) */
export async function handlePrivate(sock, msg) {
  const { isOwner } = await import('../utils/permissions.js');
  if (!isOwner(msg.key.participant ?? msg.key.remoteJid)) return;

  config.private = true;
  await sock.sendMessage(msg.key.remoteJid, {
    text: '🔒 *Bot is now PRIVATE.*\nOnly authorized numbers can use it.',
  }, { quoted: msg });
}

/** .mode — Toggles between Public and Private mode (Owner only) */
export async function handleMode(sock, msg) {
  const { isOwner } = await import('../utils/permissions.js');
  if (!isOwner(msg.key.participant ?? msg.key.remoteJid)) return;

  config.private = !config.private;
  const status = config.private ? 'PRIVATE 🔒' : 'PUBLIC 🔓';
  const desc   = config.private 
    ? 'Only authorized numbers can use it.' 
    : 'Anyone can use the commands.';

  await sock.sendMessage(msg.key.remoteJid, {
    text: `⚙️ *Mode Toggled*\n\nStatus: *${status}*\n${desc}`,
  }, { quoted: msg });
}
