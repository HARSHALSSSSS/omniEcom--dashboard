import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { AppError } from '@oms/shared';

/**
 * Minimal XLSX support with Node built-ins only: a zip reader (central directory, stored + deflate), a worksheet reader
 * (shared strings, inline strings, first sheet) and a small writer used for the import template.
 */
const unsupported = (msg: string) => new AppError('UNSUPPORTED_MEDIA_TYPE', msg, { details: { rule: 'unsupported_file' } });
const MAX_PART_BYTES = 200 * 1024 * 1024;

interface ZipEntry { method: number; compressedSize: number; size: number; offset: number }

function zipEntries(buf: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw unsupported('The file is not a valid XLSX workbook');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || p === 0xffffffff) throw unsupported('ZIP64 workbooks are not supported');
  if (count > 5_000) throw unsupported('The workbook has too many parts');
  const out = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw unsupported('The file is not a valid XLSX workbook');
    const flags = buf.readUInt16LE(p + 8);
    if (flags & 1) throw unsupported('Password protected workbooks are not supported');
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    out.set(buf.toString('utf8', p + 46, p + 46 + nameLen), {
      method: buf.readUInt16LE(p + 10), compressedSize: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24), offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function zipRead(buf: Buffer, e: ZipEntry): Buffer {
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) throw unsupported('The file is not a valid XLSX workbook');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const raw = buf.subarray(start, start + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method !== 8) throw unsupported('Unsupported compression in the workbook');
  try { return inflateRawSync(raw, { maxOutputLength: MAX_PART_BYTES }); } catch { throw unsupported('The workbook could not be decompressed (corrupt or too large)'); }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string): string => s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, g: string) => {
  if (g.startsWith('#x')) return String.fromCodePoint(parseInt(g.slice(2), 16));
  if (g.startsWith('#')) return String.fromCodePoint(parseInt(g.slice(1), 10));
  return ENTITIES[g] ?? m;
});

/** concatenated text of every <t> in a string item (phonetic runs excluded) */
const textOf = (xml: string): string => {
  const clean = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  for (const m of clean.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += unescapeXml(m[1] ?? '');
  return out;
};

const columnIndex = (ref: string): number => {
  let n = 0;
  for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + (c - 64); }
  return n - 1;
};

/** numbers keep their face value: 8.90123456789E12 -> 8901234567890, 0.1+0.2 noise is rounded away */
function numberText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return BigInt(n).toString();
  return String(Number(n.toPrecision(12)));
}

export interface SheetData { sheetName: string; records: string[][] }

/** Read the first worksheet. `records[i]` is spreadsheet row i + 1 (missing rows are empty arrays); at most `maxRecords + 1` rows are materialised. */
export function readXlsx(buf: Buffer, maxRecords: number): SheetData {
  const entries = zipEntries(buf);
  const part = (name: string): string | null => {
    const e = entries.get(name);
    return e ? zipRead(buf, e).toString('utf8') : null;
  };
  const workbook = part('xl/workbook.xml');
  if (workbook === null) throw unsupported('The file is not an Excel workbook (xl/workbook.xml is missing)');

  const firstSheet = /<sheet\b[^>]*>/.exec(workbook)?.[0] ?? '';
  const sheetName = unescapeXml(/\bname="([^"]*)"/.exec(firstSheet)?.[1] ?? 'Sheet1');
  const relId = /\br:id="([^"]*)"/.exec(firstSheet)?.[1];
  let target = 'xl/worksheets/sheet1.xml';
  const rels = part('xl/_rels/workbook.xml.rels');
  if (rels && relId) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (new RegExp(`\\bId="${relId}"`).test(m[0])) {
        const t = /\bTarget="([^"]*)"/.exec(m[0])?.[1];
        if (t) target = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
      }
    }
  }
  const sheet = part(target);
  if (sheet === null) throw unsupported('The first worksheet could not be found');

  const sharedXml = part('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedXml) for (const m of sharedXml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) shared.push(textOf(m[1] ?? ''));

  const records: string[][] = [];
  let seq = 0;
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    seq++;
    const rowNo = Number(/\br="(\d+)"/.exec(rm[1] ?? '')?.[1] ?? seq);
    if (rowNo - 1 > maxRecords) { records.length = maxRecords + 1; break; }
    const cells: string[] = [];
    let col = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1] ?? '';
      const ref = /\br="([A-Z]+)\d*"/.exec(attrs)?.[1];
      if (ref) col = columnIndex(ref);
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? 'n';
      const body = cm[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
      else if (type === 'str') value = unescapeXml(v ?? '');
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'e') value = '';
      else if (v !== undefined) value = numberText(v.trim());
      cells[col] = value;
      col++;
    }
    for (let i = 0; i < cells.length; i++) cells[i] ??= '';
    while (records.length < rowNo - 1) records.push([]);
    records[rowNo - 1] = cells;
  }
  return { sheetName, records };
}

// ---------------------------------------------------------------- writer
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zip archive (deflate; stored when it does not shrink) of the given parts */
export function zip(parts: Array<{ name: string; data: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const dosTime = (12 << 11) | (0 << 5); // 12:00:00
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01 (fixed: reproducible output)
  for (const { name, data } of parts) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data);
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, body);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(useDeflate ? 8 : 0, 10);
    cd.writeUInt16LE(dosTime, 12); cd.writeUInt16LE(dosDate, 14); cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nameBuf.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cdBuf, end]);
}

const escapeXml = (s: string): string => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!).replace(/\p{Cc}/gu, (ch) => (ch === '\t' || ch === '\n' || ch === '\r' ? ch : ''));
const columnName = (i: number): string => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

/** A one-sheet workbook of text cells with a bold header row (cells are strings so SKUs and barcodes keep their leading zeros). */
export function buildXlsx(sheetName: string, rows: string[][], columnWidths: number[] = []): Buffer {
  const sheetRows = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => `<c r="${columnName(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(v)}</t></is></c>`).join('')}</row>`).join('');
  const cols = columnWidths.length ? `<cols>${columnWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const xml = (body: string) => Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`, 'utf8');
  return zip([
    { name: '[Content_Types].xml', data: xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
    { name: '_rels/.rels', data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { name: 'xl/styles.xml', data: xml('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>') },
    { name: 'xl/worksheets/sheet1.xml', data: xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${sheetRows}</sheetData></worksheet>`) },
  ]);
}
