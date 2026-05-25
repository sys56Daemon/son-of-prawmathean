import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);
const MAX_SIZE = 512;

/**
 * Convert a static image buffer to a 512x512 WebP.
 * Writes the raw downloaded buffer directly to disk — no Jimp step.
 * ffmpeg handles resizing + conversion, which works reliably on Termux.
 */
export async function convertToStaticWebP(imageBuffer) {
  const id = randomUUID();
  const inputPath  = join(tmpdir(), `wabot_in_${id}.jpg`);
  const outputPath = join(tmpdir(), `wabot_out_${id}.webp`);

  try {
    await writeFile(inputPath, imageBuffer);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      '-vcodec', 'libwebp',
      '-preset', 'default',
      '-loop', '0',
      '-an',
      '-vsync', '0',
      outputPath,
    ]).catch(err => {
      console.error('[converter] ffmpeg static error:', err.stderr || err.message);
      throw err;
    });

    const result = await readFile(outputPath);
    console.log(`[converter] static WebP size: ${result.length} bytes`);
    return result;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Convert an animated GIF/video buffer to an animated WebP.
 */
export async function convertToAnimatedWebP(gifBuffer) {
  const id = randomUUID();
  const inputPath  = join(tmpdir(), `wabot_in_${id}.gif`);
  const outputPath = join(tmpdir(), `wabot_out_${id}.webp`);

  try {
    await writeFile(inputPath, gifBuffer);

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      '-vcodec', 'libwebp',
      '-lossless', '0',
      '-compression_level', '6',
      '-q:v', '50',
      '-loop', '0',
      '-an',
      '-preset', 'picture',
      '-fps_mode', 'passthrough',
      outputPath,
    ]).catch(err => {
      console.error('[converter] ffmpeg animated error:', err.stderr || err.message);
      throw err;
    });

    const result = await readFile(outputPath);
    console.log(`[converter] animated WebP size: ${result.length} bytes`);
    return result;
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
