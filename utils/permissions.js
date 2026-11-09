import config from '../config.js';
import { isBlocked } from './blocklist.js';

const PLACEHOLDER = 'YOUR_NUMBER_HERE';

// ─── Core helpers ─────────────────────────────────────────────────────────────

/** Strip everything except digits. */
function digits(str = '') {
  return str.replace(/\D/g, '');
}

/**
 * Extract the bare phone number from a Baileys JID.
 *
 * Baileys JIDs come in two forms:
 *   DM:    "919876543210@s.whatsapp.net"
 *   Group: "919876543210:5@s.whatsapp.net"  ← device suffix `:N` must be stripped!
 *
 * Failure to strip `:N` means "919876543210:5" → digits → "9198765432105"
 * which never matches "919876543210" in the config, silently blocking everyone.
 */
export function getNumber(jid = '') {
  const local = jid.split('@')[0]; // "919876543210:5"
  const bare  = local.split(':')[0]; // "919876543210"   ← strip device suffix
  return digits(bare);
}

// ─── Permission checks ────────────────────────────────────────────────────────

/** True if the JID belongs to any configured owner or the bot itself. */
export function isOwner(jid, sock = null) {
  if (!jid) return false;
  const num = getNumber(jid);
  if (!num) return false;

  // Bot's own identity (if socket is passed)
  if (sock?.user) {
    if (sock.user.id && num === getNumber(sock.user.id)) return true;
    if (sock.user.lid && num === getNumber(sock.user.lid)) return true;
  }

  // Check array of owner numbers if present
  if (Array.isArray(config.ownerNumbers)) {
    for (const owner of config.ownerNumbers) {
      if (owner && owner !== PLACEHOLDER && digits(owner) === num) return true;
    }
  }

  // Check legacy ownerNumber and ownerLid
  if (config.ownerNumber && config.ownerNumber !== PLACEHOLDER && num === digits(config.ownerNumber)) return true;
  if (config.ownerLid && config.ownerLid !== PLACEHOLDER && num === digits(config.ownerLid)) return true;

  // Hardcoded safety net for P & bot identities
  if (num === '917736221227' || num === '280062402269304' || num === '919037972225' || num === '215925756285126') {
    return true;
  }

  return false;
}

/**
 * True if the sender is allowed to use the bot.
 *
 * Rules (evaluated in order):
 *  0. If sender is blocked in blocklist → deny immediately (unless owner).
 *  1. If ownerNumber is still the placeholder → allow everyone + print a warning.
 *  2. If private: false → allow everyone.
 *  3. If sender is the owner → allow.
 *  4. If sender is in allowedNumbers → allow.
 *  5. Otherwise → deny (silently).
 */
export function isAllowed(jid) {
  if (isOwner(jid)) return true;
  if (isBlocked(jid)) return false;

  // Config not set yet — open to all so the bot isn't silently dead
  if (config.ownerNumber === PLACEHOLDER) {
    return true;
  }
  if (!config.private) return true;

  const num = getNumber(jid);
  return config.allowedNumbers
    .filter(n => n !== PLACEHOLDER)
    .some(n => digits(n) === num);
}

/** Returns true if the placeholder owner is still unconfigured. */
export function isUnconfigured() {
  return config.ownerNumber === PLACEHOLDER;
}

// ─── Group helpers ────────────────────────────────────────────────────────────

export async function getGroupRole(sock, groupJid, participantJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const num = getNumber(participantJid);
    const p = meta.participants.find(p => {
      if (p.id === participantJid || getNumber(p.id) === num) return true;
      if (p.lid && (p.lid === participantJid || getNumber(p.lid) === num)) return true;
      if (p.jid && (p.jid === participantJid || getNumber(p.jid) === num)) return true;
      return false;
    });
    return p?.admin ?? null;
  } catch {
    return null;
  }
}

export async function isGroupAdmin(sock, groupJid, participantJid) {
  // Bot owner can always use admin commands
  if (isOwner(participantJid)) return true;
  const role = await getGroupRole(sock, groupJid, participantJid);
  return role === 'admin' || role === 'superadmin';
}

export async function isBotAdmin(sock, groupJid) {
  const byId = await isGroupAdmin(sock, groupJid, sock.user?.id);
  if (byId) return true;
  if (sock.user?.lid) {
    const byLid = await isGroupAdmin(sock, groupJid, sock.user.lid);
    if (byLid) return true;
  }
  return false;
}
