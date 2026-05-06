import { randomUUID } from 'crypto';

/**
 * Injects WhatsApp sticker pack metadata into a WebP buffer.
 *
 * WHY raw RIFF injection instead of a library:
 *   Standard libraries often expect specific object formats or strip existing
 *   containers. By building the EXIF chunk ourselves and splicing it into the
 *   RIFF container, we guarantee compatibility with WhatsApp's requirements.
 *
 * WHY "Exif\0\0" prefix:
 *   WebP EXIF chunks must begin with the 6-byte Exif marker that WhatsApp
 *   expects (same convention as JPEG APP1, carried into WebP by convention).
 *   Without it, the metadata fields are invisible to WhatsApp.
 */
export async function addStickerMetadata(webpBuffer, packName, authorName, animated = false) {
  const json = JSON.stringify({
    'sticker-pack-id':        randomUUID(),
    'sticker-pack-name':      packName,
    'sticker-pack-publisher': authorName,
    'emojis':                 ['🎭'],
  });

  try {
    // The webpBuffer is already a normalized 512x512 WebP from converter.js
    // We just inject the EXIF chunk into the RIFF stream.
    return injectExifChunk(webpBuffer, buildExifChunkData(json));

  } catch (err) {
    console.warn('[metadata] injection failed — sending without metadata:', err.message);
    return webpBuffer;
  }
}

// ── Builders ─────────────────────────────────────────────────────────────────

/**
 * Builds the raw bytes that go inside a WebP EXIF chunk:
 *   "Exif\0\0" (6 bytes)  ← marker WhatsApp expects
 *   + TIFF IFD0 header
 *   + 1 IFD entry: UserComment (0x9286) → raw JSON bytes
 */
function buildExifChunkData(jsonString) {
  const jsonBuf    = Buffer.from(jsonString, 'utf8');
  const dataOffset = 8 + 2 + 12 + 4; // TIFF header + IFD count + entry + nextIFD ptr

  const tiff = Buffer.alloc(dataOffset + jsonBuf.length);
  let o = 0;

  // TIFF header (little-endian)
  tiff.writeUInt16LE(0x4949, o); o += 2; // 'II'
  tiff.writeUInt16LE(42,     o); o += 2; // TIFF magic
  tiff.writeUInt32LE(8,      o); o += 4; // offset to IFD0

  // IFD0: 1 entry
  tiff.writeUInt16LE(1, o); o += 2;

  // Entry: UserComment (0x9286), type UNDEFINED (7)
  tiff.writeUInt16LE(0x9286,         o); o += 2;
  tiff.writeUInt16LE(7,              o); o += 2;
  tiff.writeUInt32LE(jsonBuf.length, o); o += 4;
  tiff.writeUInt32LE(dataOffset,     o); o += 4;

  // Next IFD pointer = 0 (none)
  tiff.writeUInt32LE(0, o); o += 4;

  // JSON payload
  jsonBuf.copy(tiff, o);

  // Prepend the "Exif\0\0" marker
  return Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), tiff]);
}

/**
 * Splices an EXIF chunk into an existing WebP (RIFF) file and updates
 * the RIFF file-size field.
 */
function injectExifChunk(webpBuffer, exifData) {
  if (
    webpBuffer.slice(0, 4).toString('ascii') !== 'RIFF' ||
    webpBuffer.slice(8, 12).toString('ascii') !== 'WEBP'
  ) {
    throw new Error('Input is not a valid WebP file.');
  }

  // EXIF chunk: fourCC + little-endian size + data + padding byte if odd
  const pad         = exifData.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write('EXIF', 0, 'ascii');
  chunkHeader.writeUInt32LE(exifData.length, 4);
  const exifChunk = Buffer.concat([chunkHeader, exifData, pad]);

  // Rebuild RIFF with updated file size
  const originalChunks = webpBuffer.slice(12);
  const riffHeader     = Buffer.alloc(12);
  riffHeader.write('RIFF', 0, 'ascii');
  riffHeader.writeUInt32LE(4 + originalChunks.length + exifChunk.length, 4);
  riffHeader.write('WEBP', 8, 'ascii');

  return Buffer.concat([riffHeader, originalChunks, exifChunk]);
}
