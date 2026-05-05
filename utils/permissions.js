import config from '../config.js';

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

/** True if the JID belongs to the configured owner. */
export function isOwner(jid) {
  if (config.ownerNumber === PLACEHOLDER) return false;
  return getNumber(jid) === digits(config.ownerNumber);
}

/**
 * True if the sender is allowed to use the bot.
 *
 * Rules (evaluated in order):
 *  1. If ownerNumber is still the placeholder → allow everyone + print a warning.
 *  2. If private: false → allow everyone.
 *  3. If sender is the owner → allow.
 *  4. If sender is in allowedNumbers → allow.
 *  5. Otherwise → deny (silently).
 */
export function isAllowed(jid) {
  // Config not set yet — open to all so the bot isn't silently dead
  if (config.ownerNumber === PLACEHOLDER) {
    return true;
  }
  if (!config.private) return true;
  if (isOwner(jid))    return true;

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
    const p = meta.participants.find(
      p => p.id === participantJid || getNumber(p.id) === getNumber(participantJid)
    );
    return p?.admin ?? null;
  } catch {
    return null;
  }
}

export async function isGroupAdmin(sock, groupJid, participantJid) {
  const role = await getGroupRole(sock, groupJid, participantJid);
  return role === 'admin' || role === 'superadmin';
}

export async function isBotAdmin(sock, groupJid) {
  return isGroupAdmin(sock, groupJid, sock.user.id);
}
