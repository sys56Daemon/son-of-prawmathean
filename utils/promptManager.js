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
        // Filter out full-line comments starting with '#' if any
        const cleaned = raw
          .split('\n')
          .filter(line => !line.trim().startsWith('#'))
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
    if (ctx.chatJid && ctx.chatJid !== jid) continue;

    if (ctx.systemContext) {
      matchedContext += `\n${ctx.systemContext}\n`;
    }

    if (Array.isArray(ctx.senders) && senderJid) {
      for (const s of ctx.senders) {
        if (s.pattern && senderJid.includes(s.pattern)) {
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
