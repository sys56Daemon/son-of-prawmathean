import { randomUUID } from 'crypto';

/**
 * Injects WhatsApp sticker pack metadata (as an EXIF chunk) into a WebP buffer.
 *
 * This implementation is fully spec-compliant with the WebP Extended File Format:
 * https://developers.google.com/speed/webp/docs/riff_container#extended_file_format
 *
 * Rules enforced:
 *  1. If the WebP already has a VP8X chunk → set its EXIF flag (bit 3) and append EXIF.
 *  2. If the WebP is a simple VP8 or VP8L → inject a VP8X chunk with EXIF flag, then append EXIF.
 *  3. The EXIF chunk MUST appear after the image bitstream (VP8/VP8L/ANMF).
 *  4. Chunk sizes are 4-byte LE and chunk payloads are padded to even byte boundaries.
 */
export async function addStickerMetadata(webpBuffer, packName, authorName, isAnimated = false) {
  const json = JSON.stringify({
    'sticker-pack-id':        randomUUID(),
    'sticker-pack-name':      packName,
    'sticker-pack-publisher': authorName,
    'emojis':                 ['🎭'],
    'is-animated':            isAnimated,
  });

  try {
    return injectExif(webpBuffer, json);
  } catch (err) {
    console.warn('[metadata] EXIF injection failed, sending without metadata:', err.message);
    return webpBuffer;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** VP8X flags byte (byte 0 of the 4-byte flags field at offset 20 in the file) */
const VP8X_EXIF_FLAG = 0x08;  // bit 3
const VP8X_ANIM_FLAG = 0x20;  // bit 5 (just for reference)

/**
 * Builds the EXIF payload: "Exif\0\0" header + minimal TIFF IFD + JSON data.
 * The JSON is stored in UserComment tag (0x9286), type UNDEFINED.
 */
function buildExifPayload(jsonString) {
  const jsonBuf = Buffer.from(jsonString, 'utf8');

  // TIFF structure (little-endian):
  //   Byte 0–1 : 0x4949 (II = little-endian)
  //   Byte 2–3 : 42 (TIFF magic)
  //   Byte 4–7 : IFD0 offset from start of TIFF = 8
  //   Byte 8–9 : number of IFD entries = 1
  //   Byte 10–21: IFD entry (tag 2B + type 2B + count 4B + offset/value 4B)
  //   Byte 22–25: next IFD offset = 0 (end)
  //   Byte 26+  : JSON data
  const DATA_OFFSET = 26;
  const tiff = Buffer.alloc(DATA_OFFSET + jsonBuf.length);
  let p = 0;
  tiff.writeUInt16LE(0x4949, p); p += 2;         // byte order: LE
  tiff.writeUInt16LE(42,     p); p += 2;         // TIFF magic
  tiff.writeUInt32LE(8,      p); p += 4;         // IFD0 at byte 8

  tiff.writeUInt16LE(1, p); p += 2;              // 1 entry
  tiff.writeUInt16LE(0x9286,       p); p += 2;  // tag: UserComment
  tiff.writeUInt16LE(7,            p); p += 2;  // type: UNDEFINED
  tiff.writeUInt32LE(jsonBuf.length, p); p += 4; // count
  tiff.writeUInt32LE(DATA_OFFSET,  p); p += 4;  // value offset (from TIFF start)
  tiff.writeUInt32LE(0,            p); p += 4;  // next IFD = none
  jsonBuf.copy(tiff, p);

  // Prepend the Exif marker (6 bytes: "Exif" + two null bytes)
  return Buffer.concat([Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]), tiff]);
}

/** Pack a WebP chunk: FourCC(4) + size-LE(4) + payload + optional pad byte */
function makeChunk(fourCC, payload) {
  const hdr = Buffer.alloc(8);
  hdr.write(fourCC, 0, 'ascii');
  hdr.writeUInt32LE(payload.length, 4);
  const pad = payload.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([hdr, payload, pad]);
}

/**
 * Spec-compliant EXIF injection into any WebP variant:
 *   - Simple VP8  → insert VP8X (with EXIF flag) + VP8 bitstream + EXIF chunk
 *   - Simple VP8L → insert VP8X (with EXIF flag) + VP8L bitstream + EXIF chunk
 *   - Extended VP8X (already has VP8X) → set EXIF flag in VP8X, append EXIF chunk
 */
function injectExif(webpBuffer, jsonString) {
  if (
    webpBuffer.slice(0, 4).toString('ascii') !== 'RIFF' ||
    webpBuffer.slice(8, 12).toString('ascii') !== 'WEBP'
  ) throw new Error('Not a valid WebP buffer');

  const exifPayload = buildExifPayload(jsonString);
  const exifChunk   = makeChunk('EXIF', exifPayload);

  const firstFourCC = webpBuffer.slice(12, 16).toString('ascii');

  // ── Case 1: Already has VP8X ──────────────────────────────────────────────
  if (firstFourCC === 'VP8X') {
    // VP8X chunk payload starts at offset 20. Flags are bytes 0–3 of payload.
    // We need to set bit 3 (EXIF) in byte 0 (since flags are stored LE).
    const result = Buffer.from(webpBuffer); // clone — don't mutate the original
    result[20] = result[20] | VP8X_EXIF_FLAG;  // set EXIF bit in VP8X flags

    // Recompute RIFF size
    const body    = result.slice(12);
    const newSize = 4 + body.length + exifChunk.length;
    result.writeUInt32LE(newSize, 4);

    return Buffer.concat([result, exifChunk]);
  }

  // ── Case 2: Simple VP8 or VP8L — need to inject VP8X first ───────────────
  const imageBitstream = webpBuffer.slice(12);  // everything after RIFF/WEBP header

  // Read canvas dimensions from the bitstream
  let canvasW, canvasH;
  if (firstFourCC === 'VP8 ') {
    // VP8 bitstream: bytes 26–27 = width-1, bytes 28–29 = height-1
    // (offset 12 [RIFF hdr] + 8 [chunk hdr] + 3 [frame tag] + 3 [start code] = 26)
    canvasW = (webpBuffer.readUInt16LE(26) & 0x3FFF);
    canvasH = (webpBuffer.readUInt16LE(28) & 0x3FFF);
  } else if (firstFourCC === 'VP8L') {
    // VP8L: signature byte at offset 20, then bitfield. Width stored as (bits 0-13)+1, height (bits 14-27)+1
    const bits = webpBuffer.readUInt32LE(21);
    canvasW = (bits & 0x3FFF) + 1;
    canvasH = ((bits >> 14) & 0x3FFF) + 1;
  } else {
    throw new Error(`Unsupported WebP chunk type: "${firstFourCC}"`);
  }

  // Build VP8X payload: 4-byte flags + 3-byte width-1 (LE) + 3-byte height-1 (LE)
  const vp8xPayload = Buffer.alloc(10);
  vp8xPayload.writeUInt32LE(VP8X_EXIF_FLAG, 0);       // flags: EXIF bit set
  vp8xPayload.writeUIntLE(canvasW - 1, 4, 3);          // canvas width minus one
  vp8xPayload.writeUIntLE(canvasH - 1, 7, 3);          // canvas height minus one
  const vp8xChunk = makeChunk('VP8X', vp8xPayload);

  // New file: RIFF header + VP8X + original image bitstream + EXIF
  const newBody = Buffer.concat([vp8xChunk, imageBitstream, exifChunk]);
  const newRiffSize = 4 + newBody.length; // 4 for "WEBP" + body

  const newHeader = Buffer.alloc(12);
  newHeader.write('RIFF', 0, 'ascii');
  newHeader.writeUInt32LE(newRiffSize, 4);
  newHeader.write('WEBP', 8, 'ascii');

  return Buffer.concat([newHeader, newBody]);
}
