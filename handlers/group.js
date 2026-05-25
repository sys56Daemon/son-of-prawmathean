import { isGroupAdmin, isBotAdmin, isOwner } from '../utils/permissions.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isGroup(jid) {
  return jid.endsWith('@g.us');
}

async function requireGroup(sock, msg) {
  if (!isGroup(msg.key.remoteJid)) {
    await sock.sendMessage(msg.key.remoteJid, {
      text: '❌ This command can only be used in *groups*.',
    }, { quoted: msg });
    return false;
  }
  return true;
}

async function requireAdmin(sock, msg) {
  const jid    = msg.key.remoteJid;
  const sender = msg.key.participant ?? msg.key.remoteJid;

  // Owner bypass
  if (msg.key.fromMe || isOwner(sender)) return true;

  const admin  = await isGroupAdmin(sock, jid, sender);
  if (!admin) {
    await sock.sendMessage(jid, {
      text: '❌ Only *group admins* can use this command.',
    }, { quoted: msg });
  }
  return admin;
}

async function requireBotAdmin(sock, msg) {
  const jid      = msg.key.remoteJid;
  const botAdmin = await isBotAdmin(sock, jid);
  if (!botAdmin) {
    await sock.sendMessage(jid, {
      text: '❌ I need to be a *group admin* to do that.',
    }, { quoted: msg });
  }
  return botAdmin;
}

function getMentioned(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? [];
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/** .tagall [message] — mentions every member in the group */
export async function handleTagAll(sock, msg, args) {
  if (!(await requireGroup(sock, msg)))  return;
  if (!(await requireAdmin(sock, msg)))  return;

  const jid  = msg.key.remoteJid;
  const meta = await sock.groupMetadata(jid);
  const participants = meta.participants;
  const mentions     = participants.map(p => p.id);
  const customMsg    = args.trim() || '\t';

  const tagList = participants.map(p => `@${p.id.split('@')[0]}`).join(' ');
  await sock.sendMessage(jid, {
    text:     `${customMsg}\n\n${tagList}`,
    mentions,
  }, { quoted: msg });
}

/** .kick @user — removes mentioned members from the group */
export async function handleKick(sock, msg) {
  if (!(await requireGroup(sock, msg)))   return;
  if (!(await requireAdmin(sock, msg)))   return;
  if (!(await requireBotAdmin(sock, msg))) return;

  const jid       = msg.key.remoteJid;
  const mentioned = getMentioned(msg);

  if (mentioned.length === 0) {
    await sock.sendMessage(jid, { text: '❌ Mention the user(s) to kick.' }, { quoted: msg });
    return;
  }

  await sock.groupParticipantsUpdate(jid, mentioned, 'remove');
  await sock.sendMessage(jid, {
    text: `✅ Kicked ${mentioned.length} member(s).`,
  }, { quoted: msg });
}

/** .promote @user — promotes mentioned members to admin */
export async function handlePromote(sock, msg) {
  if (!(await requireGroup(sock, msg)))   return;
  if (!(await requireAdmin(sock, msg)))   return;
  if (!(await requireBotAdmin(sock, msg))) return;

  const jid       = msg.key.remoteJid;
  const mentioned = getMentioned(msg);

  if (mentioned.length === 0) {
    await sock.sendMessage(jid, { text: '❌ Mention the user(s) to promote.' }, { quoted: msg });
    return;
  }

  await sock.groupParticipantsUpdate(jid, mentioned, 'promote');
  const names = mentioned.map(j => `@${j.split('@')[0]}`).join(', ');
  await sock.sendMessage(jid, {
    text:     `⬆️ Promoted ${names} to admin.`,
    mentions: mentioned,
  }, { quoted: msg });
}

/** .demote @user — removes admin from mentioned members */
export async function handleDemote(sock, msg) {
  if (!(await requireGroup(sock, msg)))   return;
  if (!(await requireAdmin(sock, msg)))   return;
  if (!(await requireBotAdmin(sock, msg))) return;

  const jid       = msg.key.remoteJid;
  const mentioned = getMentioned(msg);

  if (mentioned.length === 0) {
    await sock.sendMessage(jid, { text: '❌ Mention the user(s) to demote.' }, { quoted: msg });
    return;
  }

  await sock.groupParticipantsUpdate(jid, mentioned, 'demote');
  const names = mentioned.map(j => `@${j.split('@')[0]}`).join(', ');
  await sock.sendMessage(jid, {
    text:     `⬇️ Removed admin from ${names}.`,
    mentions: mentioned,
  }, { quoted: msg });
}
