import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

/**
 * Injects WhatsApp sticker pack metadata into a WebP buffer.
 * Uses the 'webpmux' binary to ensure the container structure (VP8X, RIFF sizes) is perfect.
 */
export async function addStickerMetadata(webpBuffer, packName, authorName) {
  const json = JSON.stringify({
    'sticker-pack-id':        randomUUID(),
    'sticker-pack-name':      packName,
    'sticker-pack-publisher': authorName,
    'emojis':                 ['🎭'],
  });

  const id = randomUUID();
  const exifPath  = join(tmpdir(), `wabot_metadata_${id}.exif`);
  const inputPath = join(tmpdir(), `wabot_metadata_in_${id}.webp`);
  const outputPath = join(tmpdir(), `wabot_metadata_out_${id}.webp`);

  try {
    const tiffBuffer = buildTiff(json);
    await writeFile(exifPath, tiffBuffer);
    await writeFile(inputPath, webpBuffer);

    console.log(`[metadata] injecting metadata for "${packName}"...`);
    // Use webpmux to set the EXIF chunk. 
    // This automatically handles VP8X header and RIFF size updates.
    await execFileAsync('webpmux', [
      '-set', 'exif', exifPath,
      inputPath,
      '-o', outputPath
    ]).catch(err => {
      console.error('[metadata] webpmux error:', err.stderr || err.message);
      throw err;
    });

    const result = await readFile(outputPath);
    console.log(`[metadata] success, output size: ${result.length} bytes`);
    return result;
  } catch (err) {
    console.warn('[metadata] injection failed, sending without metadata:', err.message);
    return webpBuffer;
  } finally {
    await Promise.all([
      unlink(exifPath).catch(() => {}),
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a valid TIFF payload containing the JSON string in a
 * TIFF UserComment (0x9286) tag.
 *
 * NOTE: Do NOT include "Exif\0\0" here if passing to 'webpmux -set exif'.
 */
function buildTiff(jsonString) {
  const json = Buffer.from(jsonString, 'utf8');
  
  // WhatsApp requires the UserComment (0x9286) to be prefixed with 8-byte encoding
  // 0x41 0x53 0x43 0x49 0x49 0x00 0x00 0x00 = "ASCII\0\0\0"
  const prefix = Buffer.from([0x41, 0x53, 0x43, 0x49, 0x49, 0x00, 0x00, 0x00]);
  const userComment = Buffer.concat([prefix, json]);

  // Minimal TIFF structure:
  // 0-7:   TIFF Header (II * 42 08 00 00 00)
  // 8-9:   Entry count (1)
  // 10-21: Entry (Tag: 0x9286, Type: 7, Count: userComment.length, Offset: 26)
  // 22-25: Next IFD offset (0)
  // 26+:   Data (userComment bytes)
  
  const IFD_OFFSET  = 8;
  const DATA_OFFSET = 26; 

  const tiff = Buffer.alloc(DATA_OFFSET + userComment.length);
  let p = 0;
  tiff.writeUInt16LE(0x4949, p); p += 2; // byte order: little-endian
  tiff.writeUInt16LE(42,     p); p += 2; // TIFF magic
  tiff.writeUInt32LE(IFD_OFFSET, p); p += 4; // offset to IFD0

  tiff.writeUInt16LE(1, p); p += 2; // 1 entry

  // Tag 0x9286 UserComment
  tiff.writeUInt16LE(0x9286,             p); p += 2;
  tiff.writeUInt16LE(7,                  p); p += 2; // Type: UNDEFINED
  tiff.writeUInt32LE(userComment.length, p); p += 4; // Count
  tiff.writeUInt32LE(DATA_OFFSET,        p); p += 4; // Offset to data

  tiff.writeUInt32LE(0, p); p += 4; // next IFD = none
  userComment.copy(tiff, p);

  return tiff;
}
