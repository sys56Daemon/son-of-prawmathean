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

    const { stderr } = await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `scale=${MAX_SIZE}:${MAX_SIZE}:force_original_aspect_ratio=decrease,pad=${MAX_SIZE}:${MAX_SIZE}:(ow-iw)/2:(oh-ih)/2`,
      '-compression_level', '6',
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

    const vf = [
      `scale='if(gt(iw,ih),${MAX_SIZE},-2)':'if(gt(iw,ih),-2,${MAX_SIZE})'`,
      `pad=${MAX_SIZE}:${MAX_SIZE}:(ow-iw)/2:(oh-ih)/2`,
    ].join(',');

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', vf,
      '-loop', '0',
      '-an',
      '-vsync', '0',
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
