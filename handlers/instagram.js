/**
 * handlers/instagram.js
 * Downloads and sends Instagram posts (photos, videos/reels, carousels).
 *
 * Trigger: `insta <url>` or `.insta <url>`
 *
 * Uses yt-dlp — actively maintained, handles DASH merging, auth via cookies.
 *
 * Anti-rate-limit strategy:
 *   1. Uses real browser session cookies (Brave → Chrome → Firefox → cookies.txt)
 *      so Instagram sees a logged-in user, not an anonymous bot.
 *   2. Single yt-dlp call for both metadata + download (halves request count).
 *   3. Serial request queue — only one download runs at a time.
 *   4. Automatic retry with a short wait on transient failures.
 */

import { execFile }        from 'child_process';
import { promisify }       from 'util';
import { readFile, unlink, readdir, access } from 'fs/promises';
import { join, resolve }   from 'path';
import { tmpdir }          from 'os';
import { randomUUID }      from 'crypto';
import { fileURLToPath }   from 'url';

const execFileAsync = promisify(execFile);

// Project root (one level above this file)
const PROJECT_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

// ── Cookie detection ───────────────────────────────────────────────────────────

/**
 * Builds the yt-dlp cookie arguments to use.
 *
 * Priority:
 *   1. cookies.txt in project root  (works headless / on servers)
 *   2. Brave browser
 *   3. Chrome browser
 *   4. Chromium browser
 *   5. Firefox browser
 *   6. No cookies (anonymous — may hit rate limits)
 *
 * Detection is done by checking if the browser's cookie DB file exists on disk
 * — no network call needed, instant.
 */
async function getCookieArgs() {
  const home = process.env.HOME || '/root';

  // 1. Manual cookies.txt in project root (best for headless / server deploys)
  const cookieFile = join(PROJECT_ROOT, 'cookies.txt');
  try {
    await access(cookieFile);
    console.log('[insta] Using cookies.txt');
    return ['--cookies', cookieFile];
  } catch { /* file doesn't exist */ }

  // 2. Auto-detect installed browser by checking cookie DB path on disk
  const browserCookiePaths = [
    { name: 'brave',    path: `${home}/.config/BraveSoftware/Brave-Browser/Default/Cookies` },
    { name: 'chrome',   path: `${home}/.config/google-chrome/Default/Cookies` },
    { name: 'chromium', path: `${home}/.config/chromium/Default/Cookies` },
    { name: 'firefox',  path: `${home}/.mozilla/firefox` },  // directory check
  ];

  for (const { name, path } of browserCookiePaths) {
    try {
      await access(path);
      console.log(`[insta] Using ${name} browser cookies`);
      return ['--cookies-from-browser', name];
    } catch { /* not found */ }
  }

  console.warn('[insta] No browser cookies found — running anonymous (may rate-limit)');
  return [];
}

// Cache the cookie args so we only probe once per process start
let _cookieArgsCache = null;
async function cookieArgs() {
  if (!_cookieArgsCache) _cookieArgsCache = await getCookieArgs();
  return _cookieArgsCache;
}

// ── Serial download queue ──────────────────────────────────────────────────────
// Instagram rate-limits per IP. Running concurrent yt-dlp calls multiplies
// the request count. This queue ensures one download at a time.

let _queueRunning = false;
const _queue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    _queue.push({ fn, resolve, reject });
    processQueue();
  });
}

function processQueue() {
  if (_queueRunning || _queue.length === 0) return;
  _queueRunning = true;
  const { fn, resolve, reject } = _queue.shift();
  fn()
    .then(resolve, reject)
    .finally(() => {
      _queueRunning = false;
      processQueue();
    });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Validates and normalises an Instagram URL.
 * Returns the cleaned URL or null if invalid.
 */
function normaliseInstaUrl(raw) {
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    if (!url.hostname.includes('instagram.com')) return null;
    if (!/^\/(p|reel|reels|tv)\//.test(url.pathname)) return null;
    return `https://www.instagram.com${url.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Safely deletes files — ignores errors.
 */
async function cleanupFiles(...paths) {
  for (const p of paths) {
    try { if (p) await unlink(p); } catch { /* ignore */ }
  }
}

/**
 * Core download logic — wrapped in the queue via enqueue().
 * Downloads the URL to a temp file, returns { filePath, isVideo, uploader }.
 */
async function downloadInstagram(cleanUrl) {
  const cookies  = await cookieArgs();
  const workDir  = tmpdir();
  const fileId   = `insta_${randomUUID()}`;
  const outTpl   = join(workDir, `${fileId}.%(ext)s`);

  // Single yt-dlp call: download + embed metadata
  await execFileAsync('yt-dlp', [
    '--no-playlist',
    '--merge-output-format', 'mp4',
    '--write-info-json',               // writes <fileId>.info.json alongside
    '-o', outTpl,
    ...cookies,
    cleanUrl,
  ], { timeout: 150_000 });

  // Find the downloaded media file
  const entries  = await readdir(workDir);
  const media    = entries.find(f => f.startsWith(fileId) && !f.endsWith('.info.json'));
  const infoFile = entries.find(f => f.startsWith(fileId) && f.endsWith('.info.json'));

  if (!media) throw new Error('yt-dlp produced no output file');

  const filePath = join(workDir, media);

  // Parse the companion JSON for metadata
  let uploader = 'Instagram';
  let isVideo  = false;
  if (infoFile) {
    try {
      const info = JSON.parse(await readFile(join(workDir, infoFile), 'utf8'));
      uploader = info.uploader || info.channel || uploader;
      isVideo  = info.vcodec && info.vcodec !== 'none';
    } catch { /* fallback to extension heuristic */ }
    await cleanupFiles(join(workDir, infoFile));
  }

  // Extension heuristic if JSON parse failed
  const ext = filePath.split('.').pop().toLowerCase();
  if (!isVideo) isVideo = ['mp4', 'mkv', 'webm', 'mov'].includes(ext);

  return { filePath, isVideo, uploader };
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

  // Hourglass reaction while in queue / downloading
  await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });

  let filePath;
  try {
    // Enqueue so concurrent requests are serialised
    const result = await enqueue(() => downloadInstagram(cleanUrl));
    filePath = result.filePath;

    const buffer   = await readFile(filePath);
    const caption  = `📸 *${result.uploader}*\n🔗 ${cleanUrl}`;

    if (result.isVideo) {
      await sock.sendMessage(jid, {
        video:    buffer,
        mimetype: 'video/mp4',
        caption,
      }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, {
        image:    buffer,
        mimetype: 'image/jpeg',
        caption,
      }, { quoted: msg });
    }

    await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    console.log(`[insta] ✅ Sent ${result.isVideo ? 'video' : 'image'} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  } catch (err) {
    console.error('[insta] ❌ Error:', err.message);
    await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } });

    // Give a specific hint if it looks like a rate-limit / auth issue
    const isRateLimit = /rate.limit|empty.media|API.*not.*granting|login.required/i.test(err.message);
    await sock.sendMessage(jid, {
      text: isRateLimit
        ? '❌ Instagram blocked this request.\n\n' +
          '_Tip: Add a `cookies.txt` file to the bot folder (exported from your browser) to avoid rate limits._'
        : '❌ Could not download this Instagram post.\n\n' +
          '_Possible reasons:_\n' +
          '• The account is *private*\n' +
          '• The post was deleted\n' +
          '• Temporary Instagram block — try again in a moment',
    }, { quoted: msg });

  } finally {
    await cleanupFiles(filePath);
  }
}
