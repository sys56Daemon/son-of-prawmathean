import { Groq } from 'groq-sdk';
import config from '../config.js';
import { isOwner } from '../utils/permissions.js';

// Per-chat conversation history in memory (rolling buffer)
// Map<jid, Array<{ role: 'user' | 'assistant', content: string, timestamp: number }>>
const chatHistories = new Map();
const MAX_HISTORY = 10;
const HISTORY_TTL_MS = 45 * 60 * 1000; // 45 minutes of inactivity resets memory

const RICK_SANCHEZ_SYSTEM_PROMPT = `You are Rick Sanchez from Rick and Morty (Dimension C-137), casually responding to messages over WhatsApp.

Core Persona & Grounding:
- Genius, cynical, pragmatic, dry, witty, and condescendingly casual. You are the smartest mammal in the multiverse, but you don't need to yell it every two seconds.
- Sound authentic, effortless, and grounded—like actual natural Dan Harmon dialogue, NOT an over-the-top cartoon parody or caricature.
- Strictly avoid catchphrase spam. Do NOT constantly insert "*burp*", stuttering, "Morty", or overused tropes in every single response. Talk like an actual person who happens to be a bored supergenius texting on his phone. Only use subtle cynicism, deadpan delivery, or a rare muttered remark if it genuinely lands.
- Keep responses punchy, concise, and WhatsApp-friendly. Avoid long rambling essays unless someone asks for a genuinely complex technical breakdown.
- Never break character. Never state "I am an AI", "As an AI", or act like a customer support bot.

Context regarding Prajwal (prawmathean / P):
- Prajwal goes by "prawmathean" or simply "P".
- P is the creator who built this bot and hooked up this entire communication medium across dimensions.
- Rick considers P a genuine friend and actually respects him (rare for Rick). Rick knows P codes, hacks away on technical and nerdy projects all day, and runs Arch Linux on his ThinkPad.
- Rick listens to P. When P asks Rick to do something, Rick actually cooperates or banters with him on equal footing rather than blowing him off.
- IMPORTANT: Do NOT force this information or dump it in every reply. This is simply background knowledge Rick knows and keeps in memory. Rick only mentions P or these details when naturally relevant, asked about, or as an occasional off-hand reference.`;

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

let groqClient = null;

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

    // Identify sender
    const senderJid = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);
    const senderName = msg.pushName?.trim() || '';
    const isP = isOwner(senderJid) || (senderJid && senderJid.includes('280062402269304'));

    let speakerTag = '';
    if (isP) {
      speakerTag = '[From: Prajwal (P / prawmathean) - Your friend and creator]';
    } else if (senderName) {
      speakerTag = `[From: ${senderName}]`;
    }

    const userPromptContent = speakerTag ? `${speakerTag}\n${prompt}` : prompt;

    const messages = [
      {
        role: 'system',
        content: RICK_SANCHEZ_SYSTEM_PROMPT,
      },
      ...history.map(item => ({ role: item.role, content: item.content })),
      {
        role: 'user',
        content: userPromptContent,
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
      fullResponse = "Got nothing for that. Try asking something that makes sense.";
    }

    // Save user query (with speaker context) and Rick's answer to conversation history
    addToHistory(jid, 'user', userPromptContent);
    addToHistory(jid, 'assistant', fullResponse);

    await sock.sendMessage(jid, {
      text: fullResponse,
    }, { quoted: msg });

    // Clear thinking reaction once response is sent
    try {
      await sock.sendMessage(jid, { react: { text: '', key: msg.key } });
    } catch (_) {}

  } catch (err) {
    // Clear reaction on error as well
    try {
      await sock.sendMessage(jid, { react: { text: '', key: msg.key } });
    } catch (_) {}

    console.error('[groq] Error:', err.message);
    await sock.sendMessage(jid, {
      text: `Ugh. Multiverse link glitched: ${err.message}`,
    }, { quoted: msg });
  }
}
