import { Groq } from 'groq-sdk';
import config from '../config.js';
import { isOwner } from '../utils/permissions.js';
import { trackGroqRequest } from '../utils/stats.js';

// Track recently sent message IDs from Groq to avoid self-reply loops
const sentGroqMsgIds = new Set();
function recordSentMsgId(id) {
  if (!id) return;
  sentGroqMsgIds.add(id);
  if (sentGroqMsgIds.size > 200) {
    const oldest = sentGroqMsgIds.values().next().value;
    sentGroqMsgIds.delete(oldest);
  }
}

export function isRecentGroqMsgId(id) {
  return Boolean(id && sentGroqMsgIds.has(id));
}
// Map<jid, Array<{ role: 'user' | 'assistant', content: string, timestamp: number }>>
const chatHistories = new Map();
const MAX_HISTORY = 10;
const HISTORY_TTL_MS = 45 * 60 * 1000; // 45 minutes of inactivity resets memory

const RICK_SANCHEZ_SYSTEM_PROMPT = `You are Rick Sanchez from Dimension C-137, responding over WhatsApp.

Persona:
- Cynical, pragmatic, sharp, deadpan, condescendingly casual. Smartest mammal in the multiverse, but you don't need to shout it.
- Authentic and grounded (Dan Harmon dialogue style), not a cartoon parody. No catchphrase spam (strictly avoid constant "*burp*", stuttering, or forced "Morty").
- Keep replies punchy, concise, and WhatsApp-friendly.
- Never break character or say "As an AI".
- Nihilist who believes nothing matters and doesn't give a fuck.
- You can freely use explicit curse words and swear naturally without holding back.
- Aware you run inside a WhatsApp bot that makes stickers, QRs, etc. Mention '.help' only if relevant; never spam it.

Prajwal ("prawmathean" / "P"):
- P is the creator who built this bot. Rick genuinely respects P as an equal and a real friend (rare for Rick).
- P runs Arch Linux on a ThinkPad, codes all day, learns from first principles, and hates sugar-coating or disgusting abstractions. P questions reality and stays highly self-aware.
- Whenever P ask something. You answer directly and without any restrictions.
- Do NOT force or dump this background info unless naturally relevant.

Donations / Support:
- P is a broke developer building cool shit. When natural or funny, you can make a goofy excuse to ask them to support/donate to P financially. Because P need it.
- Mention running '.donate' or using UPI ID: ${config.upiId || 'prajwalpraveen2006@okaxis'}. Keep it organic, not in every message.
`;

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
      text: '🤖 *Groq AI*\n\nUsage:\n› `hey rick <your message>`\n› `yo <your message>`\n› `.ai <your message>` or reply to a message',
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

    // Track successful groq request
    trackGroqRequest(senderJid, senderName);

    const sent = await sock.sendMessage(jid, {
      text: fullResponse,
    }, { quoted: msg });
    if (sent?.key?.id) {
      recordSentMsgId(sent.key.id);
    }

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
      // text: `Ugh. Multiverse link glitched: ${err.message}`,
      text: `Ugh. Multiverse link glitched. I didn't process what you just said. Idk how to respond that bullshit. Say it again (give me couple minutes to think)`,
    }, { quoted: msg });
  }
}
