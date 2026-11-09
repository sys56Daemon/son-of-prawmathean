import { isGroupAdmin, isBotAdmin } from '../utils/permissions.js';

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

function getTargets(msg, args = []) {
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const mentioned = contextInfo?.mentionedJid ?? [];
  const quoted = contextInfo?.participant;

  const targets = new Set(mentioned);
  if (quoted) {
    targets.add(quoted);
  }
  for (const arg of args) {
    const clean = arg.replace(/[^\d+@a-z._-]/gi, '');
    if (clean.includes('@')) {
      targets.add(clean);
    } else if (/^\+?\d{7,15}$/.test(clean)) {
      targets.add(clean.replace(/\D/g, '') + '@s.whatsapp.net');
    }
  }
  return [...targets];
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
  const customMsg    = args.join(' ') || '\t';

  const tagList = participants.map(p => `@${p.id.split('@')[0]}`).join(' ');
  await sock.sendMessage(jid, {
    text:     `${customMsg}\n\n${tagList}`,
    mentions,
  }, { quoted: msg });
}

async function resolveTargetsToGroupJids(sock, groupJid, rawTargets) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const participants = meta.participants || [];

    return rawTargets.map(target => {
      const targetBare = target.split('@')[0].split(':')[0];
      const found = participants.find(p => {
        if (p.id && p.id.split('@')[0].split(':')[0] === targetBare) return true;
        if (p.lid && p.lid.split('@')[0].split(':')[0] === targetBare) return true;
        if (p.jid && p.jid.split('@')[0].split(':')[0] === targetBare) return true;
        return false;
      });

      if (found) {
        // If the group addressingMode is 'lid', WhatsApp expects lid; otherwise jid / phone
        if (meta.addressingMode === 'lid') {
          return found.lid || found.id;
        } else {
          return found.jid || (found.id.endsWith('@s.whatsapp.net') ? found.id : null) || found.id;
        }
      }
      return target;
    });
  } catch {
    return rawTargets;
  }
}

/** .kick @user — removes mentioned members or replied-to user from the group */
export async function handleKick(sock, msg, args = []) {
  if (!(await requireGroup(sock, msg)))   return;
  if (!(await requireAdmin(sock, msg)))   return;
  if (!(await requireBotAdmin(sock, msg))) return;

  const jid     = msg.key.remoteJid;
  const rawTargets = getTargets(msg, args);

  if (rawTargets.length === 0) {
    await sock.sendMessage(jid, { text: '❌ Mention or reply to the user(s) to kick.' }, { quoted: msg });
    return;
  }

  const targets = await resolveTargetsToGroupJids(sock, jid, rawTargets);
  await sock.groupParticipantsUpdate(jid, targets, 'remove');
  await sock.sendMessage(jid, {
    text: `✅ Kicked ${targets.length} member(s).`,
  }, { quoted: msg });
}

/** .promote @user — promotes mentioned members or replied-to user to admin */
export async function handlePromote(sock, msg, args = []) {
  if (!(await requireGroup(sock, msg)))   return;
  if (!(await requireAdmin(sock, msg)))   return;
  if (!(await requireBotAdmin(sock, msg))) return;

  const jid     = msg.key.remoteJid;
  const rawTargets = getTargets(msg, args);

  if (rawTargets.length === 0) {
    await sock.sendMessage(jid, { text: '❌ Mention or reply to the user(s) to promote.' }, { quoted: msg });
    return;
  }

  const targets = await resolveTargetsToGroupJids(sock, jid, rawTargets);
  await sock.groupParticipantsUpdate(jid, targets, 'promote');
  const names = rawTargets.map(j => `@${j.split('@')[0]}`).join(', ');
  await sock.sendMessage(jid, {
    text:     `⬆️ Promoted ${names} to admin.`,
    mentions: rawTargets,
  }, { quoted: msg });
}

/** .demote @user — removes admin from mentioned members or replied-to user */
export async function handleDemote(sock, msg, args = []) {
  if (!(await requireGroup(sock, msg)))   return;
  if (!(await requireAdmin(sock, msg)))   return;
  if (!(await requireBotAdmin(sock, msg))) return;

  const jid     = msg.key.remoteJid;
  const rawTargets = getTargets(msg, args);

  if (rawTargets.length === 0) {
    await sock.sendMessage(jid, { text: '❌ Mention or reply to the user(s) to demote.' }, { quoted: msg });
    return;
  }

  const targets = await resolveTargetsToGroupJids(sock, jid, rawTargets);
  await sock.groupParticipantsUpdate(jid, targets, 'demote');
  const names = rawTargets.map(j => `@${j.split('@')[0]}`).join(', ');
  await sock.sendMessage(jid, {
    text:     `⬇️ Removed admin from ${names}.`,
    mentions: rawTargets,
  }, { quoted: msg });
}
