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

import { isAllowed, getNumber, isUnconfigured } from './utils/permissions.js';

// ── Handlers ──────────────────────────────────────────────────────────────────
import { handleStickerCommand } from './handlers/sticker.js';
import { handlePing, handleAlive, handleInfo, handleHelp, handleToImg, handlePublic, handlePrivate, handleMode } from './handlers/general.js';
import { handleTagAll, handleKick, handlePromote, handleDemote } from './handlers/group.js';
import { handleCertificate } from './handlers/certificate.js';
import { handleQR } from './handlers/qr.js';

// ── Router ────────────────────────────────────────────────────────────────────

async function handleMessage(sock, msg) {
  if (!msg.message) return;

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    ''
  ).trim();

  if (!text) return;

  const prefixRe  = new RegExp(`^\\${config.prefix}`, 'i');
  const BARE_CMDS = ['sticker', 'certify', 'certificate', 'qr'];
  const isBareCmd = BARE_CMDS.some(cmd => new RegExp(`^${cmd}(\\s|$)`, 'i').test(text));

  if (!prefixRe.test(text) && !isBareCmd) return;

  // Resolve sender JID
  const jid    = msg.key.remoteJid;
  const sender  = msg.key.participant ?? (msg.key.fromMe ? sock.user?.id : jid);

  // ── Permission check ─────────────────────────────────────────────────────
  // If sender is a LID (@lid), compare against the bot's own LID.
  // If sender is a normal JID, use isAllowed() (checks ownerNumber + allowedNumbers).
  const botLid = sock.user?.lid ?? '';
  const senderLidMatchesOwner = sender?.endsWith('@lid') && botLid
    ? getNumber(sender) === getNumber(botLid)
    : false;

  if (!senderLidMatchesOwner && !isAllowed(sender)) {
    console.log(`[debug] Ignored: sender ${sender} not authorized.`);
    return;
  }

  const body    = prefixRe.test(text) ? text.slice(config.prefix.length) : text;
  const parts   = body.trim().split(/\s+/);
  const command = parts[0].toLowerCase();
  const args    = parts.slice(1);

  try {
    switch (command) {
      case 'ping':        await handlePing(sock, msg);                break;
      case 'alive':       await handleAlive(sock, msg);               break;
      case 'info':        await handleInfo(sock, msg);                break;
      case 'help':        await handleHelp(sock, msg);                break;
      case 'sticker':     await handleStickerCommand(sock, msg);      break;
      case 'toimg':       await handleToImg(sock, msg);               break;
      case 'certify':
      case 'certificate': await handleCertificate(sock, msg, args);   break;
      case 'qr':          await handleQR(sock, msg, args);            break;
      case 'mode':        await handleMode(sock, msg);                break;
      case 'public':      await handlePublic(sock, msg);              break;
      case 'private':     await handlePrivate(sock, msg);             break;
      case 'tagall':      await handleTagAll(sock, msg, args);        break;
      case 'kick':        await handleKick(sock, msg);                break;
      case 'promote':     await handlePromote(sock, msg);             break;
      case 'demote':      await handleDemote(sock, msg);              break;
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
    if (type !== 'notify') return;
    for (const msg of messages) {
      await handleMessage(sock, msg);
    }
  });
}

connectToWhatsApp().catch(console.error);

process.on('unhandledRejection', (err) => {
  console.error('[unhandled]', err?.message ?? err);
});
