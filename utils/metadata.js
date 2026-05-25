import { randomUUID } from 'crypto';

/**
 * Injects WhatsApp sticker pack metadata into a WebP buffer.
 *
 * Strategy: Build an EXIF chunk containing the JSON metadata and
 * append it to the end of the existing WebP RIFF stream.
 * Final structure: VP8 → EXIF  (no VP8X needed for WhatsApp mobile)
 */
export async function addStickerMetadata(webpBuffer, packName, authorName) {
  const json = JSON.stringify({
    'sticker-pack-id':        randomUUID(),
    'sticker-pack-name':      packName,
    'sticker-pack-publisher': authorName,
    'emojis':                 ['🎭'],
  });

  try {
    return injectExif(webpBuffer, json);
  } catch (err) {
    console.warn('[metadata] injection failed, sending without metadata:', err.message);
    return webpBuffer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a minimal EXIF payload containing the JSON string in a
 * TIFF UserComment (0x9286) tag, prefixed with the "Exif\0\0" header.
 */
function buildExif(jsonString) {
  const json = Buffer.from(jsonString, 'utf8');

  // Offsets within the TIFF stream (after the 6-byte "Exif\0\0" marker):
  //   0  - 7 : TIFF header  (II + magic 42 + IFD0 offset = 8)
  //   8  - 9 : IFD entry count (1)
  //  10  - 21: IFD entry     (tag + type + count + valueOffset)
  //  22  - 25: next-IFD pointer (0)
  //  26+     : JSON bytes
  const IFD_OFFSET  = 8;
  const DATA_OFFSET = 26; // IFD_OFFSET + 2 (count) + 12 (entry) + 4 (next-IFD)

  const tiff = Buffer.alloc(DATA_OFFSET + json.length);
  let p = 0;
  tiff.writeUInt16LE(0x4949, p); p += 2; // byte order: little-endian
  tiff.writeUInt16LE(42,     p); p += 2; // TIFF magic
  tiff.writeUInt32LE(IFD_OFFSET, p); p += 4; // offset to IFD0

  tiff.writeUInt16LE(1, p); p += 2; // 1 IFD entry

  // Tag 0x9286 UserComment, type UNDEFINED (7), count = json length, value at DATA_OFFSET
  tiff.writeUInt16LE(0x9286,      p); p += 2;
  tiff.writeUInt16LE(7,           p); p += 2;
  tiff.writeUInt32LE(json.length, p); p += 4;
  tiff.writeUInt32LE(DATA_OFFSET, p); p += 4;

  tiff.writeUInt32LE(0, p); p += 4; // next IFD = none
  json.copy(tiff, p);                // JSON payload

  return Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
}

/**
 * Appends an EXIF chunk to a WebP (RIFF) buffer and updates the RIFF size.
 * Simple append to end — no VP8X manipulation needed.
 */
function injectExif(webpBuffer, jsonString) {
  if (
    webpBuffer.slice(0, 4).toString() !== 'RIFF' ||
    webpBuffer.slice(8, 12).toString() !== 'WEBP'
  ) throw new Error('Not a valid WebP buffer');

  const exifData = buildExif(jsonString);
  const chunkSize = exifData.length;
  const pad = chunkSize % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);

  // EXIF chunk: 4-byte FourCC + 4-byte LE size + payload + optional pad byte
  const chunkHdr = Buffer.alloc(8);
  chunkHdr.write('EXIF', 0);
  chunkHdr.writeUInt32LE(chunkSize, 4);
  const exifChunk = Buffer.concat([chunkHdr, exifData, pad]);

  // Existing body (everything after the 12-byte RIFF/WEBP header)
  const existingBody = webpBuffer.slice(12);

  // New RIFF size = 4 ("WEBP") + existing body + new EXIF chunk
  const newRiffSize = 4 + existingBody.length + exifChunk.length;

  const newHeader = Buffer.alloc(12);
  newHeader.write('RIFF', 0);
  newHeader.writeUInt32LE(newRiffSize, 4);
  newHeader.write('WEBP', 8);

  return Buffer.concat([newHeader, existingBody, exifChunk]);
}
