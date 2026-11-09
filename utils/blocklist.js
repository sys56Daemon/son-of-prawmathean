import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BLOCKLIST_FILE = path.resolve(__dirname, '../data/blocklist.json');

// Map of bare numbers/LIDs -> metadata { phone?: string, jid?: string, name?: string, addedAt?: string }
let blocklistMap = new Map();

/** Strip everything except digits. */
function digits(str = '') {
  return String(str).replace(/\D/g, '');
}

/**
 * Load blocklist from disk
 */
function loadBlocklist() {
  try {
    const dir = path.dirname(BLOCKLIST_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(BLOCKLIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(BLOCKLIST_FILE, 'utf8'));
      blocklistMap.clear();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (typeof item === 'string') {
            const num = digits(item);
            if (num) blocklistMap.set(num, { id: num });
          } else if (item && item.id) {
            const num = digits(item.id);
            if (num) blocklistMap.set(num, item);
          }
        }
      }
    } else {
      fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[blocklist] Failed to load blocklist:', err.message);
  }
}

/**
 * Save blocklist to disk
 */
function saveBlocklist() {
  try {
    const list = [...blocklistMap.values()];
    fs.writeFileSync(BLOCKLIST_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('[blocklist] Failed to save blocklist:', err.message);
  }
}

loadBlocklist();

/**
 * Check if a number or JID is blocked
 */
export function isBlocked(jidOrNumber) {
  if (!jidOrNumber) return false;
  const num = digits(jidOrNumber);
  if (!num) return false;
  return blocklistMap.has(num);
}

/**
 * Add a number or JID to blocklist
 * @returns {boolean} true if newly added, false if already present
 */
export function addToBlocklist(jidOrNumber, meta = {}) {
  const num = digits(jidOrNumber);
  if (!num) return false;
  if (blocklistMap.has(num)) return false;
  blocklistMap.set(num, {
    id: num,
    phone: meta.phone || (meta.jid?.endsWith('@s.whatsapp.net') ? digits(meta.jid) : null),
    jid: meta.jid || (meta.phone ? `${digits(meta.phone)}@s.whatsapp.net` : null),
    name: meta.name || '',
    addedAt: new Date().toISOString(),
  });
  saveBlocklist();
  return true;
}

/**
 * Remove a number or JID from blocklist
 * @returns {boolean} true if removed, false if not found
 */
export function removeFromBlocklist(jidOrNumber) {
  const num = digits(jidOrNumber);
  if (!num) return false;
  if (!blocklistMap.has(num)) return false;
  blocklistMap.delete(num);
  saveBlocklist();
  return true;
}

/**
 * Get all blocked numbers with details
 */
export function getBlocklistDetails() {
  return [...blocklistMap.values()];
}

/**
 * Get all blocked IDs (backward compatible)
 * @returns {string[]}
 */
export function getBlocklist() {
  return [...blocklistMap.keys()];
}
