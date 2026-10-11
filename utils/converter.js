import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);
const MAX_SIZE = 512;

/**
 * Convert a static image buffer to a 512x512 WebP using sharp.
 *
 * sharp is far superior to ffmpeg for image→WebP:
 *   - Produces spec-compliant VP8X+ALPH+VP8 (not ANIM/ANMF)
 *   - Handles JPEG, PNG, WEBP, GIF, TIFF, HEIF automatically
 *   - Black/transparent letterbox padding via `fit: 'contain'`
 *   - Pre-installed in node_modules, no external binary dependency
 */
export async function convertToStaticWebP(imageBuffer) {
  const { default: sharp } = await import('sharp');

  const webpBuffer = await sharp(imageBuffer)
    .resize(MAX_SIZE, MAX_SIZE, {
      fit:        'contain',                              // letterbox, preserve aspect ratio
      background: { r: 0, g: 0, b: 0, alpha: 0 },       // transparent padding
      withoutEnlargement: false,
    })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();

  console.log(`[converter] static WebP size: ${webpBuffer.length} bytes`);
  return webpBuffer;
}

/**
 * Convert an animated GIF/video buffer to an animated WebP.
 *
 * sharp handles real GIF files natively (direct path).
 * WhatsApp GIFs arrive as MP4/h264 (gifPlayback: true), so we fall back to
 * ffmpeg's libwebp_anim encoder which produces a spec-compliant animated WebP
 * in one pass — far more reliable than frame extraction + manual reassembly.
 */
export async function convertToAnimatedWebP(gifBuffer) {
  const { default: sharp } = await import('sharp');

  // Try sharp first (handles real .gif files directly)
  try {
    const webpBuffer = await sharp(gifBuffer, { animated: true })
      .resize(MAX_SIZE, MAX_SIZE, {
        fit:        'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .webp({ quality: 80, effort: 4, loop: 0 })
      .toBuffer();

    // Sharp may silently return a static WebP if the input isn't truly animated.
    // Verify we actually got multiple pages; if not, fall through to ffmpeg.
    const meta = await sharp(webpBuffer, { animated: true }).metadata();
    if (!meta.pages || meta.pages < 2) {
      throw new Error('sharp produced a single-frame WebP — input is likely an MP4');
    }

    console.log(`[converter] animated WebP (sharp) size: ${webpBuffer.length} bytes, ${meta.pages} frames`);
    return webpBuffer;
  } catch (sharpErr) {
    // Fallback: WhatsApp GIFs arrive as MP4/h264 — use ffmpeg libwebp_anim directly
    console.log('[converter] sharp animated failed, trying ffmpeg libwebp_anim:', sharpErr.message);
    return convertVideoToAnimatedWebP(gifBuffer);
  }
}

/**
 * Convert a WhatsApp-style GIF (delivered as MP4) to animated WebP.
 *
 * Uses ffmpeg's libwebp_anim encoder in a single pass — no intermediate frame
 * files needed. This produces a valid RIFF/WEBP with VP8X + ANIM + ANMF chunks.
 *
 * Previous approach (extract PNGs → stack raw pixels → sharp) was broken:
 * sharp interpreted the vertically-stacked pixel data as one tall static image
 * instead of N animation frames, resulting in a corrupt/static sticker.
 */
async function convertVideoToAnimatedWebP(videoBuffer) {
  const id        = randomUUID();
  const inputPath = join(tmpdir(), `wabot_in_${id}.mp4`);
  const outPath   = join(tmpdir(), `wabot_out_${id}.webp`);

  try {
    await writeFile(inputPath, videoBuffer);

    // Scale to 512×512 (letterbox with transparent padding) and encode as animated WebP.
    // -preset default gives a good quality/speed balance.
    // -loop 0 means loop forever (WhatsApp sticker standard).
    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', [
        `scale=${MAX_SIZE}:${MAX_SIZE}:force_original_aspect_ratio=decrease`,
        `pad=${MAX_SIZE}:${MAX_SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
        'format=rgba',
      ].join(','),
      '-vcodec', 'libwebp_anim',
      '-loop', '0',
      '-preset', 'default',
      '-an',
      outPath,
    ]).catch(err => {
      console.error('[converter] ffmpeg libwebp_anim error:', err.stderr || err.message);
      throw err;
    });

    const webpBuffer = await readFile(outPath);
    console.log(`[converter] animated WebP (ffmpeg libwebp_anim) size: ${webpBuffer.length} bytes`);
    return webpBuffer;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
