import { Groq } from 'groq-sdk';
import config from '../config.js';

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

  // Send a reaction to let user know bot is thinking
  try {
    await sock.sendMessage(jid, { react: { text: '⚡', key: msg.key } });
  } catch (_) {}

  try {
    // If stream is true, we accumulate chunks; in WhatsApp we send the completed response
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: 'You are an intelligent, helpful WhatsApp AI assistant. Respond concisely and cleanly in Markdown where suitable for mobile reading.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      model: config.groqModel || 'llama-3.3-70b-versatile',
      temperature: 0.6,
      max_completion_tokens: 2048,
      top_p: 0.95,
      stream: true,
      stop: null
    });

    let fullResponse = '';
    for await (const chunk of chatCompletion) {
      fullResponse += chunk.choices[0]?.delta?.content || '';
    }

    fullResponse = fullResponse.trim();
    if (!fullResponse) {
      fullResponse = '*(Received an empty response from model)*';
    }

    await sock.sendMessage(jid, {
      text: fullResponse
    }, { quoted: msg });

  } catch (err) {
    console.error('[groq] Error:', err.message);
    await sock.sendMessage(jid, {
      text: `❌ *Groq AI Error:*\n${err.message}`
    }, { quoted: msg });
  }
}
