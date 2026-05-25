import QRCode from 'qrcode';

export async function handleQR(sock, msg, args) {
  const jid = msg.key.remoteJid;

  if (!args.trim()) {
    await sock.sendMessage(jid, {
      text: '❌ Usage: `qr <text>`\nExample: `qr Hello World`',
    }, { quoted: msg });
    return;
  }

  // Strip surrounding quotes if user wrapped the text
  const text = args.trim().replace(/^['"]|['"]$/g, '') || 'Hello!';

  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

  // Generate a plain white QR PNG — no canvas, no decorations
  const imgBuffer = await QRCode.toBuffer(text, {
    type:                 'png',
    width:                512,
    margin:               2,
    errorCorrectionLevel: 'H',
    color: { dark: '#000000', light: '#ffffff' },
  });

  await sock.sendMessage(jid, {
    image:   imgBuffer,
    // caption: `🔲 Scan to reveal: \`${text.slice(0, 60)}${text.length > 60 ? '…' : ''}\``,
  }, { quoted: msg });

  await sock.sendMessage(jid, { react: { text: '\t', key: msg.key } });
}
