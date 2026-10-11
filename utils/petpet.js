import { createCanvas, loadImage } from '@napi-rs/canvas';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execFileAsync = promisify(execFile);

// ── Constants (match benisland.neocities.org/petpet exactly) ─────────────────

const OUT_SIZE   = 112;   // output canvas size in px
const NUM_FRAMES = 5;
const FRAME_DELAY_MS = 60; // ~16 fps

// Per-frame offset table — direct port from the original petpet source.
// Each entry shifts/squishes the subject image as the hand comes down.
const FRAME_OFFSETS = [
  { x:  0, y:  0, w:  0, h:   0 },
  { x: -4, y: 12, w:  4, h: -12 },
  { x:-12, y: 18, w: 12, h: -18 },
  { x: -8, y: 12, w:  4, h: -12 },
  { x: -4, y:  0, w:  0, h:   0 },
];

// Default positioning (matches petpet website DEFAULTS)
const SPRITE_X      = 14;    // subject x offset
const SPRITE_Y      = 20;    // subject y offset
const SCALE         = 0.875; // subject scale
const SQUISH        = 1.25;  // squish intensity

// Path to the bundled 5-frame hand sprite (560×112 PNG strip)
const __dir      = dirname(fileURLToPath(import.meta.url));
const SPRITE_PATH = join(__dir, '..', 'assets', 'petpet-sprite.png');

// ── Core generator ────────────────────────────────────────────────────────────

/**
 * Generate a petpet animated WebP sticker from any image buffer.
 *
 * @param {Buffer} imageBuffer  - JPEG / PNG / WebP / etc. image to pet
 * @returns {Promise<Buffer>}   - Animated WebP buffer ready to send as sticker
 */
export async function generatePetpet(imageBuffer) {
  // Load subject image and hand sprite
  const subject = await loadImage(imageBuffer);
  const hand    = await loadImage(SPRITE_PATH);

  // Scale subject dimensions to fit inside the canvas (preserving aspect ratio)
  const subjectAspect  = subject.naturalHeight / subject.naturalWidth;
  const baseW          = Math.round(OUT_SIZE * SCALE);
  const baseH          = Math.round(baseW * subjectAspect);

  // Render each of the 5 frames to a PNG buffer
  const canvas = createCanvas(OUT_SIZE, OUT_SIZE);
  const ctx    = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const id      = randomUUID();
  const tmpDir  = tmpdir();
  const framePaths = [];

  for (let i = 0; i < NUM_FRAMES; i++) {
    const off = FRAME_OFFSETS[i];

    // Subject position & size for this frame (matches getSpriteFrame() in the original)
    const dx = Math.trunc(SPRITE_X + off.x * (SQUISH * 0.4));
    const dy = Math.trunc(SPRITE_Y + off.y * (SQUISH * 0.9));
    const dw = Math.trunc((baseW   + off.w * SQUISH));
    const dh = Math.trunc((baseH   + off.h * SQUISH));

    // Hand vertical position (original formula: cf.dy * 0.75 - spriteY - 0.5)
    const handDy = Math.max(0, Math.trunc(dy * 0.75 - Math.max(0, SPRITE_Y) - 0.5));

    // Clear frame
    ctx.clearRect(0, 0, OUT_SIZE, OUT_SIZE);

    // Draw squished/translated subject
    if (dw > 0 && dh > 0) {
      ctx.drawImage(subject, dx, dy, dw, dh);
    }

    // Draw the correct hand frame (sprite strip: frame i is at x = i * OUT_SIZE)
    ctx.drawImage(
      hand,
      i * OUT_SIZE, 0,          // source x, y
      OUT_SIZE,     OUT_SIZE,   // source w, h
      0,            handDy,     // dest x, y
      OUT_SIZE,     OUT_SIZE,   // dest w, h
    );

    // Export frame as PNG
    const framePath = join(tmpDir, `petpet_${id}_f${i}.png`);
    const pngBuf    = canvas.toBuffer('image/png');
    await writeFile(framePath, pngBuf);
    framePaths.push(framePath);
  }

  // ── Assemble animated WebP via ffmpeg ─────────────────────────────────────

  // Build a concat demuxer input file: each frame with its duration
  const concatLines = framePaths.map(p => `file '${p}'\nduration ${FRAME_DELAY_MS / 1000}`).join('\n');
  // Repeat the last frame entry (ffmpeg concat requires a final terminator)
  const concatContent = concatLines + `\nfile '${framePaths[framePaths.length - 1]}'`;

  const concatPath = join(tmpDir, `petpet_${id}_concat.txt`);
  const outPath    = join(tmpDir, `petpet_${id}_out.webp`);

  await writeFile(concatPath, concatContent);

  try {
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatPath,
      '-vcodec', 'libwebp_anim',
      '-loop', '0',
      '-preset', 'default',
      '-an',
      outPath,
    ]).catch(err => {
      console.error('[petpet] ffmpeg error:', err.stderr || err.message);
      throw err;
    });

    const result = await readFile(outPath);
    console.log(`[petpet] animated WebP size: ${result.length} bytes`);
    return result;

  } finally {
    // Clean up temp files
    await unlink(concatPath).catch(() => {});
    await unlink(outPath).catch(() => {});
    for (const p of framePaths) {
      await unlink(p).catch(() => {});
    }
  }
}
