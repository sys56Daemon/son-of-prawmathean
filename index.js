import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';
import { rm } from 'fs/promises';

import config from './config.js';

// ── Suppress libsignal Decryption Noise ───────────────────────────────────────
const originalConsoleError = console.error;
console.error = function (...args) {
  const firstArg = args[0] ? String(args[0]) : '';
  if (
    firstArg.includes('Failed to decrypt message with any known session') ||
    firstArg.includes('Session error:Error: Bad MAC') ||
    args.some(arg => typeof arg === 'string' && (arg.includes('libsignal') || arg.includes('decryptWithSessions')))
  ) {
    return;
  }
  originalConsoleError.apply(console, args);
};

import { isAllowed, getNumber, isUnconfigured, isOwner } from './utils/permissions.js';
import { isChatDisabled } from './utils/chatfilter.js';

// ── Handlers ──────────────────────────────────────────────────────────────────
import { handleStickerCommand } from './handlers/sticker.js';
import { handlePing, handleAlive, handleInfo, handleStats, handleHelp, handleOwnerHelp, handleDonate, handleToImg, handlePublic, handlePrivate, handleMode, handleIgnore, handleUnignore, handleIgnoreList, handleDisable, handleEnable, handleDisabledList } from './handlers/general.js';
import { handleTagAll, handleKick, handlePromote, handleDemote } from './handlers/group.js';
import { handleCertificate } from './handlers/certificate.js';
import { handleQR } from './handlers/qr.js';
import { handleCalc, handleFlip, handleRoll, handleRemind, handle8Ball, handleChoose } from './handlers/fun.js';
import { handleWeather, handleTranslate, handleLanguages, handleDefine, handleGInfo, handleTTS } from './handlers/utility.js';
import { handleInsta } from './handlers/instagram.js';
import { handlePetpet } from './handlers/petpet.js';
import { handleThinkSay } from './handlers/thinksay.js';
import { handleGay } from './handlers/gay.js';
import { handleGroq, isRecentGroqMsgId } from './handlers/groq.js';
import { trackRequest } from './utils/stats.js';

// ── Router ────────────────────────────────────────────────────────────────────

async function handleMessage(sock, msg) {
  if (!msg.message) return;

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''
  ).trim();

  if (!text) return;

  const prefixRe  = new RegExp(`^\\${config.prefix}`, 'i');
  const BARE_CMDS = ['sticker', 'certify', 'certificate', 'qr', 'insta', 'pet', 'petpet', 'ai', 'groq', 'thinksay', 'think', 'gay', 'rainbow'];
  const isBareCmd = BARE_CMDS.some(cmd => new RegExp(`^${cmd}(\\s|$)`, 'i').test(text));

  // Natural conversational triggers for Groq AI: "hey rick" (or "hey ricke", "rick", "yo", "hey p" fallback)
  const groqNaturalMatch = text.match(/^(?:hey\s+ricke?|rick|yo|hey\s+p)(?:[\s,!?]+|$)(.*)/is);

  // Check if this message is a reply to a message sent by the bot
  // Note: Ignore if msg.key.fromMe is true or if the quoted message was an automated Groq reply
  // when sent by the bot account itself, to completely prevent infinite self-reply loops.
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  const quotedParticipant = contextInfo?.participant || '';
  const quotedStanzaId = contextInfo?.stanzaId || '';
  const botUserJid = sock.user?.id || '';
  const botUserLid = sock.user?.lid || '';
  const isQuotedFromBot = Boolean(
    contextInfo?.quotedMessage && (
      (botUserJid && getNumber(quotedParticipant) === getNumber(botUserJid)) ||
      (botUserLid && getNumber(quotedParticipant) === getNumber(botUserLid))
    )
  );
  // Never treat messages sent from bot itself as an auto-reply trigger,
  // and never trigger if the bot is quoting its own recent Groq response.
  const isReplyToBot = Boolean(
    !msg.key?.fromMe &&
    isQuotedFromBot &&
    !isRecentGroqMsgId(msg.key?.id)
  );

  if (!prefixRe.test(text) && !isBareCmd && !groqNaturalMatch && !isReplyToBot) return;

  // Resolve sender JID
  const jid    = msg.key.remoteJid;
  const sender  = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);

  // ── Permission check ─────────────────────────────────────────────────────
  // If message is fromMe, or sender is in ownerNumbers / matches bot/owner LID, grant top-priority owner access.
  const botLid = sock.user?.lid ?? '';
  const senderLidMatchesOwner = sender?.endsWith('@lid') && botLid
    ? getNumber(sender) === getNumber(botLid)
    : false;
  const isSenderOwner = msg.key.fromMe || senderLidMatchesOwner || isOwner(sender, sock);

  if (!isSenderOwner && !isAllowed(sender)) {
    console.log(`[debug] Ignored: sender ${sender} not authorized.`);
    return;
  }

  // ── Disabled Chat check ──────────────────────────────────────────────────
  // If the chat is disabled, only the bot owners can run commands in it
  // (such as .enable to restore the bot)
  if (isChatDisabled(jid) && !isSenderOwner) {
    return;
  }

  // If triggered via natural phrase "hey p ..." or "yo ..."
  if (groqNaturalMatch) {
    trackRequest(sender, msg.pushName, 'groq_natural');
    const prompt = groqNaturalMatch[1]?.trim() || '';
    try {
      await handleGroq(sock, msg, prompt);
    } catch (err) {
      console.error('[router] Error in groq AI:', err.message);
      await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }, { quoted: msg });
    }
    return;
  }

  // If user replied to a message sent by the bot (and didn't issue an explicit command)
  if (!msg.key?.fromMe && isReplyToBot && !prefixRe.test(text) && !isBareCmd) {
    trackRequest(sender, msg.pushName, 'groq_reply');
    try {
      await handleGroq(sock, msg, text);
    } catch (err) {
      console.error('[router] Error in groq AI:', err.message);
      await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }, { quoted: msg });
    }
    return;
  }

  const body    = prefixRe.test(text) ? text.slice(config.prefix.length) : text;
  const parts   = body.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args    = parts.slice(1);

  // Track the command request
  trackRequest(sender, msg.pushName, command);

  try {
    switch (command) {
      case 'ping':        await handlePing(sock, msg);                break;
      case 'alive':       await handleAlive(sock, msg);               break;
      case 'info':        await handleInfo(sock, msg);                break;
      case 'stats':
      case 'stat':
      case 'log':
      case 'logs':        await handleStats(sock, msg);               break;
      case 'help':        await handleHelp(sock, msg);                break;
      case 'ownerhelp':
      case 'adminhelp':   await handleOwnerHelp(sock, msg);           break;
      case 'donate':      await handleDonate(sock, msg);              break;
      case 'sticker':     await handleStickerCommand(sock, msg);      break;
      case 'toimg':       await handleToImg(sock, msg);               break;
      case 'certify':
      case 'certificate': await handleCertificate(sock, msg, args);   break;
      case 'qr':          await handleQR(sock, msg, args);            break;
      case 'mode':        await handleMode(sock, msg);                break;
      case 'public':      await handlePublic(sock, msg);              break;
      case 'private':     await handlePrivate(sock, msg);             break;
      case 'ignore':
      case 'block':       await handleIgnore(sock, msg, args);        break;
      case 'unignore':
      case 'unblock':     await handleUnignore(sock, msg, args);      break;
      case 'ignorelist':
      case 'ignored':
      case 'blocklist':   await handleIgnoreList(sock, msg);          break;
      case 'disable':     await handleDisable(sock, msg);             break;
      case 'enable':      await handleEnable(sock, msg, args);        break;
      case 'disabledlist':
      case 'disabledchats': await handleDisabledList(sock, msg);       break;
      case 'tagall':      await handleTagAll(sock, msg, args);        break;
      case 'kick':        await handleKick(sock, msg, args);          break;
      case 'promote':     await handlePromote(sock, msg, args);       break;
      case 'demote':
      case 'depromote':   await handleDemote(sock, msg, args);        break;
      // ── Fun ────────────────────────────────────────────────────────────────
      case 'calc':        await handleCalc(sock, msg, args);          break;
      case 'flip':        await handleFlip(sock, msg);                break;
      case 'roll':        await handleRoll(sock, msg, args);          break;
      case 'remind':      await handleRemind(sock, msg, args);        break;
      case '8ball':       await handle8Ball(sock, msg, args);         break;
      case 'choose':      await handleChoose(sock, msg, args);        break;
      // ── Utility ────────────────────────────────────────────────────────────
      case 'weather':     await handleWeather(sock, msg, args);       break;
      case 'translate':
      case 'tr':          await handleTranslate(sock, msg, args);     break;
      case 'languages':
      case 'langs':       await handleLanguages(sock, msg);           break;
      case 'define':      await handleDefine(sock, msg, args);        break;
      case 'tts':         await handleTTS(sock, msg, args);           break;
      case 'ginfo':       await handleGInfo(sock, msg);               break;
      // ── Social Media ───────────────────────────────────────────────────────
      case 'insta':       await handleInsta(sock, msg, args);         break;
      // ── AI ─────────────────────────────────────────────────────────────────
      case 'ai':
      case 'groq':        await handleGroq(sock, msg, args);          break;
      // ── Fun: Petpet & Memes ────────────────────────────────────────────────
      case 'pet':
      case 'petpet':      await handlePetpet(sock, msg);              break;
      case 'thinksay':
      case 'think':       await handleThinkSay(sock, msg, args);      break;
      case 'gay':
      case 'rainbow':     await handleGay(sock, msg, args);           break;
      default: break;
    }
  } catch (err) {
    console.error(`[router] Error in "${command}":`, err.message);
    await sock.sendMessage(jid, { text: `❌ Error: ${err.message}` }, { quoted: msg });
  }
}

// ── WhatsApp Connection ───────────────────────────────────────────────────────

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🤖 ${config.botName} starting... (WA v${version.join('.')})`);
  console.log(`🔒 Mode: ${config.private ? 'Private' : 'Public'}\n`);

  if (isUnconfigured()) {
    console.log('┌─────────────────────────────────────────────────────────┐');
    console.log('│  ⚠️  ownerNumber not set in config.js!                  │');
    console.log('│  Bot is running in OPEN mode — anyone can use it.       │');
    console.log('│  Set your number in config.js to enable private mode.   │');
    console.log('└─────────────────────────────────────────────────────────┘\n');
  }

  const sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: state,
    printQRInTerminal: false,
    browser: ['waBot', 'Chrome', '125.0.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  // !! IMPORTANT: This callback MUST be async because we use `await rm()` inside
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.clear();
      console.log('📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      try {
        await QRCode.toFile('./qr.png', qr, {
          color: {
            dark: '#000000',
            light: '#ffffff'
          },
          width: 300
        });
        console.log('📷 Saved QR code image to ./qr.png - open and scan it in your workspace!');
      } catch (err) {
        console.error('Failed to save QR code image:', err);
      }
    }

    if (connection === 'close') {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;

      // 401 = logged out  |  440 = session replaced  |  403 = forbidden
      const sessionDead = [
        DisconnectReason.loggedOut,
        DisconnectReason.connectionReplaced,
        DisconnectReason.forbidden,
      ].includes(code);

      if (sessionDead) {
        console.log(`\n🔴 Session ended (code: ${code}).`);
        if (code === 440) {
          console.log('   ⚠️  Another WA Web session replaced this one.');
          console.log('   (You probably opened web.whatsapp.com in a browser.)');
        }
        console.log('   Clearing session and showing a new QR...\n');
        await rm('./auth_info', { recursive: true, force: true });
        try {
          await rm('./qr.png', { force: true });
        } catch {}
        connectToWhatsApp();
      } else {
        console.log(`\n⚠️  Disconnected (code: ${code}). Reconnecting...`);
        connectToWhatsApp();
      }

    } else if (connection === 'open') {
      console.log(`\n✅ Connected as +${getNumber(sock.user.id)}`);
      console.log(`📋 Commands: ${config.prefix}ping | ${config.prefix}help | ${config.prefix}sticker | ${config.prefix}toimg | certificate | qr | ${config.prefix}tagall | ${config.prefix}kick\n`);
      try {
        await rm('./qr.png', { force: true });
      } catch {}
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      const rawText = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const sender  = msg.key.participant ?? msg.key.remoteJid;
      // Always log incoming messages so you can see what the bot receives
      console.log(`[recv] type=${type} fromMe=${msg.key.fromMe} sender=+${sender} text="${rawText.slice(0,40)}"`);
      if (rawText.startsWith('.')) {
        console.log('[DEBUG] Full message object:', JSON.stringify(msg, null, 2));
      }
    }
    // Process 'notify' (incoming from other users) and 'append' (sent from bot's own WhatsApp account)
    for (const msg of messages) {
      if (type === 'notify' || (type === 'append' && msg.key?.fromMe)) {
        await handleMessage(sock, msg);
      }
    }
  });
}

connectToWhatsApp().catch(console.error);

process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', err?.message ?? err);
});
