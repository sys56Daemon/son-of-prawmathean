/**
 * handlers/instagram.js
 * Downloads and sends Instagram posts (photos, videos/reels, carousels).
 *
 * Trigger: `insta <url>` or `.insta <url>`
 *
 * Uses yt-dlp under the hood — the only truly reliable, actively maintained
 * tool for Instagram media extraction in 2025/2026.
 * yt-dlp handles: DASH merging, codec normalisation, auth-less public access.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFile, unlink, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Validates and normalises an Instagram URL.
 * Accepts /p/, /reel/, /reels/, /tv/ paths.
 * Returns the cleaned URL or null if invalid.
 */
function normaliseInstaUrl(raw) {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!url.hostname.includes('instagram.com')) return null;
    if (!/^\/(p|reel|reels|tv)\//.test(url.pathname)) return null;
    // Strip query / tracking params, keep only the canonical path
    return `https://www.instagram.com${url.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Runs yt-dlp to get the JSON metadata for a URL (no actual download).
 * Returns the parsed JSON object.
 */
async function getMediaInfo(url) {
  const { stdout } = await execFileAsync('yt-dlp', [
    '--no-playlist',
    '--print-json',
    '--skip-download',
    url,
  ], { timeout: 30_000 });

  return JSON.parse(stdout.trim());
}

/**
 * Downloads a single Instagram URL to a temp file using yt-dlp.
 * Returns the absolute path of the downloaded file.
 *
 * @param {string} url       - Instagram URL
 * @param {string} outDir    - directory to write file into
 * @param {string} fileId    - unique filename stem
 */
async function downloadWithYtDlp(url, outDir, fileId) {
  const outTemplate = join(outDir, `${fileId}.%(ext)s`);

  await execFileAsync('yt-dlp', [
    '--no-playlist',
    '--merge-output-format', 'mp4',   // merge DASH video+audio into one mp4
    '-o', outTemplate,
    url,
  ], { timeout: 120_000 });           // 2-minute cap per file

  // Find the output file (yt-dlp resolves the final extension)
  const entries = await readdir(outDir);
  const match = entries.find(f => f.startsWith(fileId));
  if (!match) throw new Error('yt-dlp produced no output file');
  return join(outDir, match);
}

/**
 * Safely deletes a list of file paths — ignores errors.
 */
async function cleanupFiles(...paths) {
  for (const p of paths) {
    try { await unlink(p); } catch { /* ignore */ }
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

/**
 * insta <instagram-url>
 * Downloads and sends the post media back to the chat.
 */
export async function handleInsta(sock, msg, args) {
  const jid = msg.key.remoteJid;

  const rawUrl = args[0]?.trim();
  if (!rawUrl) {
    await sock.sendMessage(jid, {
      text:
        '📸 *Instagram Downloader*\n\n' +
        '*Usage:*\n' +
        '`insta <instagram-url>`\n' +
        '`.insta <instagram-url>`\n\n' +
        '*Supports:* posts, reels, IGTV, carousels\n' +
        '_Only public posts are supported._',
    }, { quoted: msg });
    return;
  }

  const cleanUrl = normaliseInstaUrl(rawUrl);
  if (!cleanUrl) {
    await sock.sendMessage(jid, {
      text: '❌ Invalid Instagram URL.\nMake sure it links to a post, reel, or IGTV video.',
    }, { quoted: msg });
    return;
  }

  // Hourglass while working
  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

  // ── Step 1: probe metadata to know what we're dealing with ─────────────────
  let info;
  try {
    info = await getMediaInfo(cleanUrl);
  } catch (err) {
    console.error('[insta] metadata fetch failed:', err.message);
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    await sock.sendMessage(jid, {
      text:
        '❌ Could not fetch this Instagram post.\n\n' +
        '_Possible reasons:_\n' +
        '• The account is *private*\n' +
        '• The post was deleted\n' +
        '• Instagram is rate-limiting requests right now\n\n' +
        '_Try again in a moment._',
    }, { quoted: msg });
    return;
  }

  // Determine media type from yt-dlp metadata
  const isVideo  = info.vcodec && info.vcodec !== 'none';
  const uploader = info.uploader || info.channel || 'Instagram';
  const caption  = `📸 *${uploader}*\n🔗 ${cleanUrl}`;

  // ── Step 2: download to temp dir ───────────────────────────────────────────
  const workDir = tmpdir();
  const fileId  = `insta_${randomUUID()}`;
  let   filePath;

  try {
    console.log(`[insta] downloading ${isVideo ? 'video' : 'image'} from ${cleanUrl}`);
    filePath = await downloadWithYtDlp(cleanUrl, workDir, fileId);
    console.log(`[insta] downloaded to ${filePath} (${(await readFile(filePath)).length} bytes)`);
  } catch (err) {
    console.error('[insta] download failed:', err.message);
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    await sock.sendMessage(jid, {
      text: '❌ Download failed. The post may be private or geo-restricted.',
    }, { quoted: msg });
    return;
  }

  // ── Step 3: read file into buffer and send ─────────────────────────────────
  try {
    const buffer = await readFile(filePath);
    const ext    = filePath.split('.').pop().toLowerCase();

    if (isVideo || ext === 'mp4' || ext === 'mkv' || ext === 'webm') {
      await sock.sendMessage(jid, {
        video:    buffer,
        mimetype: 'video/mp4',
        caption,
      }, { quoted: msg });
    } else {
      // Image (jpg / png / webp)
      await sock.sendMessage(jid, {
        image:    buffer,
        mimetype: 'image/jpeg',
        caption,
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    console.log('[insta] sent successfully');

  } catch (err) {
    console.error('[insta] send failed:', err.message);
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });
    await sock.sendMessage(jid, {
      text: '❌ Downloaded but failed to send. The file may be too large for WhatsApp.',
    }, { quoted: msg });
  } finally {
    // Always clean up the temp file
    await cleanupFiles(filePath);
  }
}
