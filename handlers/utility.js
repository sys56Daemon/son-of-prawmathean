/**
 * handlers/utility.js
 * Utility commands: weather, translate, define, tts, ginfo
 * All use free/no-key APIs — Termux and PC friendly.
 */

// ─── .weather ─────────────────────────────────────────────────────────────────

/**
 * .weather [location]
 * Uses wttr.in — no API key needed, works everywhere
 */
export async function handleWeather(sock, msg, args) {
  const jid      = msg.key.remoteJid;
  const location = args.join('+') || 'auto';

  try {
    const url  = `https://wttr.in/${encodeURIComponent(location)}?format=4`;
    const res  = await fetch(url, { headers: { 'User-Agent': 'waBot/2.0' } });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = (await res.text()).trim();

    if (!text || text.includes('Unknown location')) {
      await sock.sendMessage(jid, {
        text: `❌ Could not find weather for *${args.join(' ') || 'your location'}*.`,
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, {
      text: `🌤️ *Weather*\n\n${text}\n\n_Powered by wttr.in_`,
    }, { quoted: msg });

  } catch (err) {
    console.error('[weather] Error:', err.message);
    await sock.sendMessage(jid, {
      text: '❌ Could not fetch weather. Try again later.',
    }, { quoted: msg });
  }
}

// ─── .translate ───────────────────────────────────────────────────────────────

/**
 * .translate <lang> <text>   — or reply to a message
 * Uses Google Translate (unofficial endpoint, no API key)
 * Example: .translate es Hello how are you?
 */
export async function handleTranslate(sock, msg, args) {
  const jid = msg.key.remoteJid;

  if (args.length < 2) {
    await sock.sendMessage(jid, {
      text: '🌐 *Usage:*\n`.translate <lang> <text>`\nor reply to a message:\n`.translate <lang>`\n\n_Examples:_\n`.translate es Good morning`\n`.translate fr Hello everyone`\n\n_Common lang codes:_ `es` `fr` `de` `ja` `hi` `ar` `pt` `ru` `zh`',
    }, { quoted: msg });
    return;
  }

  const targetLang = args[0].toLowerCase();

  // Support replying to a message
  let textToTranslate;
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (args.length === 1 && contextInfo?.quotedMessage) {
    textToTranslate =
      contextInfo.quotedMessage?.conversation ||
      contextInfo.quotedMessage?.extendedTextMessage?.text || '';
  } else {
    textToTranslate = args.slice(1).join(' ');
  }

  if (!textToTranslate.trim()) {
    await sock.sendMessage(jid, {
      text: '❌ No text to translate. Provide text or reply to a message.',
    }, { quoted: msg });
    return;
  }

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(textToTranslate)}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const translated = data[0]?.map(chunk => chunk[0]).join('') ?? '';
    const detectedLang = data[2] ?? '?';

    if (!translated) throw new Error('Empty translation response');

    await sock.sendMessage(jid, {
      text: `🌐 *Translation* (${detectedLang} → ${targetLang})\n\n${translated}`,
    }, { quoted: msg });

  } catch (err) {
    console.error('[translate] Error:', err.message);
    await sock.sendMessage(jid, {
      text: '❌ Translation failed. Check the language code and try again.',
    }, { quoted: msg });
  }
}

// ─── .define ──────────────────────────────────────────────────────────────────

/**
 * .define <word>
 * Uses Free Dictionary API — https://dictionaryapi.dev/
 */
export async function handleDefine(sock, msg, args) {
  const jid  = msg.key.remoteJid;
  const word = args[0]?.trim();

  if (!word) {
    await sock.sendMessage(jid, {
      text: '📖 *Usage:* `.define <word>`\n_Example:_ `.define serendipity`',
    }, { quoted: msg });
    return;
  }

  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
    const res = await fetch(url);

    if (res.status === 404) {
      await sock.sendMessage(jid, {
        text: `📖 No definition found for *${word}*.`,
      }, { quoted: msg });
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data  = await res.json();
    const entry = data[0];

    const phonetic = entry.phonetics?.find(p => p.text)?.text ?? '';
    const lines    = [`📖 *${entry.word}*${phonetic ? `  /${phonetic}/` : ''}\n`];

    // Up to 3 meanings
    const meanings = entry.meanings?.slice(0, 3) ?? [];
    for (const meaning of meanings) {
      lines.push(`*${meaning.partOfSpeech}*`);
      const defs = meaning.definitions?.slice(0, 2) ?? [];
      for (const def of defs) {
        lines.push(`  • ${def.definition}`);
        if (def.example) lines.push(`    _"${def.example}"_`);
      }
      if (meaning.synonyms?.length) {
        lines.push(`  Synonyms: ${meaning.synonyms.slice(0, 5).join(', ')}`);
      }
      lines.push('');
    }

    await sock.sendMessage(jid, {
      text: lines.join('\n').trim(),
    }, { quoted: msg });

  } catch (err) {
    console.error('[define] Error:', err.message);
    await sock.sendMessage(jid, {
      text: '❌ Could not fetch definition. Try again later.',
    }, { quoted: msg });
  }
}

// ─── .ginfo ───────────────────────────────────────────────────────────────────

/**
 * .ginfo — shows detailed info about the current group
 */
export async function handleGInfo(sock, msg) {
  const jid = msg.key.remoteJid;

  if (!jid.endsWith('@g.us')) {
    await sock.sendMessage(jid, {
      text: '❌ This command only works in *groups*.',
    }, { quoted: msg });
    return;
  }

  try {
    const meta   = await sock.groupMetadata(jid);
    const admins = meta.participants.filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`);
    const total  = meta.participants.length;
    const now    = new Date();
    const created = meta.creation
      ? new Date(meta.creation * 1000).toLocaleDateString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : 'Unknown';

    const lines = [
      `👥 *Group Info*`,
      ``,
      `📛 *Name:* ${meta.subject}`,
      `🆔 *ID:* ${meta.id}`,
      `📅 *Created:* ${created}`,
      `👤 *Members:* ${total}`,
      `🛡️ *Admins:* ${admins.length}`,
      admins.length ? `   ${admins.join('  ')}` : '',
      meta.desc ? `\n📝 *Description:*\n${meta.desc.trim()}` : '',
    ].filter(l => l !== undefined);

    await sock.sendMessage(jid, {
      text: lines.join('\n'),
      mentions: meta.participants.filter(p => p.admin).map(p => p.id),
    }, { quoted: msg });

  } catch (err) {
    console.error('[ginfo] Error:', err.message);
    await sock.sendMessage(jid, {
      text: '❌ Could not fetch group info.',
    }, { quoted: msg });
  }
}

// ─── .tts ─────────────────────────────────────────────────────────────────────

/**
 * .tts <text>   — or reply to a message
 * Generates speech using Google TTS (public, no API key)
 * Sends an audio voice message (PTT)
 */
export async function handleTTS(sock, msg, args) {
  const jid = msg.key.remoteJid;

  // Support replying to a message for the text
  let text;
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (args.length === 0 && contextInfo?.quotedMessage) {
    text =
      contextInfo.quotedMessage?.conversation ||
      contextInfo.quotedMessage?.extendedTextMessage?.text || '';
  } else {
    text = args.join(' ').trim();
  }

  if (!text) {
    await sock.sendMessage(jid, {
      text: '🔊 *Usage:*\n`.tts <text>` — or reply to any message with `.tts`\n\n_Example:_ `.tts Hello everyone!`',
    }, { quoted: msg });
    return;
  }

  if (text.length > 200) {
    await sock.sendMessage(jid, {
      text: '❌ Text is too long. Maximum is *200 characters*.',
    }, { quoted: msg });
    return;
  }

  try {
    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

    // Google TTS URL (publicly accessible, no key required)
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=en&client=tw-ob`;
    const res    = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer':    'https://translate.google.com/',
      },
    });

    if (!res.ok) throw new Error(`TTS fetch failed: HTTP ${res.status}`);

    const mp3Buffer = Buffer.from(await res.arrayBuffer());

    await sock.sendMessage(jid, {
      audio:    mp3Buffer,
      mimetype: 'audio/mpeg',
      ptt:      true,   // sends as voice note
    }, { quoted: msg });

    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });

  } catch (err) {
    console.error('[tts] Error:', err.message);
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    await sock.sendMessage(jid, {
      text: '❌ TTS failed. Try again later.',
    }, { quoted: msg });
  }
}
