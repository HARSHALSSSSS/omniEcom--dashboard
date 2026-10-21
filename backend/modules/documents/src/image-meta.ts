/**
 * Small, dependency-free image header parsers (PNG, JPEG, WebP, GIF).
 *
 * Every read is bounds-checked and every loop advances by at least one byte per iteration, so hostile input
 * cannot cause an out-of-range read or an endless loop. Only headers / chunk structure are inspected: pixel data
 * is never decoded (no decompression-bomb exposure). `complete` says whether the container structure reaches its
 * natural end (PNG IEND, JPEG EOI, GIF trailer, WebP RIFF length), which is how truncated uploads are detected.
 */
export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif';

export const KIND_MIME: Record<ImageKind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };

export interface ImageInfo { kind: ImageKind; mime: string; width: number; height: number; complete: boolean }
export type ParseResult =
  | { ok: true; info: ImageInfo }
  | { ok: false; reason: 'unknown_format' | 'corrupt'; kind?: ImageKind };

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (b: Buffer, start: number, len: number): string => (start >= 0 && start + len <= b.length ? b.toString('latin1', start, start + len) : '');

/** Identify the format from magic bytes only. */
export function detectImageKind(b: Buffer): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && PNG_SIG.every((v, i) => b[i] === v)) return 'png';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (b.length >= 6 && (ascii(b, 0, 6) === 'GIF87a' || ascii(b, 0, 6) === 'GIF89a')) return 'gif';
  return null;
}

function parsePng(b: Buffer): ParseResult {
  // signature (8) + IHDR chunk: length(4)=13, type(4)='IHDR', data(13), crc(4)
  if (b.length < 33 || b.readUInt32BE(8) !== 13 || ascii(b, 12, 4) !== 'IHDR') return { ok: false, reason: 'corrupt', kind: 'png' };
  const width = b.readUInt32BE(16);
  const height = b.readUInt32BE(20);
  let pos = 8;
  let complete = false;
  while (pos + 12 <= b.length) {
    const len = b.readUInt32BE(pos);
    const next = pos + 12 + len;
    if (next > b.length) break; // chunk runs past the end: truncated
    if (ascii(b, pos + 4, 4) === 'IEND') { complete = true; break; }
    pos = next; // always > pos: terminates
  }
  return { ok: true, info: { kind: 'png', mime: KIND_MIME.png, width, height, complete } };
}

/** SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC). */
const isSof = (m: number): boolean => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function parseJpeg(b: Buffer): ParseResult {
  const n = b.length;
  let i = 2; // after SOI
  while (i < n) {
    if (b[i] !== 0xff) return { ok: false, reason: 'corrupt', kind: 'jpeg' }; // garbage between segments
    while (i < n && b[i] === 0xff) i++; // fill bytes
    if (i >= n) break;
    const m = b[i]!;
    i++;
    if (m === 0x00 || m === 0x01 || (m >= 0xd0 && m <= 0xd8)) continue; // stuffed byte / TEM / RSTn / SOI: no length
    if (m === 0xd9 || m === 0xda) return { ok: false, reason: 'corrupt', kind: 'jpeg' }; // EOI or scan before any frame header
    if (i + 2 > n) break; // truncated inside the length field
    const len = b.readUInt16BE(i);
    if (len < 2) return { ok: false, reason: 'corrupt', kind: 'jpeg' };
    if (isSof(m)) {
      if (len < 8 || i + 7 > n) return { ok: false, reason: 'corrupt', kind: 'jpeg' };
      const height = b.readUInt16BE(i + 3);
      const width = b.readUInt16BE(i + 5);
      // a complete file has an EOI marker after the frame header (entropy data never contains FF D9)
      const tail = b.lastIndexOf(Buffer.from([0xff, 0xd9]));
      return { ok: true, info: { kind: 'jpeg', mime: KIND_MIME.jpeg, width, height, complete: tail > i } };
    }
    i += len; // skip APPn / COM / DQT / DHT / DRI ... safely by declared length (i grows by >= 2)
  }
  return { ok: false, reason: 'corrupt', kind: 'jpeg' };
}

function parseWebp(b: Buffer): ParseResult {
  if (b.length < 30) return { ok: false, reason: 'corrupt', kind: 'webp' };
  const riffSize = b.readUInt32LE(4);
  const chunk = ascii(b, 12, 4);
  const chunkSize = b.readUInt32LE(16);
  let width: number;
  let height: number;
  if (chunk === 'VP8 ') {
    // frame tag (3 bytes), start code 9D 01 2A, then 14-bit width / height (+2 bit scale)
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return { ok: false, reason: 'corrupt', kind: 'webp' };
    width = b.readUInt16LE(26) & 0x3fff;
    height = b.readUInt16LE(28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) return { ok: false, reason: 'corrupt', kind: 'webp' };
    const bits = b.readUInt32LE(21);
    width = (bits & 0x3fff) + 1;
    height = ((bits >>> 14) & 0x3fff) + 1;
  } else if (chunk === 'VP8X') {
    width = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    height = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
  } else return { ok: false, reason: 'corrupt', kind: 'webp' };
  const complete = riffSize + 8 <= b.length && chunkSize + 20 <= b.length;
  return { ok: true, info: { kind: 'webp', mime: KIND_MIME.webp, width, height, complete } };
}

function parseGif(b: Buffer): ParseResult {
  if (b.length < 13) return { ok: false, reason: 'corrupt', kind: 'gif' };
  const width = b.readUInt16LE(6);
  const height = b.readUInt16LE(8);
  let end = b.length;
  while (end > 13 && b[end - 1] === 0 && b.length - end < 16) end--; // tolerate a little zero padding
  return { ok: true, info: { kind: 'gif', mime: KIND_MIME.gif, width, height, complete: b[end - 1] === 0x3b } };
}

export function parseImage(b: Buffer): ParseResult {
  const kind = detectImageKind(b);
  if (!kind) return { ok: false, reason: 'unknown_format' };
  switch (kind) {
    case 'png': return parsePng(b);
    case 'jpeg': return parseJpeg(b);
    case 'webp': return parseWebp(b);
    case 'gif': return parseGif(b);
  }
}
