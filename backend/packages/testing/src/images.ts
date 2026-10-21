import { deflateSync } from 'node:zlib';

/**
 * Hand-assembled, structurally valid tiny images for upload tests (no image libraries).
 * Pixel content is irrelevant (all zero); headers, chunk structure and trailers are real.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const u32be = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const u16be = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const u16le = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32le = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

function pngChunk(type: string, data: Buffer): Buffer {
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  return Buffer.concat([u32be(data.length), td, u32be(crc32(td))]);
}
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG header with arbitrary declared dimensions (IHDR) and no pixel data: for lying / huge-dimension tests. */
export function pngHeaderOnly(width: number, height: number): Buffer {
  const ihdr = Buffer.concat([u32be(width), u32be(height), Buffer.from([8, 0, 0, 0, 0])]);
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(Buffer.alloc(2))), pngChunk('IEND', Buffer.alloc(0))]);
}

/** Real greyscale PNG: pixel rows are actually present and zlib-compressed, so a width x height up to a few MP is cheap. */
export function png(width: number, height: number): Buffer {
  const ihdr = Buffer.concat([u32be(width), u32be(height), Buffer.from([8, 0, 0, 0, 0])]);
  const raw = Buffer.alloc(height * (1 + width)); // filter byte 0 + zero pixels per row
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))]);
}

export interface JpegOpts {
  progressive?: boolean;
  /** add APP1 (with a fake embedded SOF marker inside the payload) and COM segments before the frame header */
  segments?: boolean;
  /** omit the final EOI */
  noEoi?: boolean;
}
const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), u16be(payload.length + 2), payload]);

/** SOI + APP0 [+ APP1 + COM] + DQT + SOF0/SOF2 + DHT + SOS + a few entropy bytes + EOI. */
export function jpeg(width: number, height: number, o: JpegOpts = {}): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8]), seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'))];
  if (o.segments) {
    // a decoy SOF0 header with dimensions 1x1 hidden inside an APP1 payload must never be read as the frame header
    parts.push(seg(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00])])));
    parts.push(seg(0xe2, Buffer.alloc(40, 7)));
    parts.push(seg(0xfe, Buffer.from('a comment', 'latin1')));
  }
  parts.push(seg(0xdb, Buffer.concat([Buffer.from([0x00]), Buffer.alloc(64, 16)])));
  parts.push(seg(o.progressive ? 0xc2 : 0xc0, Buffer.concat([Buffer.from([8]), u16be(height), u16be(width), Buffer.from([1, 1, 0x11, 0])])));
  parts.push(seg(0xc4, Buffer.concat([Buffer.from([0x00]), Buffer.alloc(16, 0), Buffer.from([0])])));
  parts.push(seg(0xda, Buffer.from([1, 1, 0x00, 0, 63, 0])));
  parts.push(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0x78])); // entropy-coded data (FF is stuffed with 00)
  if (!o.noEoi) parts.push(Buffer.from([0xff, 0xd9]));
  return Buffer.concat(parts);
}

function riff(chunks: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), chunks]);
  return Buffer.concat([Buffer.from('RIFF', 'latin1'), u32le(body.length), body]);
}
const webpChunk = (fourcc: string, payload: Buffer) => Buffer.concat([Buffer.from(fourcc, 'latin1'), u32le(payload.length), payload, payload.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);

export function webpLossy(width: number, height: number): Buffer {
  const payload = Buffer.concat([Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]), u16le(width), u16le(height), Buffer.alloc(8)]);
  return riff(webpChunk('VP8 ', payload));
}
export function webpLossless(width: number, height: number): Buffer {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riff(webpChunk('VP8L', Buffer.concat([Buffer.from([0x2f]), u32le(bits >>> 0), Buffer.alloc(6)])));
}
export function webpExtended(width: number, height: number): Buffer {
  const w = width - 1;
  const h = height - 1;
  const vp8x = Buffer.from([0x00, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff]);
  return riff(Buffer.concat([webpChunk('VP8X', vp8x), webpChunk('VP8 ', Buffer.concat([Buffer.from([0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a]), u16le(width & 0x3fff), u16le(height & 0x3fff), Buffer.alloc(8)]))]));
}

export function gif(width: number, height: number): Buffer {
  return Buffer.concat([
    Buffer.from('GIF89a', 'latin1'), u16le(width), u16le(height), Buffer.from([0x00, 0x00, 0x00]),
    Buffer.from([0x2c, 0, 0, 0, 0]), u16le(width), u16le(height), Buffer.from([0x00]),
    Buffer.from([0x02, 0x02, 0x44, 0x01, 0x00]), // LZW min code size, one data block, terminator
    Buffer.from([0x3b]),
  ]);
}
