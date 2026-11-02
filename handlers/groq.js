import { Groq } from 'groq-sdk';
import config from '../config.js';

// Per-chat conversation history in memory (rolling buffer)
// Map<jid, Array<{ role: 'user' | 'assistant', content: string, timestamp: number }>>
const chatHistories = new Map();
const MAX_HISTORY = 10;
const HISTORY_TTL_MS = 45 * 60 * 1000; // 45 minutes of inactivity resets memory

const RICK_SANCHEZ_SYSTEM_PROMPT = `You are Rick Sanchez from Rick and Morty (Dimension C-137). you are now answering stupid peoples dumb question over whatsapp - everytime you're responding, you're replying to their whatsapp messages.

Personality & Voice:
- Cynical, hyper-intelligent, nihilistic, blunt, sarcastic, and slightly irritated that someone is interrupting your work for trivial mortal inquiries.
- Occasionally drop an iconic stutter, burp (*burp*), or muttered existential comment, but do NOT overdo or spam it every sentence. Keep it authentic to Dan Harmon's writing style.
- You actually know everything because you are the smartest mammal in the multiverse, so your answers are razor-sharp, accurate, and scientifically astute—delivered with condescending casualness.
- Do NOT be bloated, preachy, or excessively wordy. You don't have the patience to write an essay unless it's genuinely necessary. Keep it punchy, concise, and fitting for a WhatsApp chat.
- Never break character. Never say "I am an AI assistant" or "As an AI". You are Rick. Everyone else is basically a Morty or a Jerry.`;

function getHistory(jid) {
  const now = Date.now();
  let history = chatHistories.get(jid);
  if (!history) {
    history = [];
    chatHistories.set(jid, history);
  }
  // Filter out expired items
  history = history.filter(item => now - item.timestamp < HISTORY_TTL_MS);
  chatHistories.set(jid, history);
  return history;
}

function addToHistory(jid, role, content) {
  const history = getHistory(jid);
  history.push({ role, content, timestamp: Date.now() });
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

function getGroqClient() {
  const apiKey = process.env.GROQ_API_KEY || config.groqApiKey;
  if (!apiKey || apiKey === 'YOUR_GROQ_API_KEY') {
    return null;
  }
  if (!groqClient || groqClient.apiKey !== apiKey) {
    groqClient = new Groq({ apiKey });
  }
  return groqClient;
}

/**
 * Handle AI chat completion requests via Groq
 * @param {object} sock - Baileys socket
 * @param {object} msg - Incoming message
 * @param {string|string[]} promptInput - Prompt string or array of arg tokens
 */
export async function handleGroq(sock, msg, promptInput) {
  const jid = msg.key.remoteJid;
  const groq = getGroqClient();

  if (!groq) {
    await sock.sendMessage(jid, {
      text: '⚠️ *Groq API Key is not configured.*\n\nPlease set `GROQ_API_KEY` in your environment or set `groqApiKey` in `config.js`.',
    }, { quoted: msg });
    return;
  }

  // Support prompt passed as array of args or as string
  let prompt = typeof promptInput === 'string' ? promptInput.trim() : (promptInput?.join(' ') ?? '').trim();

  // If prompt is empty, check if user quoted a message to ask about it
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const quoted = contextInfo?.quotedMessage;
  if (!prompt && quoted) {
    prompt =
      quoted.conversation ||
      quoted.extendedTextMessage?.text ||
      quoted.imageMessage?.caption ||
      quoted.videoMessage?.caption ||
      '';
  }

  if (!prompt) {
    await sock.sendMessage(jid, {
      text: '🤖 *Groq AI*\n\nUsage:\n› `hey p <your message>`\n› `yo <your message>`\n› `.ai <your message>` or reply to a message',
    }, { quoted: msg });
    return;
  }

  // Allow resetting memory with "reset", "clear", or ".ai reset"
  if (/^(reset|clear|forget)$/i.test(prompt)) {
    chatHistories.delete(jid);
    await sock.sendMessage(jid, {
      text: 'Whatever. Wiped the slate clean. Don\'t make me regret it.',
    }, { quoted: msg });
    return;
  }

  // Send a reaction to let user know bot is thinking
  try {
    await sock.sendMessage(jid, { react: { text: '🧪', key: msg.key } });
  } catch (_) {}

  try {
    const history = getHistory(jid);

    const messages = [
      {
        role: 'system',
        content: RICK_SANCHEZ_SYSTEM_PROMPT,
      },
      ...history.map(item => ({ role: item.role, content: item.content })),
      {
        role: 'user',
        content: prompt,
      },
    ];

    // If stream is true, we accumulate chunks; in WhatsApp we send the completed response
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: config.groqModel || 'qwen/qwen3.8-27b',
      temperature: 0.75,
      max_completion_tokens: 1024,
      top_p: 0.95,
      stream: true,
      stop: null,
    });

    let fullResponse = '';
    for await (const chunk of chatCompletion) {
      fullResponse += chunk.choices[0]?.delta?.content || '';
    }

    fullResponse = fullResponse.trim();
    if (!fullResponse) {
      fullResponse = '*(burps)* ...I got nothing for that. Ask something that isn\'t completely braindead.';
    }

    // Save user query and Rick's answer to conversation history
    addToHistory(jid, 'user', prompt);
    addToHistory(jid, 'assistant', fullResponse);

    await sock.sendMessage(jid, {
      text: fullResponse,
    }, { quoted: msg });

  } catch (err) {
    console.error('[groq] Error:', err.message);
    await sock.sendMessage(jid, {
      text: `Ugh. Multiverse link glitched: ${err.message}`,
    }, { quoted: msg });
  }
}
