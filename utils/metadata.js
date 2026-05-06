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
 * Splices an EXIF chunk into a WebP (RIFF) buffer.
 *
 * This implementation is robust:
 * 1. It ensures a VP8X (Extended Header) chunk exists (mandatory for metadata).
 * 2. It sets the "Has Metadata" bit in the VP8X flags.
 * 3. It inserts the EXIF chunk in the correct sequence (before image data).
 */
function injectExifChunk(webpBuffer, exifData) {
  const header = webpBuffer.slice(0, 12);
  if (header.slice(0, 4).toString('ascii') !== 'RIFF' || header.slice(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error('Invalid WebP buffer');
  }

  // Chunks start at offset 12
  let chunks = [];
  let offset = 12;
  while (offset < webpBuffer.length) {
    const fourCC = webpBuffer.slice(offset, offset + 4).toString('ascii');
    const size   = webpBuffer.readUInt32LE(offset + 4);
    const total  = 8 + size + (size % 2); // 8 bytes header + payload + padding
    chunks.push({ fourCC, data: webpBuffer.slice(offset, offset + total) });
    offset += total;
  }

  // 1. Ensure VP8X exists
  let vp8xIdx = chunks.findIndex(c => c.fourCC === 'VP8X');
  if (vp8xIdx === -1) {
    // We must create a VP8X chunk. To do this correctly, we'd need to extract 
    // width/height from the VP8/VP8L chunk. However, for stickers, we know 
    // they are 512x512 (0x200x0x200). 
    // WebP VP8X uses 24-bit (3 bytes) for width-1 and height-1.
    // 512-1 = 511 = 0x0001FF.
    const vp8xData = Buffer.alloc(10 + 8); // 8 header + 10 payload
    vp8xData.write('VP8X', 0);
    vp8xData.writeUInt32LE(10, 4);
    vp8xData[8] = 0x00; // flags: will set metadata bit later
    // Width (24 bit) at offset 12: 511 -> FF 01 00
    vp8xData[12] = 0xFF; vp8xData[13] = 0x01; vp8xData[14] = 0x00;
    // Height (24 bit) at offset 15: 511 -> FF 01 00
    vp8xData[15] = 0xFF; vp8xData[16] = 0x01; vp8xData[17] = 0x00;
    
    chunks.unshift({ fourCC: 'VP8X', data: vp8xData });
    vp8xIdx = 0;
  }

  // 2. Set Metadata flag in VP8X (bit 3 of the first byte of payload, which is index 8 of the chunk data)
  // Flags byte: Rsv | Icc | Alpha | Exif | Xmp | Anim | Rsv | Rsv
  // We want to set Exif (bit 3, mask 0x08)
  chunks[vp8xIdx].data[8] |= 0x08;

  // 3. Remove any existing EXIF chunks to prevent duplicates
  chunks = chunks.filter(c => c.fourCC !== 'EXIF');

  // 4. Create the new EXIF chunk
  const pad         = exifData.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  const exifHeader  = Buffer.alloc(8);
  exifHeader.write('EXIF', 0);
  exifHeader.writeUInt32LE(exifData.length, 4);
  const exifChunk = { fourCC: 'EXIF', data: Buffer.concat([exifHeader, exifData, pad]) };

  // 5. Insert EXIF at the end (spec requires EXIF to be after image data VP8/VP8L/ANMF)
  chunks.push(exifChunk);

  // 6. Reassemble RIFF
  const body     = Buffer.concat(chunks.map(c => c.data));
  const newHeader = Buffer.alloc(12);
  newHeader.write('RIFF', 0);
  newHeader.writeUInt32LE(body.length + 4, 4);
  newHeader.write('WEBP', 8);

  return Buffer.concat([newHeader, body]);
}
