import config from '../config.js';
import { getStats } from '../utils/stats.js';
import { getNumber } from '../utils/permissions.js';
import { addToBlocklist, removeFromBlocklist, getBlocklist, getBlocklistDetails } from '../utils/blocklist.js';
import { disableChat, enableChat, getDisabledChats, isChatDisabled } from '../utils/chatfilter.js';

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

/** .stats / .log — shows usage stats, active users, stickers, groq requests */
export async function handleStats(sock, msg) {
  const jid = msg.key.remoteJid;
  const stats = getStats();
  const uptime = formatUptime(Date.now() - BOT_START_TIME);

  const usersList = Object.entries(stats.users || {});
  const uniqueUsersCount = usersList.length;

  // Sort top users by request count
  const topUsers = [...usersList]
    .sort((a, b) => (b[1].totalRequests || 0) - (a[1].totalRequests || 0))
    .slice(0, 5);

  let topUsersText = '';
  if (topUsers.length === 0) {
    topUsersText = '_(No user activity yet)_';
  } else {
    topUsersText = topUsers
      .map(([userJid, data], i) => {
        const phone = getNumber(userJid);
        const masked = phone ? `+${phone.slice(0, 4)}••••${phone.slice(-3)}` : 'Unknown';
        const displayName = data.name ? `${data.name} (${masked})` : masked;
        return `${i + 1}. *${displayName}*: ${data.totalRequests || 0} reqs (🎨 ${data.stickersConverted || 0} stickers | 🧠 ${data.groqRequests || 0} AI)`;
      })
      .join('\n');
  }

  const text = [
    `📊 *${config.botName} — Usage Statistics*`,
    ``,
    `⏱️ *Uptime:* ${uptime}`,
    `👥 *Unique Users:* ${uniqueUsersCount}`,
    `📨 *Total Requests:* ${stats.totalMessages || 0}`,
    `🎨 *Stickers Converted:* ${stats.totalStickersConverted || 0}`,
    `🧠 *Groq AI Requests:* ${stats.totalGroqRequests || 0}`,
    ``,
    `🏆 *Top Active Users:*`,
    topUsersText,
  ].join('\n');

  await sock.sendMessage(jid, { text }, { quoted: msg });
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
      `› \`${p}thinksay [-s] "think" "say"\` — Think vs Say meme image/sticker`,
      `› \`gay [-s]\` — Apply rainbow filter over an image/sticker`,
      ``,
      `*📋 General*`,
      `› \`${p}ping\` — Check latency & uptime`,
      `› \`${p}alive\` — Check if bot is online`,
      `› \`${p}info\` — Bot stats`,
      `› \`${p}stats\` — Usage statistics & user logs`,
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
      `› \`${p}langs\` — List supported language codes (alias: \`${p}languages\`)`,
      `› \`${p}define <word>\` — Dictionary definition`,
      `› \`${p}tts <text>\` — Text to voice note`,
      ``,
      `*🤖 AI (Groq)*`,
      `› \`yo <prompt>\` or \`hey p <prompt>\` — Chat with AI`,
      `› \`${p}ai <prompt>\` — Chat with AI`,
      ``,
      `*👑 Owner*`,
      `› \`${p}mode\` — Toggle Private/Public`,
      `› \`${p}public\` — Switch to Public mode`,
      `› \`${p}private\` — Switch to Private mode`,
      `› \`${p}disable\` — Disable bot in this chat`,
      `› \`${p}enable [jid]\` — Re-enable bot in this/target chat`,
      `› \`${p}disabledlist\` — List all disabled chats`,
      `› \`${p}ignore <num/@>\` — Ignore/block user`,
      `› \`${p}unignore <num/@>\` — Unblock user`,
      `› \`${p}ignorelist\` — View ignored users`,
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

/** .ignore [number|@mention] — ignore/blocklist a user (Owner only) */
export async function handleIgnore(sock, msg, args) {
  const { isOwner } = await import('../utils/permissions.js');
  const sender = msg.key.participant ?? msg.key.remoteJid;
  if (!isOwner(sender)) return;

  const jid = msg.key.remoteJid;
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = contextInfo?.mentionedJid || [];
  const quotedParticipant = contextInfo?.participant;

  let target = '';
  let meta = {};

  if (args.length > 0) {
    const rawArg = args.join(' ').trim();
    const digitsOnly = rawArg.replace(/[^\d+]/g, '');
    if (digitsOnly) {
      target = digitsOnly;
      meta.phone = digitsOnly.replace(/\D/g, '');
    }
  } else if (mentioned.length > 0) {
    target = mentioned[0];
    meta.jid = target;
  } else if (quotedParticipant) {
    target = quotedParticipant;
    meta.jid = target;
  }

  // If in a group, try to resolve phone number or name from group metadata
  if (jid.endsWith('@g.us')) {
    try {
      const gmeta = await sock.groupMetadata(jid);
      const targetNum = target.replace(/\D/g, '');
      const participant = gmeta.participants.find(p => 
        p.id === target || p.lid === target || p.jid === target ||
        getNumber(p.id) === targetNum || (p.lid && getNumber(p.lid) === targetNum) || (p.jid && getNumber(p.jid) === targetNum)
      );
      if (participant) {
        if (participant.jid) meta.phone = getNumber(participant.jid);
        if (participant.name || participant.notify) meta.name = participant.name || participant.notify;
      }
    } catch {
      // ignore
    }
  }

  if (!target) {
    await sock.sendMessage(jid, {
      text: '❌ Please specify a phone number, mention a user, or reply to their message.\nExample: `.ignore +919037972225`',
    }, { quoted: msg });
    return;
  }

  const cleanNum = target.replace(/\D/g, '');
  if (isOwner(target) || (meta.phone && isOwner(meta.phone))) {
    await sock.sendMessage(jid, {
      text: '⚠️ You cannot ignore/block the bot owner.',
    }, { quoted: msg });
    return;
  }

  const added = addToBlocklist(cleanNum, meta);
  const mentionJid = meta.jid || (meta.phone ? `${meta.phone}@s.whatsapp.net` : (cleanNum.length > 10 ? `${cleanNum}@s.whatsapp.net` : null));
  const displayText = meta.phone ? `+${meta.phone}` : (cleanNum.length <= 13 ? `+${cleanNum}` : `@${cleanNum}`);

  if (added) {
    await sock.sendMessage(jid, {
      text: `🚫 *Blocked & Ignored*: ${displayText}\nThe bot will now completely ignore all commands and interactions from this user.`,
      mentions: mentionJid ? [mentionJid] : [],
    }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, {
      text: `ℹ️ ${displayText} is already on the ignore list.`,
      mentions: mentionJid ? [mentionJid] : [],
    }, { quoted: msg });
  }
}

/** .unignore [number|@mention] — unignore/unblock a user (Owner only) */
export async function handleUnignore(sock, msg, args) {
  const { isOwner } = await import('../utils/permissions.js');
  const sender = msg.key.participant ?? msg.key.remoteJid;
  if (!isOwner(sender)) return;

  const jid = msg.key.remoteJid;
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = contextInfo?.mentionedJid || [];
  const quotedParticipant = contextInfo?.participant;

  let target = '';
  if (args.length > 0) {
    target = args.join(' ').replace(/[^\d+]/g, '');
  } else if (mentioned.length > 0) {
    target = mentioned[0];
  } else if (quotedParticipant) {
    target = quotedParticipant;
  }

  if (!target) {
    await sock.sendMessage(jid, {
      text: '❌ Please specify a phone number, mention a user, or reply to their message.\nExample: `.unignore +919037972225`',
    }, { quoted: msg });
    return;
  }

  const cleanNum = target.replace(/\D/g, '');
  const removed = removeFromBlocklist(cleanNum);
  if (removed) {
    await sock.sendMessage(jid, {
      text: `✅ *Removed from ignore list*: ${cleanNum.length <= 13 ? '+' + cleanNum : '@' + cleanNum}\nThe bot will now accept commands from this user again.`,
      mentions: [target.includes('@') ? target : `${cleanNum}@s.whatsapp.net`],
    }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, {
      text: `ℹ️ ${cleanNum} was not found on the ignore list.`,
    }, { quoted: msg });
  }
}

/** .ignorelist / .ignored / .blocklist — view all ignored numbers (Owner only) */
export async function handleIgnoreList(sock, msg) {
  const { isOwner } = await import('../utils/permissions.js');
  const sender = msg.key.participant ?? msg.key.remoteJid;
  if (!isOwner(sender)) return;

  const jid = msg.key.remoteJid;
  const list = getBlocklistDetails();

  if (list.length === 0) {
    await sock.sendMessage(jid, {
      text: '📋 *Ignore List is empty.*\nNo users or numbers are currently blocked.',
    }, { quoted: msg });
    return;
  }

  // Attempt to enrich any LIDs with groupMetadata if in a group
  let groupParticipants = [];
  if (jid.endsWith('@g.us')) {
    try {
      const gmeta = await sock.groupMetadata(jid);
      groupParticipants = gmeta.participants || [];
    } catch {
      // ignore
    }
  }

  const mentions = [];
  const lines = list.map((item, i) => {
    let phone = item.phone;
    let name = item.name;

    // Check if we can find this user in group metadata
    if (!phone && groupParticipants.length > 0) {
      const p = groupParticipants.find(gp => 
        gp.id === item.id || gp.lid === item.id || (gp.lid && getNumber(gp.lid) === item.id) ||
        (gp.jid && getNumber(gp.jid) === item.id) || getNumber(gp.id) === item.id
      );
      if (p) {
        if (p.jid) phone = getNumber(p.jid);
        if (p.name || p.notify) name = p.name || p.notify;
      }
    }

    if (item.jid) mentions.push(item.jid);
    else if (phone) mentions.push(`${phone}@s.whatsapp.net`);
    else if (item.id) mentions.push(`${item.id}@lid`);

    if (phone) {
      return `${i + 1}. +${phone}${name ? ` (${name})` : ''} — @${phone}`;
    } else {
      // Fallback: Mention by LID or ID
      return `${i + 1}. @${item.id}${name ? ` (${name})` : ''}`;
    }
  });

  await sock.sendMessage(jid, {
    text: `🚫 *Ignored Users (${list.length}):*\n\n${lines.join('\n')}\n\n_Use \`.unignore <number>\` to unblock._`,
    mentions,
  }, { quoted: msg });
}

/** .disable — disable bot in this chat (Owner only) */
export async function handleDisable(sock, msg) {
  const { isOwner } = await import('../utils/permissions.js');
  const sender = msg.key.participant ?? msg.key.remoteJid;
  if (!isOwner(sender)) return;

  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const chatType = isGroup ? 'group' : 'DM';

  const disabled = disableChat(jid);
  if (disabled) {
    await sock.sendMessage(jid, {
      text: `🔕 *Bot disabled in this ${chatType}.*\nI won't respond to any commands or messages here anymore.\n\n_Send \`.enable\` from another chat (DM me) or use \`.enable <jid>\` to restore._`,
    }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, {
      text: `ℹ️ Bot is already disabled in this ${chatType}.`,
    }, { quoted: msg });
  }
}

/** .enable [jid] — re-enable bot in this (or another) chat (Owner only) */
export async function handleEnable(sock, msg, args) {
  const { isOwner } = await import('../utils/permissions.js');
  const sender = msg.key.participant ?? msg.key.remoteJid;
  if (!isOwner(sender)) return;

  // If a JID argument is provided, re-enable that specific chat remotely
  const targetJid = args[0] ? args[0].trim() : msg.key.remoteJid;

  const enabled = enableChat(targetJid);
  const jid = msg.key.remoteJid;
  if (enabled) {
    await sock.sendMessage(jid, {
      text: `✅ *Bot re-enabled* in \`${targetJid}\`.\nCommands will work there again.`,
    }, { quoted: msg });
  } else {
    await sock.sendMessage(jid, {
      text: `ℹ️ \`${targetJid}\` wasn't disabled.`,
    }, { quoted: msg });
  }
}

/** .disabledlist / .disabledchats — list all disabled chats (Owner only) */
export async function handleDisabledList(sock, msg) {
  const { isOwner } = await import('../utils/permissions.js');
  const sender = msg.key.participant ?? msg.key.remoteJid;
  if (!isOwner(sender)) return;

  const jid = msg.key.remoteJid;
  const list = getDisabledChats();

  if (list.length === 0) {
    await sock.sendMessage(jid, {
      text: '📋 *No chats are currently disabled.*',
    }, { quoted: msg });
    return;
  }

  const formatted = list.map((chatJid, i) => {
    const type = chatJid.endsWith('@g.us') ? '👥 Group' : '👤 DM';
    return `${i + 1}. ${type}: \`${chatJid}\``;
  }).join('\n');

  await sock.sendMessage(jid, {
    text: `🔕 *Disabled Chats (${list.length}):*\n\n${formatted}\n\n_Use \`.enable <jid>\` to re-enable a specific chat._`,
  }, { quoted: msg });
}
