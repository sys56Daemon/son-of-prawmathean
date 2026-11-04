import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATS_FILE = path.resolve(__dirname, '../data/stats.json');

// In-memory cache
let stats = {
  totalMessages: 0,
  totalGroqRequests: 0,
  totalStickersConverted: 0,
  commands: {},
  users: {},
  firstSeen: new Date().toISOString(),
  lastUpdated: new Date().toISOString()
};

// Ensure data folder and load initial data
try {
  const dir = path.dirname(STATS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (fs.existsSync(STATS_FILE)) {
    const raw = fs.readFileSync(STATS_FILE, 'utf8');
    stats = Object.assign(stats, JSON.parse(raw));
  } else {
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
  }
} catch (err) {
  console.error('[stats] Failed to initialize stats file:', err.message);
}

// Debounced save to minimize disk I/O on busy chats
let saveTimeout = null;
function persistStats() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      stats.lastUpdated = new Date().toISOString();
      fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2), 'utf8');
    } catch (err) {
      console.error('[stats] Failed to persist stats:', err.message);
    }
  }, 1000);
}

/**
 * Ensure a user record exists in stats.users
 */
function ensureUser(userJid, pushName = '') {
  if (!stats.users[userJid]) {
    stats.users[userJid] = {
      name: pushName || '',
      totalRequests: 0,
      groqRequests: 0,
      stickersConverted: 0,
      commands: {},
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
  } else {
    if (pushName && stats.users[userJid].name !== pushName) {
      stats.users[userJid].name = pushName;
    }
    stats.users[userJid].lastSeen = new Date().toISOString();
  }
  return stats.users[userJid];
}

/**
 * Record a general incoming valid message / command from a user
 */
export function trackRequest(userJid, pushName = '', command = '') {
  if (!userJid) return;
  stats.totalMessages = (stats.totalMessages || 0) + 1;

  const u = ensureUser(userJid, pushName);
  u.totalRequests = (u.totalRequests || 0) + 1;

  if (command) {
    stats.commands = stats.commands || {};
    stats.commands[command] = (stats.commands[command] || 0) + 1;

    u.commands = u.commands || {};
    u.commands[command] = (u.commands[command] || 0) + 1;
  }

  persistStats();
}

/**
 * Track Groq AI interaction
 */
export function trackGroqRequest(userJid, pushName = '') {
  stats.totalGroqRequests = (stats.totalGroqRequests || 0) + 1;
  if (userJid) {
    const u = ensureUser(userJid, pushName);
    u.groqRequests = (u.groqRequests || 0) + 1;
  }
  persistStats();
}

/**
 * Track successful sticker conversion
 */
export function trackStickerConversion(userJid, pushName = '') {
  stats.totalStickersConverted = (stats.totalStickersConverted || 0) + 1;
  if (userJid) {
    const u = ensureUser(userJid, pushName);
    u.stickersConverted = (u.stickersConverted || 0) + 1;
  }
  persistStats();
}

/**
 * Get current stats snapshot
 */
export function getStats() {
  return stats;
}
