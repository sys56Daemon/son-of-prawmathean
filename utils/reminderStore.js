import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REMINDERS_FILE = path.resolve(__dirname, '../data/reminders.json');

// Map of active timer IDs: timerId -> reminder object
const activeTimers = new Map();
// Global socket reference
let globalSock = null;

function loadRemindersFromFile() {
  try {
    const dir = path.dirname(REMINDERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(REMINDERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error('[reminders] Failed to load reminders file:', err.message);
  }
  return [];
}

function saveRemindersToFile(remindersList) {
  try {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(remindersList, null, 2), 'utf8');
  } catch (err) {
    console.error('[reminders] Failed to save reminders file:', err.message);
  }
}

/**
 * Format milliseconds into human readable string
 */
export function fmtDuration(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.round(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

/**
 * Parse human duration (e.g. 10m, 1h30m, 2d, 45s)
 */
export function parseDuration(str = '') {
  str = str.trim().toLowerCase();
  let ms = 0;
  const pattern = /(\d+)\s*(w|d|h|m|s)/g;
  let match;
  while ((match = pattern.exec(str)) !== null) {
    const val = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'w') ms += val * 7 * 24 * 3600_000;
    if (unit === 'd') ms += val * 24 * 3600_000;
    if (unit === 'h') ms += val * 3600_000;
    if (unit === 'm') ms += val * 60_000;
    if (unit === 's') ms += val * 1_000;
  }
  return ms > 0 ? ms : null;
}

/**
 * Schedule a loaded or newly created reminder object
 */
function scheduleReminder(reminder) {
  const now = Date.now();
  const delay = Math.max(0, reminder.targetTimestamp - now);

  const MAX_SET_TIMEOUT = 2147483647; // ~24.8 days in ms
  const actualTimeout = Math.min(delay, MAX_SET_TIMEOUT);

  const timerId = setTimeout(async () => {
    activeTimers.delete(timerId);

    // If remaining delay > MAX_SET_TIMEOUT, re-schedule
    const remaining = reminder.targetTimestamp - Date.now();
    if (remaining > 5000) {
      scheduleReminder(reminder);
      return;
    }

    // Remove from saved persistent list
    const currentList = loadRemindersFromFile().filter(r => r.id !== reminder.id);
    saveRemindersToFile(currentList);

    // Send the reminder
    if (globalSock) {
      try {
        await globalSock.sendMessage(reminder.jid, {
          text: `⏰ *Reminder!*\n\n@${reminder.sender.split('@')[0]}, you asked me to remind you:\n\n"${reminder.text}"`,
          mentions: [reminder.sender],
        });
      } catch (err) {
        console.error('[remind] Failed to send reminder:', err.message);
      }
    }
  }, actualTimeout);

  activeTimers.set(timerId, reminder);
  return timerId;
}

export function initReminders(sock) {
  globalSock = sock;
  // Clear any existing active timeouts if re-initing
  for (const tid of activeTimers.keys()) {
    clearTimeout(tid);
  }
  activeTimers.clear();

  const saved = loadRemindersFromFile();
  for (const reminder of saved) {
    scheduleReminder(reminder);
  }
}

/**
 * Create and persist a new reminder with NO maximum limit!
 */
export function addReminder({ jid, sender, text, targetTimestamp, ms }) {
  const reminder = {
    id: 'rem_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    jid,
    sender,
    text,
    createdAt: Date.now(),
    targetTimestamp: targetTimestamp || (Date.now() + ms),
  };

  const list = loadRemindersFromFile();
  list.push(reminder);
  saveRemindersToFile(list);

  scheduleReminder(reminder);
  return reminder;
}
