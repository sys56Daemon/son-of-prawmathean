import { Jimp } from 'jimp';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);
const MAX_SIZE = 512;

/**
 * Convert a static image buffer (JPEG, PNG, WebP, etc.) to a 512x512 WebP buffer.
 * Uses jimp v1 (pure JS) — works on Arch Linux / Termux without native binaries.
 * Note: jimp outputs PNG internally; ffmpeg converts to WebP for sticker compatibility.
 */
export async function convertToStaticWebP(imageBuffer) {
  const id = randomUUID();
  const inputPath  = join(tmpdir(), `wabot_in_${id}.png`);
  const outputPath = join(tmpdir(), `wabot_out_${id}.webp`);

  try {
    // Resize with jimp v1 (pure JS, no native deps)
    const image = await Jimp.fromBuffer(imageBuffer);
    // containWithin: fit inside MAX_SIZE x MAX_SIZE, preserving aspect ratio
    const w = image.width;
    const h = image.height;
    const scale = Math.min(MAX_SIZE / w, MAX_SIZE / h);
    image.resize({ w: Math.round(w * scale), h: Math.round(h * scale) });
    const pngBuffer = await image.getBuffer('image/png');

    // Write PNG, then convert to WebP via ffmpeg
    await writeFile(inputPath, pngBuffer);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', `scale=${MAX_SIZE}:${MAX_SIZE}:force_original_aspect_ratio=decrease,pad=${MAX_SIZE}:${MAX_SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
      '-compression_level', '6',
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Convert an animated GIF/video buffer to an animated WebP buffer using ffmpeg.
 * Requires: pkg install ffmpeg  (Termux) or  apt install ffmpeg  (Debian)
 */
export async function convertToAnimatedWebP(gifBuffer) {
  const id = randomUUID();
  const inputPath  = join(tmpdir(), `wabot_in_${id}.gif`);
  const outputPath = join(tmpdir(), `wabot_out_${id}.webp`);

  try {
    await writeFile(inputPath, gifBuffer);

    // Scale to fit within 512x512 keeping aspect ratio, transparent pad if needed
    const vf = [
      `scale='if(gt(iw,ih),${MAX_SIZE},-2)':'if(gt(iw,ih),-2,${MAX_SIZE})'`,
      `pad=${MAX_SIZE}:${MAX_SIZE}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
    ].join(',');

    await execFileAsync('ffmpeg', [
      '-y',
      '-i', inputPath,
      '-vf', vf,
      '-loop', '0',
      '-preset', 'default',
      '-an',
      '-vsync', '0',
      outputPath,
    ]);

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
