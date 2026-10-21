import { bpsFraction, formatMinor } from './money';
import { parseDay } from './tz';
import type { Cell, Column, ReportDocument, Sheet } from './tabular';
import { writeZip, type ZipEntry } from './zip';

/**
 * XLSX writer (SpreadsheetML written by hand, zipped with node:zlib). One worksheet per Sheet: bold header row, frozen and
 * filterable, rupee amounts stored as numbers with a 2-decimal format, dates as real dates, percentages as percent cells,
 * text as inline strings (never evaluated as formulas). Numbers are produced from integer arithmetic, not floats.
 */
const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const MAX_CELL_CHARS = 32_000;

/** strips characters XML 1.0 cannot carry and escapes the markup characters */
export function xmlText(s: string): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp === 9 || cp === 10 || cp === 13 || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)) out += ch;
  }
  return out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function columnRef(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Excel serial number of a calendar day (days since 1899-12-30) */
export function excelSerial(day: string): number | null {
  const p = parseDay(day.slice(0, 10));
  if (!p) return null;
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export function sheetName(raw: string, used: Set<string>): string {
  const base = (raw.replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim() || 'Sheet').slice(0, 31);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

// style ids (see STYLES_XML)
const S = { header: 1, text: 2, int: 3, money: 4, date: 5, percent: 6, totalText: 7, totalInt: 8, totalMoney: 9, totalPercent: 10, note: 11 } as const;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${NS}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mmm\\-yyyy"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF666666"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="49" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="4" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="10" fontId="2" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="49" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const textCell = (ref: string, style: number, v: string) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlText(v.slice(0, MAX_CELL_CHARS))}</t></is></c>`;

function cellXml(ref: string, col: Column, v: Cell, total: boolean): string {
  if (v === null || v === undefined || v === '') return total ? `<c r="${ref}" s="${S.totalText}"/>` : '';
  switch (col.type) {
    case 'money': return `<c r="${ref}" s="${total ? S.totalMoney : S.money}"><v>${formatMinor(Number(v))}</v></c>`;
    case 'int': return `<c r="${ref}" s="${total ? S.totalInt : S.int}"><v>${Math.trunc(Number(v))}</v></c>`;
    case 'percent': return `<c r="${ref}" s="${total ? S.totalPercent : S.percent}"><v>${bpsFraction(Number(v))}</v></c>`;
    case 'date': {
      const serial = typeof v === 'string' ? excelSerial(v) : null;
      return serial === null ? textCell(ref, total ? S.totalText : S.text, String(v)) : `<c r="${ref}" s="${S.date}"><v>${serial}</v></c>`;
    }
    default: return textCell(ref, total ? S.totalText : S.text, String(v));
  }
}

function widthOf(col: Column, sheet: Sheet, i: number): number {
  if (col.width) return col.width;
  let w = col.header.length + 2;
  for (const r of sheet.rows.slice(0, 200)) w = Math.max(w, String(r[i] ?? '').length + 2);
  return Math.min(60, Math.max(8, col.type === 'money' ? Math.max(w, 14) : w));
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns;
  const rows: string[] = [];
  rows.push(`<row r="1" ht="22" customHeight="1">${cols.map((c, i) => textCell(`${columnRef(i)}1`, S.header, c.header)).join('')}</row>`);
  let r = 2;
  for (const row of sheet.rows) {
    rows.push(`<row r="${r}">${cols.map((c, i) => cellXml(`${columnRef(i)}${r}`, c, row[i] ?? null, false)).join('')}</row>`);
    r++;
  }
  if (sheet.totals) { rows.push(`<row r="${r}">${cols.map((c, i) => cellXml(`${columnRef(i)}${r}`, c, sheet.totals![i] ?? null, true)).join('')}</row>`); r++; }
  const last = r - 1;
  if (sheet.notes?.length) {
    r++;
    for (const n of sheet.notes) { rows.push(`<row r="${r}">${textCell(`A${r}`, S.note, n)}</row>`); r++; }
  }
  const colXml = cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${widthOf(c, sheet, i)}" customWidth="1"/>`).join('');
  const dataLast = sheet.totals ? last - 1 : last;
  const filter = cols.length > 0 && dataLast >= 1 ? `<autoFilter ref="A1:${columnRef(cols.length - 1)}${Math.max(1, dataLast)}"/>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}"><dimension ref="A1:${columnRef(Math.max(0, cols.length - 1))}${r - 1}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${colXml}</cols><sheetData>${rows.join('')}</sheetData>${filter}</worksheet>`;
}

export function buildXlsx(doc: ReportDocument): Buffer {
  const used = new Set<string>();
  const names = doc.sheets.map((s) => sheetName(s.name, used));
  const entries: ZipEntry[] = [];
  const add = (name: string, xml: string) => entries.push({ name, data: Buffer.from(xml, 'utf8') });
  const n = doc.sheets.length;
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${doc.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  const filters = doc.sheets.map((s, i) => {
    const dataLast = s.rows.length + 1;
    return s.columns.length > 0 && s.rows.length > 0 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i]!.replace(/'/g, "''")}'!$A$1:$${columnRef(s.columns.length - 1)}$${dataLast}</definedName>` : '';
  }).join('');
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="${Math.min(doc.primarySheet, n - 1)}"/></bookViews><sheets>${names.map((nm, i) => `<sheet name="${xmlText(nm)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ''}</workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${doc.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', STYLES_XML);
  doc.sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  add('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlText(doc.title)}</dc:title><dc:creator>${xmlText(doc.businessName)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${doc.generatedAt.toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
  add('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>OMS Reports</Application></Properties>`);
  return writeZip(entries, doc.generatedAt);
}
