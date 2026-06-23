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
 * sharp handles animated GIFs natively.
 * For GIFs from WhatsApp (which arrive as videoMessage with gifPlayback: true),
 * we first extract frames via ffmpeg then re-encode as animated WebP with sharp.
 */
export async function convertToAnimatedWebP(gifBuffer) {
  const { default: sharp } = await import('sharp');

  // Try sharp first (handles real GIF files directly)
  try {
    const webpBuffer = await sharp(gifBuffer, { animated: true })
      .resize(MAX_SIZE, MAX_SIZE, {
        fit:        'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        withoutEnlargement: false,
      })
      .webp({ quality: 80, effort: 4, loop: 0 })
      .toBuffer();

    console.log(`[converter] animated WebP (sharp) size: ${webpBuffer.length} bytes`);
    return webpBuffer;
  } catch (sharpErr) {
    // Fallback: WhatsApp GIFs arrive as MP4/h264 — ffmpeg extracts frames, sharp encodes
    console.log('[converter] sharp animated failed, trying ffmpeg frame extraction:', sharpErr.message);
    return convertVideoToAnimatedWebP(gifBuffer);
  }
}

/**
 * Fallback for WhatsApp-style GIFs that arrive as MP4 video streams.
 * Uses ffmpeg to extract PNG frames, then sharp to assemble animated WebP.
 */
async function convertVideoToAnimatedWebP(videoBuffer) {
  const { default: sharp } = await import('sharp');

  const id         = randomUUID();
  const inputPath  = join(tmpdir(), `wabot_in_${id}.bin`);
  const frameGlob  = join(tmpdir(), `wabot_frame_${id}_%04d.png`);

  try {
    await writeFile(inputPath, videoBuffer);

    // Extract frames as PNG (max 25 frames to keep output small)
    await execFileAsync('ffmpeg', [
      '-y', '-i', inputPath,
      '-vf', `scale=${MAX_SIZE}:${MAX_SIZE}:force_original_aspect_ratio=decrease,pad=${MAX_SIZE}:${MAX_SIZE}:(ow-iw)/2:(oh-ih)/2`,
      '-frames:v', '25',
      '-an',
      frameGlob,
    ]).catch(err => {
      console.error('[converter] ffmpeg frame extract error:', err.stderr || err.message);
      throw err;
    });

    // Collect frame buffers
    const frames = [];
    for (let i = 1; i <= 25; i++) {
      const framePath = join(tmpdir(), `wabot_frame_${id}_${String(i).padStart(4, '0')}.png`);
      const frameBuf  = await readFile(framePath).catch(() => null);
      if (!frameBuf) break;
      frames.push(frameBuf);
      await unlink(framePath).catch(() => {});
    }

    if (frames.length === 0) throw new Error('No frames extracted from video');

    // Assemble animated WebP from frames using sharp
    // sharp expects pages (frames) to be stacked vertically with metadata
    const firstFrame = sharp(frames[0]);
    const { width, height } = await firstFrame.metadata();

    // Stack all frames vertically then interpret as pages
    const allFrames = await Promise.all(
      frames.map(f => sharp(f).resize(MAX_SIZE, MAX_SIZE, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }))
    );

    const pageHeight = allFrames[0].info.height;
    const pageWidth  = allFrames[0].info.width;
    const channels   = allFrames[0].info.channels;

    const combined = Buffer.concat(allFrames.map(f => f.data));

    const webpBuffer = await sharp(combined, {
      raw: { width: pageWidth, height: pageHeight * frames.length, channels },
      animated: true,
    })
      .webp({ quality: 80, effort: 4, loop: 0 })
      .toBuffer();

    console.log(`[converter] animated WebP (ffmpeg+sharp) size: ${webpBuffer.length} bytes, ${frames.length} frames`);
    return webpBuffer;
  } finally {
    await unlink(inputPath).catch(() => {});
    // Clean up any remaining frame files
    for (let i = 1; i <= 25; i++) {
      await unlink(join(tmpdir(), `wabot_frame_${id}_${String(i).padStart(4, '0')}.png`)).catch(() => {});
    }
  }
}
