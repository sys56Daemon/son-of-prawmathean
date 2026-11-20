import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROMPTS_DIR = path.resolve(__dirname, '../prompts');

/**
 * Loads a markdown system prompt from the prompts directory and replaces template placeholders.
 * @param {string} filename - e.g. 'rick.md'
 * @param {Record<string, string>} replacements - Map of placeholder names to replacement values
 * @returns {string}
 */
export function loadPrompt(filename = 'rick.md', replacements = {}) {
  const filePath = path.join(PROMPTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`[promptManager] Warning: Prompt file not found: ${filePath}`);
    return '';
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    content = content.replace(regex, value ?? '');
  }
  return content.trim();
}

/**
 * Loads chat-specific custom contexts from prompts/custom_contexts.local.json (or custom_contexts.json).
 * Allows users to define private friends, group context, or rules without committing them to git.
 * @returns {Array<object>}
 */
export function loadCustomContexts() {
  const possibleFiles = [
    path.join(PROMPTS_DIR, 'custom_contexts.local.json'),
    path.join(PROMPTS_DIR, 'custom_contexts.json'),
  ];

  for (const file of possibleFiles) {
    if (fs.existsSync(file)) {
      try {
        const raw = fs.readFileSync(file, 'utf-8');
        // Filter out full-line comments starting with '#' or '//'
        const cleaned = raw
          .split('\n')
          .filter(line => {
            const trimmed = line.trim();
            return !trimmed.startsWith('#') && !trimmed.startsWith('//');
          })
          .join('\n');
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch (err) {
        console.warn(`[promptManager] Failed to parse custom context file ${file}:`, err.message);
      }
    }
  }
  return [];
}

import { resolvePhoneNumber, getNumber } from './permissions.js';

/**
 * Checks if a chat JID matches the target criteria.
 * Supports:
 *  - Exact string match (e.g. "120363433763376897@g.us" or "918075894293@s.whatsapp.net")
 *  - Array of JIDs (e.g. ["120363433763376897@g.us", "120363999999999999@g.us"])
 *  - Pattern / Phone / LID substring matching
 */
function isChatMatch(targetChat, currentJid) {
  if (!targetChat) return true; // if no chat restriction specified, it applies anywhere!
  if (Array.isArray(targetChat)) {
    return targetChat.some(c => isChatMatch(c, currentJid));
  }
  if (targetChat === currentJid) return true;
  if (currentJid && targetChat.length >= 10 && currentJid.includes(targetChat)) return true;

  // Check resolved phone number if currentJid is an LID DM
  const resolvedPhone = resolvePhoneNumber(currentJid);
  if (resolvedPhone && targetChat.includes(resolvedPhone)) return true;

  return false;
}

/**
 * Checks if a sender matches the sender pattern.
 * Supports phone number, LID, or partial digit matching.
 */
function isSenderMatch(pattern, senderJid) {
  if (!pattern || !senderJid) return false;
  if (senderJid.includes(pattern)) return true;

  const senderDigits = getNumber(senderJid);
  const patternDigits = pattern.replace(/\D/g, '');
  if (patternDigits && senderDigits === patternDigits) return true;

  const resolved = resolvePhoneNumber(senderJid);
  if (resolved && patternDigits && resolved === patternDigits) return true;

  return false;
}

/**
 * Finds applicable custom context and sender speaker tag for a given chat and sender.
 * @param {string} jid - Remote chat JID
 * @param {string} senderJid - Sender participant JID
 * @param {string} senderName - Push name
 * @returns {{ speakerTag: string, systemContext: string }}
 */
export function getChatContext(jid, senderJid, senderName = '') {
  const contexts = loadCustomContexts();
  let matchedContext = '';
  let customSpeakerTag = '';

  for (const ctx of contexts) {
    if (ctx.enabled === false) continue;

    // Check chat target: matches chatJid (single string or array) or chatJids
    const chatTargets = ctx.chatJids || ctx.chatJid;
    if (chatTargets && !isChatMatch(chatTargets, jid)) {
      continue;
    }

    // Check sender restriction on the whole context block if specified
    const contextSenders = ctx.targetSenders || ctx.userJids || ctx.users;
    if (contextSenders) {
      const allowedSenders = Array.isArray(contextSenders) ? contextSenders : [contextSenders];
      const senderMatched = allowedSenders.some(p => isSenderMatch(p, senderJid));
      if (!senderMatched) continue;
    }

    if (ctx.systemContext) {
      matchedContext += `\n${ctx.systemContext}\n`;
    }

    if (Array.isArray(ctx.senders) && senderJid) {
      for (const s of ctx.senders) {
        if (s.pattern && isSenderMatch(s.pattern, senderJid)) {
          customSpeakerTag = `[From: ${s.tag}${senderName ? ` - ${senderName}` : ''}]`;
          break;
        }
      }
    }
  }

  return {
    speakerTag: customSpeakerTag,
    systemContext: matchedContext.trim(),
  };
}
