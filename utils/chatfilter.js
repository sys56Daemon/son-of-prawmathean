import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FILTER_FILE = path.resolve(__dirname, '../data/disabled_chats.json');

// Set of disabled chat JIDs (group or DM JIDs)
let disabledChats = new Set();

function loadDisabledChats() {
  try {
    const dir = path.dirname(FILTER_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(FILTER_FILE)) {
      const data = JSON.parse(fs.readFileSync(FILTER_FILE, 'utf8'));
      if (Array.isArray(data)) {
        disabledChats = new Set(data.filter(Boolean));
      }
    } else {
      fs.writeFileSync(FILTER_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[chatfilter] Failed to load disabled chats:', err.message);
  }
}

function saveDisabledChats() {
  try {
    fs.writeFileSync(FILTER_FILE, JSON.stringify([...disabledChats], null, 2), 'utf8');
  } catch (err) {
    console.error('[chatfilter] Failed to save disabled chats:', err.message);
  }
}

loadDisabledChats();

/** Check if the bot is disabled in a given chat JID */
export function isChatDisabled(chatJid) {
  return disabledChats.has(chatJid);
}

/**
 * Disable the bot in a chat
 * @returns {boolean} true if newly disabled, false if already disabled
 */
export function disableChat(chatJid) {
  if (disabledChats.has(chatJid)) return false;
  disabledChats.add(chatJid);
  saveDisabledChats();
  return true;
}

/**
 * Enable the bot in a previously disabled chat
 * @returns {boolean} true if re-enabled, false if it wasn't disabled
 */
export function enableChat(chatJid) {
  if (!disabledChats.has(chatJid)) return false;
  disabledChats.delete(chatJid);
  saveDisabledChats();
  return true;
}

/** Get list of all disabled chat JIDs */
export function getDisabledChats() {
  return [...disabledChats];
}
