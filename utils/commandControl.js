import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMMAND_RULES_FILE = path.resolve(__dirname, '../data/disabled_commands.json');

// Set of disabled command names (lowercased)
let disabledCommands = new Set();

// Command canonical mapping / aliases so disabling 'ai' or 'groq' works seamlessly
const COMMAND_ALIASES = {
  ai: 'ai',
  groq: 'ai',
  give: 'give',
  viewonce: 'give',
  vo: 'give',
  sticker: 'sticker',
  s: 'sticker',
  toimg: 'toimg',
  qr: 'qr',
  tagall: 'tagall',
  insta: 'insta',
  instagram: 'insta',
  pet: 'petpet',
  petpet: 'petpet',
  thinksay: 'thinksay',
  think: 'thinksay',
  gay: 'gay',
  rainbow: 'gay',
  remind: 'remind',
  reminder: 'remind',
  calc: 'calc',
  weather: 'weather',
  translate: 'translate',
  tr: 'translate',
  tts: 'tts',
};

/**
 * Resolves a command or alias to its primary canonical name.
 * @param {string} cmd
 * @returns {string}
 */
export function canonicalCommand(cmd = '') {
  const lower = cmd.trim().toLowerCase();
  return COMMAND_ALIASES[lower] || lower;
}

function loadDisabledCommands() {
  try {
    const dir = path.dirname(COMMAND_RULES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(COMMAND_RULES_FILE)) {
      const data = JSON.parse(fs.readFileSync(COMMAND_RULES_FILE, 'utf8'));
      if (Array.isArray(data)) {
        disabledCommands = new Set(data.map(canonicalCommand).filter(Boolean));
      }
    } else {
      fs.writeFileSync(COMMAND_RULES_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.error('[commandControl] Failed to load disabled commands:', err.message);
  }
}

function saveDisabledCommands() {
  try {
    fs.writeFileSync(COMMAND_RULES_FILE, JSON.stringify([...disabledCommands], null, 2), 'utf8');
  } catch (err) {
    console.error('[commandControl] Failed to save disabled commands:', err.message);
  }
}

loadDisabledCommands();

/**
 * Check if a command is globally disabled.
 * @param {string} cmd
 * @returns {boolean}
 */
export function isCommandDisabled(cmd = '') {
  if (!cmd) return false;
  const canonical = canonicalCommand(cmd);
  return disabledCommands.has(canonical);
}

/**
 * Globally disable a command or feature.
 * @param {string} cmd
 * @returns {string|null} Canonical name if newly disabled, null if already disabled
 */
export function disableCommand(cmd = '') {
  const canonical = canonicalCommand(cmd);
  if (!canonical || disabledCommands.has(canonical)) return null;
  disabledCommands.add(canonical);
  saveDisabledCommands();
  return canonical;
}

/**
 * Globally re-enable a command or feature.
 * @param {string} cmd
 * @returns {string|null} Canonical name if newly enabled, null if wasn't disabled
 */
export function enableCommand(cmd = '') {
  const canonical = canonicalCommand(cmd);
  if (!canonical || !disabledCommands.has(canonical)) return null;
  disabledCommands.delete(canonical);
  saveDisabledCommands();
  return canonical;
}

/**
 * Get list of all currently disabled commands.
 * @returns {string[]}
 */
export function getDisabledCommands() {
  return [...disabledCommands];
}
