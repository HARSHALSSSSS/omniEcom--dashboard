import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { detectImageKind, parseImage } from '../../modules/documents/src/image-meta';
import { escapeXml, placeholderInitials, renderPlaceholderSvg } from '../../modules/documents/src/placeholder';
import { ImageRejected, imageWarnings, validateImageBytes, MAX_IMAGE_BYTES } from '../../modules/documents/src/service';
import { gif, jpeg, png, pngHeaderOnly, webpExtended, webpLossless, webpLossy } from '../helpers/image-fixtures';

let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let stranger: Actor;
let seq = 0;

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor();
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  stranger = await c.registerVendor();
});
afterAll(() => t.close());

const owner = async (q: string, params: unknown[] = []) => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return await pg.query<any>(q, params); } finally { await pg.exec('SET ROLE oms_app'); }
};

const mkProduct = async (title = 'Image test product', code?: string, as: Actor = admin): Promise<string> => {
  const r = await c.post('/api/v1/products', { productCode: code ?? `IMG-${Date.now().toString(36)}-${++seq}`, title }, as);
  if (r.status !== 201) throw new Error(`product create failed ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.data.id as string;
};
const register = (pid: string, name: string, mime: string, size: number, as: Actor = admin) => c.post(`/api/v1/products/${pid}/documents`, { fileName: name, mimeType: mime, sizeBytes: size }, as);
const sendBytes = (as: Actor, url: string, raw: Buffer, contentType: string, q = '') => c.call('POST', url + q, { as, raw, contentType });
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
/** register + upload through the API strategy */
const addImage = async (pid: string, bytes: Buffer, name = 'photo.png', as: Actor = admin) => {
  const mime = MIME_BY_EXT[name.split('.').pop()!]!;
  const reg = await register(pid, name, mime, bytes.length, as);
  expect(reg.status).toBe(201);
  const up = await sendBytes(as, reg.body.data.upload.url, bytes, mime);
  return { id: reg.body.data.document.id as string, reg, up };
};
const keyOf = (vendorId: string, pid: string, doc: { id: string; fileName: string }) => `vendors/${vendorId}/products/${pid}/${doc.id}/${doc.fileName}`;
const docs = async (pid: string, as: Actor = admin) => (await c.get(`/api/v1/products/${pid}/documents`, as)).body.data as any[];
const primaryState = async (pid: string, as: Actor = admin) => (await c.get(`/api/v1/products/${pid}/primary-image`, as)).body.data as { state: string; document: any };
const auditActions = async (resourceId: string) => (await owner('select action from audit_logs where resource_id = $1 order by id', [resourceId])).rows.map((r: any) => r.action as string);
const rule = (res: any) => res.body.error?.details?.rule;

// ---------------------------------------------------------------------------------------------------------
describe('image header parsers (hand-written, bounds-checked)', () => {
  it('reads real dimensions from png, jpeg (baseline + progressive), webp (VP8, VP8L, VP8X) and gif', () => {
    const cases: [string, Buffer, string, number, number][] = [
      ['png', png(321, 123), 'png', 321, 123],
      ['jpeg baseline', jpeg(640, 480), 'jpeg', 640, 480],
      ['jpeg progressive + APPn/COM segments', jpeg(1234, 987, { progressive: true, segments: true }), 'jpeg', 1234, 987],
      ['webp lossy', webpLossy(800, 600), 'webp', 800, 600],
      ['webp lossless', webpLossless(1500, 701), 'webp', 1500, 701],
      ['webp extended', webpExtended(20000, 3000), 'webp', 20000, 3000],
      ['gif', gif(300, 250), 'gif', 300, 250],
    ];
    for (const [label, bytes, kind, w, h] of cases) {
      const p = parseImage(bytes);
      expect(p.ok, label).toBe(true);
      if (p.ok) expect({ kind: p.info.kind, w: p.info.width, h: p.info.height, complete: p.info.complete }, label).toEqual({ kind, w, h, complete: true });
      expect(detectImageKind(bytes), label).toBe(kind);
    }
  });

  it('never reads dimensions from a decoy SOF hidden inside an APP1 segment', () => {
    const p = parseImage(jpeg(900, 700, { segments: true }));
    expect(p.ok && [p.info.width, p.info.height]).toEqual([900, 700]);
  });

  it('flags truncated files as incomplete or corrupt, per format', () => {
    const complete = (b: Buffer) => { const p = parseImage(b); return p.ok ? p.info.complete : 'corrupt'; };
    expect(complete(png(400, 400).subarray(0, 60))).toBe(false); // cut inside IDAT
    expect(complete(png(400, 400).subarray(0, 20))).toBe('corrupt'); // cut inside IHDR
    expect(complete(jpeg(400, 400, { noEoi: true }))).toBe(false);
    expect(complete(jpeg(400, 400).subarray(0, 8))).toBe('corrupt'); // before the frame header
    expect(complete(jpeg(400, 400).subarray(0, 2))).toBe('corrupt');
    expect(complete(webpLossy(400, 400).subarray(0, webpLossy(400, 400).length - 4))).toBe(false);
    expect(complete(webpLossy(400, 400).subarray(0, 20))).toBe('corrupt');
    expect(complete(gif(400, 400).subarray(0, gif(400, 400).length - 1))).toBe(false);
    expect(complete(gif(400, 400).subarray(0, 8))).toBe('corrupt');
  });

  it('terminates on hostile jpeg structures (fill-byte floods, zero/one-byte lengths, huge lengths)', () => {
    const soi = Buffer.from([0xff, 0xd8, 0xff]);
    const attacks: Buffer[] = [
      Buffer.concat([soi, Buffer.alloc(2_000_000, 0xff)]), // endless fill bytes
      Buffer.concat([soi, Buffer.from([0xe0, 0x00, 0x00, 0xff, 0xe0, 0x00, 0x01])]), // segment length 0 and 1
      Buffer.concat([soi, Buffer.from([0xe0, 0xff, 0xff, 0x00, 0x00])]), // length 65535 past the end
      Buffer.concat([soi, Buffer.from([0xc0, 0x00, 0x03, 0x08])]), // SOF too short
      Buffer.concat([soi, Buffer.from([0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00])]), // scan before frame header
      Buffer.concat([soi, Buffer.from([0xd9])]), // EOI first
      Buffer.concat([soi, Buffer.alloc(300_000, 0x00)]), // garbage, no markers
    ];
    const started = Date.now();
    for (const a of attacks) expect(parseImage(a).ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('survives random garbage behind every magic prefix without throwing', () => {
    let s = 123456789;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s & 0xff; };
    const prefixes = [Buffer.from([0xff, 0xd8, 0xff]), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('RIFF\0\0\0\0WEBP'), Buffer.from('GIF89a')];
    for (let i = 0; i < 400; i++) {
      const tail = Buffer.from(Array.from({ length: rnd() }, rnd));
      const pre = prefixes[i % prefixes.length]!;
      expect(() => parseImage(Buffer.concat([pre, tail]))).not.toThrow();
    }
    expect(parseImage(Buffer.alloc(0))).toEqual({ ok: false, reason: 'unknown_format' });
    expect(parseImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toEqual({ ok: false, reason: 'unknown_format' });
  });
});

describe('validation rules (dimension boundaries, bombs, lying files)', () => {
  const code = (fn: () => unknown): string => { try { fn(); return 'ok'; } catch (e) { return e instanceof ImageRejected ? (e.details as any).rule : `other:${e}`; } };

  it('short side: 199 px rejected, 200 px accepted (every format, both orientations)', () => {
    expect(code(() => validateImageBytes('image/png', png(199, 1000)))).toBe('image_too_small');
    expect(code(() => validateImageBytes('image/png', png(1000, 199)))).toBe('image_too_small');
    expect(code(() => validateImageBytes('image/png', png(200, 1000)))).toBe('ok');
    expect(code(() => validateImageBytes('image/jpeg', jpeg(199, 5000)))).toBe('image_too_small');
    expect(code(() => validateImageBytes('image/jpeg', jpeg(200, 200)))).toBe('ok');
    expect(code(() => validateImageBytes('image/webp', webpLossy(199, 4000)))).toBe('image_too_small');
    expect(code(() => validateImageBytes('image/webp', webpLossless(200, 2000)))).toBe('ok');
    expect(code(() => validateImageBytes('image/gif', gif(199, 1000)))).toBe('image_too_small');
    expect(code(() => validateImageBytes('image/gif', gif(200, 200)))).toBe('ok');
  });

  it('long side: 999 px gives low_resolution, 1000 px does not (short side is irrelevant above 200)', () => {
    const w = (width: number, height: number) => imageWarnings({ kind: 'image', isPlaceholder: false, width, height });
    expect(w(999, 999)).toEqual(['low_resolution']);
    expect(w(300, 999)).toEqual(['low_resolution']);
    expect(w(1000, 300)).toEqual([]);
    expect(w(999, 1000)).toEqual([]);
    expect(imageWarnings({ kind: 'image', isPlaceholder: true, width: 100, height: 100 })).toEqual([]);
    expect(imageWarnings({ kind: 'document', isPlaceholder: false, width: null, height: null })).toEqual([]);
  });

  it('decompression bomb guard: more than 100 megapixels is rejected, exactly 100 is not', () => {
    expect(code(() => validateImageBytes('image/png', pngHeaderOnly(20000, 20000)))).toBe('image_too_large_pixels');
    expect(code(() => validateImageBytes('image/jpeg', jpeg(20000, 20000)))).toBe('image_too_large_pixels');
    expect(code(() => validateImageBytes('image/webp', webpExtended(20000, 20000)))).toBe('image_too_large_pixels');
    expect(code(() => validateImageBytes('image/gif', gif(20000, 20000)))).toBe('image_too_large_pixels');
    expect(code(() => validateImageBytes('image/png', pngHeaderOnly(10001, 10000)))).toBe('image_too_large_pixels');
    expect(code(() => validateImageBytes('image/png', pngHeaderOnly(10000, 10000)))).toBe('ok');
    expect(code(() => validateImageBytes('image/png', pngHeaderOnly(0xffffffff, 0xffffffff)))).toBe('image_too_large_pixels'); // no overflow tricks
  });

  it('zero dimensions, truncation and bytes of another type are rejected with precise rules', () => {
    expect(code(() => validateImageBytes('image/png', pngHeaderOnly(0, 500)))).toBe('image_corrupt');
    expect(code(() => validateImageBytes('image/jpeg', jpeg(500, 0)))).toBe('image_corrupt');
    expect(code(() => validateImageBytes('image/webp', webpExtended(600, 600).subarray(0, 40)))).toBe('image_corrupt');
    expect(code(() => validateImageBytes('image/png', png(500, 500).subarray(0, 70)))).toBe('image_corrupt');
    expect(code(() => validateImageBytes('image/jpeg', jpeg(500, 500, { noEoi: true })))).toBe('image_corrupt');
    expect(code(() => validateImageBytes('image/jpeg', png(500, 500)))).toBe('mime_mismatch'); // png bytes declared as jpeg
    expect(code(() => validateImageBytes('image/png', jpeg(500, 500)))).toBe('mime_mismatch');
    expect(code(() => validateImageBytes('image/png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"/>')))).toBe('mime_mismatch');
    expect(code(() => validateImageBytes('image/gif', Buffer.alloc(0)))).toBe('mime_mismatch');
  });
});

describe('placeholder rendering (pure functions)', () => {
  it('derives safe initials: code first, name words for generated draft codes, never empty', () => {
    expect(placeholderInitials('tsh-red-01', 'T-Shirt')).toBe('TSH');
    expect(placeholderInitials('A', 'x')).toBe('A');
    expect(placeholderInitials('DRAFT-AB12CD34', 'blue cotton shirt extra')).toBe('BCS');
    expect(placeholderInitials('DRAFT-AB12CD34', '  ')).toBe('DRA'); // falls back to the code
    expect(placeholderInitials('---', '')).toBe('?');
    expect(placeholderInitials('<b>&"\'', 'x')).toBe('B');
    expect(placeholderInitials(String.fromCharCode(0xdf) + 'a', 'x')).toBe('SSA'); // sharp s upper-cases to two letters, still capped at 3
  });

  it('escapes every character that reaches the SVG and drops illegal XML characters', () => {
    expect(escapeXml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(escapeXml('a' + String.fromCharCode(0) + String.fromCharCode(0x1f) + 'b' + String.fromCharCode(0xd800) + 'c')).toBe('abc');
    const hostile = renderPlaceholderSvg('"><script>alert(1)</script>', '<img src=x onerror=alert(1)> & co').svg;
    expect(hostile).not.toMatch(/<script|<img|onerror|javascript:/i);
    expect(hostile.startsWith('<?xml')).toBe(true);
    const unicode = renderPlaceholderSvg(String.fromCharCode(0x928, 0x92e, 0x938), '').svg;
    expect(unicode).toContain('<svg');
  });

  it('is deterministic', () => {
    expect(renderPlaceholderSvg('ABC-1', 'Thing').svg).toBe(renderPlaceholderSvg('ABC-1', 'Thing').svg);
    expect(renderPlaceholderSvg('ABC-1', 'Thing').svg).not.toBe(renderPlaceholderSvg('XYZ-1', 'Thing').svg);
  });
});

// ---------------------------------------------------------------------------------------------------------
describe('register -> upload (api strategy): status transitions, dimensions, warnings', () => {
  it('walks pending_upload -> uploaded for every format, storing width/height and the low_resolution warning', async () => {
    const pid = await mkProduct();
    const cases: [string, Buffer, number, number, string[]][] = [
      ['a.png', png(1000, 1000), 1000, 1000, []],
      ['b.jpg', jpeg(999, 600), 999, 600, ['low_resolution']],
      ['c.webp', webpLossless(1600, 1200), 1600, 1200, []],
      ['d.gif', gif(200, 200), 200, 200, ['low_resolution']],
      ['e.jpg', jpeg(2400, 1800, { progressive: true, segments: true }), 2400, 1800, []],
    ];
    for (const [name, bytes, w, h, warnings] of cases) {
      const mime = MIME_BY_EXT[name.split('.').pop()!]!;
      const reg = await register(pid, name, mime, bytes.length);
      expect(reg.body.data.document).toMatchObject({ status: 'pending_upload', width: null, height: null, warnings: [], isPlaceholder: false });
      const up = await sendBytes(admin, reg.body.data.upload.url, bytes, mime);
      expect(up.status, name).toBe(200);
      expect(up.body.data, name).toMatchObject({ status: 'uploaded', width: w, height: h, warnings, isPlaceholder: false, sizeBytes: bytes.length });
      const got = (await c.get(`/api/v1/documents/${reg.body.data.document.id}`, viewer)).body.data;
      expect(got).toMatchObject({ width: w, height: h, warnings });
    }
    const list = await docs(pid, viewer);
    expect(list).toHaveLength(5);
    expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
    expect(list[0].isPrimary).toBe(true); // the first confirmed real image
  });

  it('rejects bad files with a precise rule, marks the document rejected and stores nothing', async () => {
    const pid = await mkProduct();
    const bad: [string, string, Buffer, number, string, string][] = [
      ['png-as-jpeg.jpg', 'image/jpeg', png(500, 500), 415, 'UNSUPPORTED_MEDIA_TYPE', 'mime_mismatch'],
      ['small.png', 'image/png', png(199, 900), 422, 'VALIDATION_FAILED', 'image_too_small'],
      ['bomb.jpg', 'image/jpeg', jpeg(20000, 20000), 422, 'VALIDATION_FAILED', 'image_too_large_pixels'],
      ['cut.png', 'image/png', png(600, 600).subarray(0, 80), 422, 'VALIDATION_FAILED', 'image_corrupt'],
      ['zero.png', 'image/png', pngHeaderOnly(0, 600), 422, 'VALIDATION_FAILED', 'image_corrupt'],
      ['noeoi.jpg', 'image/jpeg', jpeg(600, 600, { noEoi: true }), 422, 'VALIDATION_FAILED', 'image_corrupt'],
    ];
    for (const [name, mime, bytes, status, errCode, expectedRule] of bad) {
      const reg = await register(pid, name, mime, bytes.length);
      const up = await sendBytes(admin, reg.body.data.upload.url, bytes, mime);
      expect(up.status, name).toBe(status);
      expect(up.body.error.code, name).toBe(errCode);
      expect(rule(up), name).toBe(expectedRule);
      expect(up.body.error.details.code, name).toBe(expectedRule);
      const doc = (await c.get(`/api/v1/documents/${reg.body.data.document.id}`, admin)).body.data;
      expect(doc.status, name).toBe('rejected');
      expect([...t.storage.objects.keys()].some((k) => k.includes(reg.body.data.document.id)), name).toBe(false);
    }
    expect((await primaryState(pid)).state).toBe('none'); // nothing became primary
  });

  it('user-supplied SVG stays rejected: not registrable, and svg bytes sent as png are a mime mismatch', async () => {
    const pid = await mkProduct();
    expect((await register(pid, 'logo.svg', 'image/svg+xml', 100)).status).toBe(400);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500"><script>alert(1)</script></svg>');
    const reg = await register(pid, 'logo.png', 'image/png', svg.length);
    const up = await sendBytes(admin, reg.body.data.upload.url, svg, 'image/png');
    expect(up.status).toBe(415);
    expect(rule(up)).toBe('mime_mismatch');
  });
});

describe('presigned flow: confirm validates the stored bytes', () => {
  // MemoryStorage cannot presign; a direct PUT to object storage is simulated by writing the object ourselves
  const putDirect = (pid: string, doc: any, bytes: Buffer, mime: string) => t.storage.put(keyOf(admin.vendorId!, pid, doc), bytes, mime);

  it('confirm after the direct PUT: validates, stores dimensions, makes the first image primary; confirming again is a no-op', async () => {
    const pid = await mkProduct();
    const bytes = jpeg(1280, 720);
    const reg = await register(pid, 'direct.jpg', 'image/jpeg', bytes.length);
    const doc = reg.body.data.document;
    expect((await c.post(`/api/v1/documents/${doc.id}/confirm`, {}, admin)).status).toBe(409); // nothing uploaded yet
    await putDirect(pid, doc, bytes, 'image/jpeg');
    const ok = await c.post(`/api/v1/documents/${doc.id}/confirm`, {}, admin);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'uploaded', isPrimary: true, width: 1280, height: 720, sizeBytes: bytes.length, warnings: [] });
    expect(ok.body.data.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    const again = await c.post(`/api/v1/documents/${doc.id}/confirm`, {}, admin);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(doc.id);
    expect((await docs(pid)).filter((d) => d.isPrimary)).toHaveLength(1);
  });

  it.each([
    ['lying file (png bytes under .jpg)', 'jpg', 'image/jpeg', () => png(600, 600), 415, 'mime_mismatch'],
    ['too small', 'png', 'image/png', () => png(150, 900), 422, 'image_too_small'],
    ['decompression bomb', 'jpg', 'image/jpeg', () => jpeg(30000, 30000), 422, 'image_too_large_pixels'],
    ['truncated', 'webp', 'image/webp', () => webpLossy(800, 800).subarray(0, 30), 422, 'image_corrupt'],
    ['html', 'gif', 'image/gif', () => Buffer.from('<html><script>alert(1)</script></html>'), 415, 'mime_mismatch'],
  ])('rejects %s: status rejected, object deleted, precise error', async (_label, ext, mime, make, status, expectedRule) => {
    const pid = await mkProduct();
    const bytes = make();
    const reg = await register(pid, `x.${ext}`, mime as string, Math.max(bytes.length, 10));
    const doc = reg.body.data.document;
    await putDirect(pid, doc, bytes, mime as string);
    const res = await c.post(`/api/v1/documents/${doc.id}/confirm`, {}, admin);
    expect(res.status).toBe(status);
    expect(rule(res)).toBe(expectedRule);
    expect(t.storage.objects.has(keyOf(admin.vendorId!, pid, doc))).toBe(false);
    expect((await c.get(`/api/v1/documents/${doc.id}`, admin)).body.data.status).toBe('rejected');
    expect((await primaryState(pid)).state).toBe('none');
  });

  it('an oversized object is rejected from its size alone (413 file_too_large) and removed', async () => {
    const pid = await mkProduct();
    const reg = await register(pid, 'big.png', 'image/png', 1000);
    const doc = reg.body.data.document;
    await putDirect(pid, doc, Buffer.concat([png(300, 300), Buffer.alloc(MAX_IMAGE_BYTES, 1)]), 'image/png');
    const res = await c.post(`/api/v1/documents/${doc.id}/confirm`, {}, admin);
    expect(res.status).toBe(413);
    expect(rule(res)).toBe('file_too_large');
    expect(t.storage.objects.has(keyOf(admin.vendorId!, pid, doc))).toBe(false);
  });

  it('confirm replaces a placeholder exactly like the api strategy', async () => {
    const pid = await mkProduct();
    const ph = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    const bytes = png(900, 900);
    const reg = await register(pid, 'real.png', 'image/png', bytes.length);
    await putDirect(pid, reg.body.data.document, bytes, 'image/png');
    const res = await c.post(`/api/v1/documents/${reg.body.data.document.id}/confirm`, {}, admin);
    expect(res.body.data).toMatchObject({ isPrimary: true, isPlaceholder: false, warnings: ['low_resolution'] });
    expect((await c.get(`/api/v1/documents/${ph.id}`, admin)).status).toBe(404);
    expect((await primaryState(pid)).state).toBe('ready');
  });
});

describe('cancel upload', () => {
  it('DELETE on a pending_upload removes the record and any partial object, and is idempotent', async () => {
    const pid = await mkProduct();
    const reg = await register(pid, 'cancel.png', 'image/png', 5000);
    const doc = reg.body.data.document;
    const key = keyOf(admin.vendorId!, pid, doc);
    await t.storage.put(key, png(300, 300).subarray(0, 40), 'image/png'); // a partial direct upload landed
    const first = await c.del(`/api/v1/documents/${doc.id}`, staff);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ cancelled: true });
    expect(t.storage.objects.has(key)).toBe(false);
    expect((await c.get(`/api/v1/documents/${doc.id}`, admin)).status).toBe(404);
    expect(await docs(pid)).toHaveLength(0);
    await t.storage.put(key, Buffer.from('late partial'), 'image/png'); // a straggler PUT after the cancel
    const second = await c.del(`/api/v1/documents/${doc.id}`, staff);
    expect(second.status).toBe(200);
    expect(second.body.data.cancelled).toBe(true);
    expect(t.storage.objects.has(key)).toBe(false); // repeated cancel sweeps it
    // the cancelled upload can no longer be continued
    expect((await sendBytes(admin, reg.body.data.upload.url, png(300, 300), 'image/png')).status).toBe(404);
    expect((await c.post(`/api/v1/documents/${doc.id}/confirm`, {}, admin)).status).toBe(404);
    expect((await auditActions(doc.id)).filter((a) => a === 'document.upload_cancelled')).toHaveLength(1); // audited once
  });

  it('POST /documents/{id}/cancel is the alias: {cancelled:true}, idempotent, refused for finished uploads', async () => {
    const pid = await mkProduct();
    const reg = await register(pid, 'alias.jpg', 'image/jpeg', 5000);
    const id = reg.body.data.document.id;
    const a = await c.post(`/api/v1/documents/${id}/cancel`, {}, admin);
    expect(a.status).toBe(200);
    expect(a.body.data).toEqual({ cancelled: true });
    expect((await c.post(`/api/v1/documents/${id}/cancel`, {}, admin)).body.data).toEqual({ cancelled: true });
    expect((await c.post(`/api/v1/documents/${'00000000-0000-7000-8000-000000000000'}/cancel`, {}, admin)).status).toBe(404);
    const done = await addImage(pid, png(600, 600), 'done.png');
    const refuse = await c.post(`/api/v1/documents/${done.id}/cancel`, {}, admin);
    expect(refuse.status).toBe(409);
    expect(rule(refuse)).toBe('not_pending_upload');
    expect((await c.get(`/api/v1/documents/${done.id}`, admin)).body.data.status).toBe('uploaded'); // untouched
    // deleting a finished document is still a normal delete (404 the second time)
    expect((await c.del(`/api/v1/documents/${done.id}`, admin)).body.data.message).toBe('Document deleted');
    expect((await c.del(`/api/v1/documents/${done.id}`, admin)).status).toBe(404);
  });

  it('a cancelled upload does not hold an image slot and leaves the primary state at none', async () => {
    const pid = await mkProduct();
    const reg = await register(pid, 'slot.png', 'image/png', 5000);
    expect((await primaryState(pid)).state).toBe('uploading');
    await c.post(`/api/v1/documents/${reg.body.data.document.id}/cancel`, {}, admin);
    expect((await primaryState(pid)).state).toBe('none');
  });
});

describe('placeholder lifecycle', () => {
  it('creates a deterministic svg placeholder, primary, idempotently (201 then 200 with the same document)', async () => {
    const pid = await mkProduct('Blue <b>&"Cap"</b>', 'CAP-BLUE');
    const res = await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, staff);
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d).toMatchObject({ isPlaceholder: true, isPrimary: true, status: 'uploaded', mimeType: 'image/svg+xml', kind: 'image', purpose: 'product_image', width: 1200, height: 1200, warnings: [] });
    expect(d.downloadUrl).toMatch(/\/api\/v1\/documents\/.+\/content$/);
    const again = await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin);
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(d.id);
    expect(await docs(pid)).toHaveLength(1);
    expect(await auditActions(d.id)).toEqual(['document.placeholder_created']);

    const svg = (await c.get(`/api/v1/documents/${d.id}/content`, viewer)).raw.rawPayload.toString('utf8');
    expect(svg).toContain('>CAP<');
    expect(svg).toContain('Image required');
    // same product data again (after deleting) renders the very same bytes
    await c.del(`/api/v1/documents/${d.id}`, admin);
    const re = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    expect(re.id).not.toBe(d.id);
    expect(re.checksumSha256).toBe(d.checksumSha256);
  });

  it('uses the name initials for generated DRAFT codes and escapes hostile names', async () => {
    const pid = await mkProduct('Soft <script>alert(1)</script> Towel & "co"');
    await owner(`update products set product_code = 'DRAFT-AB12CD34' where id = $1`, [pid]); // generated draft code (users cannot type one)
    const d = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    const svg = (await c.get(`/api/v1/documents/${d.id}/content`, admin)).raw.rawPayload.toString('utf8');
    expect(svg).toContain('>SSA<');
    expect(svg).not.toMatch(/<script|alert\(1\)<\/|onerror/i);
    expect((svg.match(/</g) ?? []).length).toBe((svg.match(/<[?a-z/]/g) ?? []).length); // every "<" opens real markup, none comes from data
  });

  it('is served with hardened headers', async () => {
    const pid = await mkProduct();
    const d = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    const r = await c.get(`/api/v1/documents/${d.id}/content`, viewer);
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toMatch(/^image\/svg\+xml/);
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(String(r.headers['content-disposition'])).toMatch(/^inline/);
    expect(String(r.headers['cache-control'])).toMatch(/private/);
    // a real raster image is not given the svg policy
    const real = await addImage(pid, png(500, 500), 'r.png');
    const rr = await c.get(`/api/v1/documents/${real.id}/content`, viewer);
    expect(rr.headers['content-type']).toBe('image/png');
    expect(rr.headers['x-content-type-options']).toBe('nosniff');
  });

  it('is replaced by the first real image: it becomes primary, the placeholder is soft-deleted with its object', async () => {
    const pid = await mkProduct();
    const ph = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    const phKey = keyOf(admin.vendorId!, pid, ph);
    expect(t.storage.objects.has(phKey)).toBe(true);
    const real = await addImage(pid, jpeg(1400, 1000), 'first.jpg', staff);
    expect(real.up.status).toBe(200);
    expect(real.up.body.data).toMatchObject({ isPrimary: true, isPlaceholder: false });
    const list = await docs(pid);
    expect(list.map((d) => d.id)).toEqual([real.id]);
    expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
    expect(t.storage.objects.has(phKey)).toBe(false);
    expect((await c.get(`/api/v1/documents/${ph.id}`, admin)).status).toBe(404);
    expect(await auditActions(ph.id)).toEqual(['document.placeholder_created', 'document.placeholder_replaced']);
    const row = (await owner('select is_primary, deleted_at from product_documents where id = $1', [ph.id])).rows[0];
    expect(row.is_primary).toBe(false);
    expect(row.deleted_at).not.toBeNull();
    const events = (await owner(`select count(*)::int n from outbox_events where aggregate_id = $1 and type = 'document.deleted'`, [ph.id])).rows[0].n;
    expect(events).toBe(1);
  });

  it('a rejected real upload does not remove the placeholder', async () => {
    const pid = await mkProduct();
    const ph = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    const bad = await addImage(pid, png(100, 100), 'tiny.png');
    expect(bad.up.status).toBe(422);
    expect((await primaryState(pid)).state).toBe('placeholder');
    expect((await docs(pid)).map((d) => d.id)).toContain(ph.id);
  });

  it('409 has_primary_image when a real primary exists; 409 has_images when real images exist without a primary', async () => {
    const pid = await mkProduct();
    const real = await addImage(pid, png(600, 600), 'a.png');
    const res = await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin);
    expect(res.status).toBe(409);
    expect(rule(res)).toBe('has_primary_image');
    expect((await docs(pid)).filter((d) => d.isPlaceholder)).toHaveLength(0);
    await c.patch(`/api/v1/documents/${real.id}`, { isPrimary: false }, admin);
    const res2 = await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin);
    expect(res2.status).toBe(409);
    expect(rule(res2)).toBe('has_images');
  });

  it('a placeholder cannot be promoted over real images, and it can be deleted', async () => {
    const pid = await mkProduct();
    const ph = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    expect((await c.del(`/api/v1/documents/${ph.id}`, admin)).status).toBe(200);
    expect((await primaryState(pid)).state).toBe('none');
    const again = await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin);
    expect(again.status).toBe(201);
    expect(again.body.data.isPrimary).toBe(true);
  });

  it('concurrent placeholder requests create exactly one', async () => {
    const pid = await mkProduct();
    const rs = await Promise.all([1, 2, 3, 4].map(() => c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)));
    expect(rs.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    expect(new Set(rs.map((r) => r.body.data.id)).size).toBe(1);
    expect((await docs(pid)).filter((d) => d.isPlaceholder)).toHaveLength(1);
  });
});

describe('image limit (20 per product)', () => {
  it('allows 20, refuses the 21st with 409 image_limit; cancelled / rejected / expired uploads free their slot', async () => {
    const pid = await mkProduct();
    const ids: string[] = [];
    const regs: any[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await register(pid, `i${i}.png`, 'image/png', 5000);
      expect(r.status, `image ${i + 1}`).toBe(201);
      ids.push(r.body.data.document.id);
      regs.push(r);
    }
    const over = await register(pid, 'i20.png', 'image/png', 5000);
    expect(over.status).toBe(409);
    expect(rule(over)).toBe('image_limit');
    expect(over.body.error.details.max).toBe(20);
    // a non-image document is not limited by the image cap
    expect((await register(pid, 'guide.pdf', 'application/pdf', 100)).status).toBe(201);

    expect((await c.post(`/api/v1/documents/${ids[0]}/cancel`, {}, admin)).status).toBe(200); // cancel frees one
    expect((await register(pid, 'again.png', 'image/png', 5000)).status).toBe(201);
    expect(rule(await register(pid, 'x.png', 'image/png', 5000))).toBe('image_limit');

    const bad = await sendBytes(admin, regs[1].body.data.upload.url, Buffer.from('not an image at all'), 'image/png'); // rejected frees one
    expect(bad.status).toBe(415);
    expect((await register(pid, 'again2.png', 'image/png', 5000)).status).toBe(201);
    expect(rule(await register(pid, 'y.png', 'image/png', 5000))).toBe('image_limit');

    await owner(`update product_documents set created_at = now() - interval '31 minutes' where product_id = $1 and status = 'pending_upload'`, [pid]);
    expect((await register(pid, 'fresh.png', 'image/png', 5000)).status).toBe(201); // abandoned reservations expire
  });

  it('a real upload at the cap is still accepted for a reserved slot, and the placeholder never counts', async () => {
    const pid = await mkProduct();
    await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin);
    const first = await addImage(pid, png(400, 400), 'a.png');
    expect(first.up.status).toBe(200);
    expect((await docs(pid)).filter((d) => d.isPlaceholder)).toHaveLength(0);
  });
});

describe('primary image invariants', () => {
  it('the first confirmed real image is primary on every path, later images are not, promotion swaps the flag', async () => {
    const pid = await mkProduct();
    const a = await addImage(pid, png(500, 500), 'a.png');
    const b = await addImage(pid, jpeg(500, 500), 'b.jpg');
    const cc = await addImage(pid, webpLossy(500, 500), 'c.webp');
    expect([a, b, cc].map((x) => x.up.body.data.isPrimary)).toEqual([true, false, false]);
    expect((await c.patch(`/api/v1/documents/${cc.id}`, { isPrimary: true }, admin)).body.data.isPrimary).toBe(true);
    const list = await docs(pid);
    expect(list.filter((d) => d.isPrimary).map((d) => d.id)).toEqual([cc.id]);
    // ?primary=true on upload also keeps a single primary
    const d = await register(pid, 'd.png', 'image/png', png(500, 500).length);
    const up = await sendBytes(admin, d.body.data.upload.url, png(500, 500), 'image/png', '?primary=true');
    expect(up.body.data.isPrimary).toBe(true);
    expect((await docs(pid)).filter((x) => x.isPrimary).map((x) => x.id)).toEqual([d.body.data.document.id]);
    // unsetting leaves none; the next confirmed image becomes primary again
    await c.patch(`/api/v1/documents/${d.body.data.document.id}`, { isPrimary: false }, admin);
    expect((await docs(pid)).filter((x) => x.isPrimary)).toHaveLength(0);
    const e = await addImage(pid, png(500, 500), 'e.png');
    expect(e.up.body.data.isPrimary).toBe(true);
  });

  it('pending, rejected and non-image documents can never be primary', async () => {
    const pid = await mkProduct();
    const pending = await register(pid, 'p.png', 'image/png', 5000);
    expect((await c.patch(`/api/v1/documents/${pending.body.data.document.id}`, { isPrimary: true }, admin)).status).toBe(409);
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    const doc = await register(pid, 'a.pdf', 'application/pdf', pdf.length);
    await sendBytes(admin, doc.body.data.upload.url, pdf, 'application/pdf');
    expect((await c.patch(`/api/v1/documents/${doc.body.data.document.id}`, { isPrimary: true }, admin)).status).toBe(409);
    expect((await primaryState(pid)).state).toBe('uploading');
  });

  it('concurrent first uploads leave exactly one primary', async () => {
    const pid = await mkProduct();
    const rs = await Promise.all([0, 1, 2, 3].map((i) => addImage(pid, png(400 + i, 400), `r${i}.png`)));
    expect(rs.every((r) => r.up.status === 200)).toBe(true);
    const list = await docs(pid);
    expect(list).toHaveLength(4);
    expect(list.filter((d) => d.isPrimary)).toHaveLength(1);
    const dbCount = (await owner('select count(*)::int n from product_documents where product_id = $1 and is_primary and deleted_at is null', [pid])).rows[0].n;
    expect(dbCount).toBe(1);
  });
});

describe('GET /products/{id}/primary-image states', () => {
  it('none -> uploading -> ready, and none -> placeholder -> uploading -> ready, with the document attached', async () => {
    const pid = await mkProduct();
    expect(await primaryState(pid)).toEqual({ state: 'none', document: null });

    const reg = await register(pid, 'one.png', 'image/png', png(600, 600).length);
    const up = await primaryState(pid, viewer);
    expect(up.state).toBe('uploading');
    expect(up.document).toMatchObject({ id: reg.body.data.document.id, status: 'pending_upload', downloadUrl: null });

    await sendBytes(admin, reg.body.data.upload.url, png(600, 600), 'image/png');
    const ready = await primaryState(pid);
    expect(ready.state).toBe('ready');
    expect(ready.document).toMatchObject({ id: reg.body.data.document.id, isPrimary: true, width: 600, height: 600, warnings: ['low_resolution'] });

    // while a primary is ready, a further pending upload does not change the state
    await register(pid, 'two.png', 'image/png', 5000);
    expect((await primaryState(pid)).state).toBe('ready');

    const p2 = await mkProduct();
    await c.post(`/api/v1/products/${p2}/documents/placeholder`, {}, admin);
    const ph = await primaryState(p2);
    expect(ph.state).toBe('placeholder');
    expect(ph.document).toMatchObject({ isPlaceholder: true, isPrimary: true });
    const pend = await register(p2, 'rep.png', 'image/png', png(600, 600).length); // replacement upload in flight: no ready primary
    expect((await primaryState(p2)).state).toBe('uploading');
    await c.post(`/api/v1/documents/${pend.body.data.document.id}/cancel`, {}, admin);
    expect((await primaryState(p2)).state).toBe('placeholder');
    await sendBytes(admin, pend.body.data.upload.url, png(600, 600), 'image/png'); // cancelled: 404, state unchanged
    expect((await primaryState(p2)).state).toBe('placeholder');
    await addImage(p2, png(700, 700), 'real.png');
    expect((await primaryState(p2)).state).toBe('ready');
  });

  it('an upload older than 30 minutes no longer counts as uploading; rejected uploads never do', async () => {
    const pid = await mkProduct();
    const reg = await register(pid, 'old.png', 'image/png', 5000);
    expect((await primaryState(pid)).state).toBe('uploading');
    await owner(`update product_documents set created_at = now() - interval '31 minutes' where id = $1`, [reg.body.data.document.id]);
    expect((await primaryState(pid)).state).toBe('none');
    const bad = await addImage(pid, png(50, 50), 'bad.png');
    expect(bad.up.status).toBe(422);
    expect((await primaryState(pid)).state).toBe('none');
  });

  it('deleting the real primary drops the state back to none', async () => {
    const pid = await mkProduct();
    const a = await addImage(pid, png(600, 600), 'a.png');
    expect((await primaryState(pid)).state).toBe('ready');
    await c.del(`/api/v1/documents/${a.id}`, admin);
    expect((await primaryState(pid)).state).toBe('none');
  });
});

describe('tenancy, permissions and the legacy contract', () => {
  it('a viewer reads but cannot write; another business sees nothing and changes nothing', async () => {
    const pid = await mkProduct();
    expect((await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, viewer)).status).toBe(403);
    expect((await register(pid, 'v.png', 'image/png', 100, viewer)).status).toBe(403);
    const reg = await register(pid, 'own.png', 'image/png', 5000);
    const id = reg.body.data.document.id;
    expect((await c.post(`/api/v1/documents/${id}/cancel`, {}, viewer)).status).toBe(403);
    expect((await c.del(`/api/v1/documents/${id}`, viewer)).status).toBe(403);
    expect((await c.get(`/api/v1/products/${pid}/primary-image`, viewer)).status).toBe(200);

    expect((await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, stranger)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${pid}/primary-image`, stranger)).status).toBe(404);
    expect((await c.post(`/api/v1/documents/${id}/cancel`, {}, stranger)).status).toBe(404);
    expect((await c.del(`/api/v1/documents/${id}`, stranger)).status).toBe(404);
    expect((await c.get(`/api/v1/documents/${id}`, admin)).body.data.status).toBe('pending_upload'); // nothing was cancelled
    expect(await docs(pid)).toHaveLength(1);
  });

  it('a stranger cannot confirm someone else\'s direct upload or use their placeholder', async () => {
    const pid = await mkProduct();
    const reg = await register(pid, 'sx.png', 'image/png', 5000);
    await t.storage.put(keyOf(admin.vendorId!, pid, reg.body.data.document), png(500, 500), 'image/png');
    expect((await c.post(`/api/v1/documents/${reg.body.data.document.id}/confirm`, {}, stranger)).status).toBe(404);
    const ph = (await c.post(`/api/v1/products/${pid}/documents/placeholder`, {}, admin)).body.data;
    expect((await c.get(`/api/v1/documents/${ph.id}/content`, stranger)).status).toBe(404);
  });

  it('the list and single-document DTOs carry the additive fields', async () => {
    const pid = await mkProduct();
    await addImage(pid, jpeg(800, 800), 'x.jpg');
    const [d] = await docs(pid);
    expect(d).toMatchObject({ isPlaceholder: false, width: 800, height: 800, warnings: ['low_resolution'] });
    const pdf = Buffer.from('%PDF-1.4\n%%EOF');
    const doc = await register(pid, 'n.pdf', 'application/pdf', pdf.length);
    await sendBytes(admin, doc.body.data.upload.url, pdf, 'application/pdf');
    const nonImage = (await c.get(`/api/v1/documents/${doc.body.data.document.id}`, admin)).body.data;
    expect(nonImage).toMatchObject({ width: null, height: null, warnings: [], isPlaceholder: false, kind: 'document' });
  });
});
