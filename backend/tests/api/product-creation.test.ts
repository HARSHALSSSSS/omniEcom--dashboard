import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, type Actor, type TestApp } from '@oms/testing';
import { DESCRIPTION_MAX_CHARS, safeHref, sanitizeDescription, toPlainText, truncatePlainText } from '../../modules/catalog/src/description';
import { fromGrams, fromMillimetres, normalizeDimensions, normalizeWeight, toGrams, toMillimetres } from '../../modules/catalog/src/physical';
import { evaluateCreationReadiness, resolveImageState, type ReadinessInput } from '../../modules/catalog/src/creation-readiness';
import { checkCode, collapseSpaces, nameKey, normalizeCustomAttributes, normalizeFields } from '../../modules/catalog/src/fields';
import { COUNTRIES, isCountryCode } from '../../modules/catalog/src/countries';

const cc = (...cps: number[]) => String.fromCodePoint(...cps);

// ==================================================================================================
// pure units: physical data
// ==================================================================================================
describe('physical units (pure)', () => {
  it('converts lengths exactly and rounds half up', () => {
    const mm = (v: number, u: string) => { const r = toMillimetres(v, u); return r.ok ? r.value : r.code; };
    expect(mm(1, 'mm')).toBe(1);
    expect(mm(25.4, 'mm')).toBe(25);
    expect(mm(2.5, 'mm')).toBe(3); // half up
    expect(mm(1.5, 'mm')).toBe(2);
    expect(mm(0.5, 'mm')).toBe(1);
    expect(mm(25.5, 'cm')).toBe(255);
    expect(mm(0.05, 'cm')).toBe(1); // 0.5 mm -> 1
    expect(mm(0.15, 'cm')).toBe(2); // 1.5 mm -> 2 (binary floating point would risk 1)
    expect(mm(1.005, 'cm')).toBe(10); // 10.05 mm
    expect(mm(0.04, 'cm')).toBe('too_small'); // 0.4 mm rounds to 0
    expect(mm(1, 'in')).toBe(25); // 25.4 mm
    expect(mm(2, 'in')).toBe(51); // 50.8 mm
    expect(mm(3, 'in')).toBe(76); // 76.2 mm
    expect(mm(0.5, 'in')).toBe(13); // 12.7 mm
    expect(mm(100, 'cm')).toBe(1000);
  });

  it('enforces the length limit at the boundary and one past it', () => {
    const mm = (v: number, u: string) => { const r = toMillimetres(v, u); return r.ok ? r.value : r.code; };
    expect(mm(100_000, 'mm')).toBe(100_000);
    expect(mm(100_000.4, 'mm')).toBe(100_000);
    expect(mm(100_000.5, 'mm')).toBe('too_large');
    expect(mm(100_001, 'mm')).toBe('too_large');
    expect(mm(10_000, 'cm')).toBe(100_000);
    expect(mm(10_000.05, 'cm')).toBe('too_large'); // 100,000.5 mm
    expect(mm(3937.02, 'in')).toBe(100_000); // 100,000.308 mm
    expect(mm(3937.03, 'in')).toBe('too_large'); // 100,000.562 mm
  });

  it('converts weights exactly (kg, g, lb) with the same limits', () => {
    const g = (v: number, u: string) => { const r = toGrams(v, u); return r.ok ? r.value : r.code; };
    expect(g(1.5, 'kg')).toBe(1500);
    expect(g(0.0005, 'kg')).toBe(1); // 0.5 g -> 1
    expect(g(0.0004, 'kg')).toBe('too_small');
    expect(g(0.001, 'kg')).toBe(1);
    expect(g(1, 'lb')).toBe(454); // 453.59237 g
    expect(g(2, 'lb')).toBe(907); // 907.18474 g
    expect(g(10, 'lb')).toBe(4536); // 4535.9237 g
    expect(g(10_000, 'kg')).toBe(10_000_000);
    expect(g(10_000.001, 'kg')).toBe('too_large');
    expect(g(10_000_000, 'g')).toBe(10_000_000);
    expect(g(10_000_001, 'g')).toBe('too_large');
    expect(g(22_046.2, 'lb')).toBe(9_999_988); // 9,999,988.0 g
    expect(g(22_046.3, 'lb')).toBe('too_large'); // 10,000,033 g
  });

  it('rejects non-finite, non-numeric, zero, negative, absurd and unknown-unit values', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '5', null, undefined, {}]) {
      const r = toMillimetres(bad, 'cm');
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.code).toBe('not_a_number');
    }
    expect(toMillimetres(0, 'cm')).toMatchObject({ ok: false, code: 'not_positive' });
    expect(toMillimetres(-1, 'cm')).toMatchObject({ ok: false, code: 'not_positive' });
    expect(toMillimetres(-0, 'cm')).toMatchObject({ ok: false, code: 'not_positive' });
    expect(toMillimetres(1e300, 'cm')).toMatchObject({ ok: false, code: 'too_large' });
    expect(toMillimetres(1e21, 'mm')).toMatchObject({ ok: false, code: 'too_large' });
    expect(toMillimetres(1e-12, 'mm')).toMatchObject({ ok: false, code: 'too_small' });
    expect(toMillimetres(1.5e-7, 'mm')).toMatchObject({ ok: false, code: 'too_small' });
    expect(toMillimetres(5, 'furlong')).toMatchObject({ ok: false, code: 'bad_unit' });
    expect(toGrams(5, 'stone')).toMatchObject({ ok: false, code: 'bad_unit' });
    expect(toGrams(Number.NaN, 'kg')).toMatchObject({ ok: false, code: 'not_a_number' });
  });

  it('round-trips: what the API shows converts back to the stored integer', () => {
    for (let mm = 1; mm <= 100_000; mm += 7) {
      for (const unit of ['mm', 'cm', 'in'] as const) {
        const back = toMillimetres(fromMillimetres(mm, unit), unit);
        expect(back, `${mm} mm via ${unit}`).toEqual({ ok: true, value: mm });
      }
    }
    for (const mm of [1, 2, 3, 99_999, 100_000]) expect(toMillimetres(fromMillimetres(mm, 'in'), 'in')).toEqual({ ok: true, value: mm });
    for (let g = 1; g <= 10_000_000; g += 4999) {
      for (const unit of ['g', 'kg', 'lb'] as const) {
        const back = toGrams(fromGrams(g, unit), unit);
        expect(back, `${g} g via ${unit}`).toEqual({ ok: true, value: g });
      }
    }
    for (let g = 1; g <= 5000; g++) expect(toGrams(fromGrams(g, 'lb'), 'lb')).toEqual({ ok: true, value: g });
    for (let mm = 1; mm <= 3000; mm++) expect(toMillimetres(fromMillimetres(mm, 'in'), 'in')).toEqual({ ok: true, value: mm });
  });

  it('normalizes dimension / weight objects with field-level problems', () => {
    expect(normalizeDimensions(undefined)).toEqual({ value: undefined, issues: [] });
    expect(normalizeDimensions(null)).toEqual({ value: null, issues: [] });
    expect(normalizeDimensions({ length: 10, width: 20, height: 30, unit: 'cm' })).toEqual({ value: { length: 100, width: 200, height: 300 }, issues: [] });
    expect(normalizeDimensions({ length: 10, width: 20, height: 30 }).value).toEqual({ length: 100, width: 200, height: 300 }); // default unit cm
    const bad = normalizeDimensions({ length: 0, width: 100_001, height: 5, unit: 'mm' });
    expect(bad.value).toBeUndefined();
    expect(bad.issues.map((i) => [i.field, i.code])).toEqual([['dimensions.length', 'not_positive'], ['dimensions.width', 'too_large']]);
    expect(normalizeDimensions({ length: 1, width: 1, height: 1, unit: 'yd' }).issues[0]).toMatchObject({ field: 'dimensions.unit', code: 'bad_unit' });
    expect(normalizeWeight({ value: 1.5, unit: 'kg' })).toEqual({ value: 1500, issues: [] });
    expect(normalizeWeight({ value: 1.5 })).toEqual({ value: 1500, issues: [] });
    expect(normalizeWeight({ value: -1, unit: 'kg' }).issues[0]).toMatchObject({ field: 'weight.value', code: 'not_positive' });
    expect(normalizeWeight({ value: 1, unit: 'oz' }).issues[0]).toMatchObject({ field: 'weight.unit', code: 'bad_unit' });
    expect(normalizeWeight(null)).toEqual({ value: null, issues: [] });
  });
});

// ==================================================================================================
// pure units: description sanitiser
// ==================================================================================================
const ALLOWED_TAG = /<(?!\/?(?:p|br|strong|em|ul|ol|li|a)\b)/;
const assertSafe = (html: string) => {
  expect(html, html).not.toMatch(ALLOWED_TAG); // every "<" starts an allowed tag
  expect(html.toLowerCase()).not.toMatch(/\son[a-z]+=/);
  expect(html.toLowerCase()).not.toContain('javascript:');
  expect(html.toLowerCase()).not.toContain('<script');
  for (const m of html.matchAll(/<a\b[^>]*>/g)) expect(m[0]).toMatch(/^<a href="(?:https?:|mailto:)[^"<>]*" rel="noopener noreferrer nofollow">$/i);
};

describe('description sanitiser (pure)', () => {
  it('turns plain text into paragraphs and keeps the plain form', () => {
    const r = sanitizeDescription('First line\nsecond line\n\nNew paragraph & more');
    expect(r.html).toBe('<p>First line<br>second line</p><p>New paragraph &amp; more</p>');
    expect(r.text).toBe('First line\nsecond line\n\nNew paragraph & more');
    expect(r.length).toBe([...r.text].length);
    expect(sanitizeDescription('')).toEqual({ html: '', text: '', length: 0 });
    expect(sanitizeDescription('   \n\n  ')).toEqual({ html: '', text: '', length: 0 });
    expect(sanitizeDescription('<p></p><p><br></p>')).toEqual({ html: '', text: '', length: 0 });
  });

  it('keeps the editor subset and converts b/i', () => {
    expect(sanitizeDescription('<b>x</b><i>y</i>').html).toBe('<p><strong>x</strong><em>y</em></p>');
    const r = sanitizeDescription('<p>Intro</p><ul><li>One</li><li>Two</li></ul><ol><li>A</li><li>B</li></ol>');
    expect(r.html).toBe('<p>Intro</p><ul><li>One</li><li>Two</li></ul><ol><li>A</li><li>B</li></ol>');
    expect(r.text).toBe('Intro\n\n- One\n- Two\n\n1. A\n2. B');
  });

  it('removes script/style/iframe/object content entirely and keeps unknown elements\' text', () => {
    expect(sanitizeDescription('<script>alert(1)</script>Hello').html).toBe('<p>Hello</p>');
    expect(sanitizeDescription('Hi<style>body{display:none}</style>there').text).toBe('Hithere');
    expect(sanitizeDescription('<iframe src="http://evil.test"></iframe>ok').text).toBe('ok');
    expect(sanitizeDescription('<object data="x"><embed src="y">fallback</object>ok').text).toBe('ok');
    expect(sanitizeDescription('<svg onload=alert(1)><script>x</script></svg>ok').text).toBe('ok');
    expect(sanitizeDescription('<script>alert(1)').html).toBe(''); // never closed: everything after it is code
    expect(sanitizeDescription('<script><script></script>still inside</script>after').text).toBe('after');
    expect(sanitizeDescription('<div><span class="x">kept</span></div>').html).toBe('<p>kept</p>');
    expect(sanitizeDescription('<h1>Title</h1>').text).toBe('Title');
  });

  it('strips event handlers, styles and unknown attributes', () => {
    expect(sanitizeDescription('<p onclick="x()" style="color:red" class="c" id="i">Hi</p>').html).toBe('<p>Hi</p>');
    expect(sanitizeDescription('<a href="http://x.com" onclick="evil()" target="_blank" title="t">l</a>').html).toBe('<p><a href="http://x.com" rel="noopener noreferrer nofollow">l</a></p>');
    expect(sanitizeDescription('<strong onmouseover=alert(1)>b</strong>').html).toBe('<p><strong>b</strong></p>');
    expect(sanitizeDescription('<img src=x onerror=alert(1)>text').html).toBe('<p>text</p>');
  });

  it('rejects javascript:, data:, vbscript: and obfuscated schemes in links (whitespace, entities, zero-width characters)', () => {
    const zw = cc(0x200b);
    const nbsp = cc(0xa0);
    const hrefs = [
      'javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java\rscript:alert(1)', `java${zw}script:alert(1)`, `java${nbsp}script:alert(1)`,
      'java&#x09;script:alert(1)', 'java&#10;script:alert(1)', '&#106;avascript:alert(1)', '&#x6A;avascript:alert(1)', 'javascript&colon;alert(1)', 'javascript&#58;alert(1)',
      '&#0000106avascript:alert(1)', `${cc(1)}javascript:alert(1)`, 'data:text/html,<script>alert(1)</script>', 'DATA:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)',
      'file:///etc/passwd', 'ftp://example.com/x', '//evil.test/x', '/relative/path', 'relative', '#frag', '?q=1', 'http:', 'https:', '', '   ', 'mailto', 'about:blank',
    ];
    for (const h of hrefs) {
      const r = sanitizeDescription(`<a href="${h}">click</a>`);
      expect(r.html, JSON.stringify(h)).toBe('<p>click</p>');
      expect(safeHref(h), JSON.stringify(h)).toBeNull();
      assertSafe(r.html);
    }
    // an unquoted or single-quoted hostile value behaves the same
    expect(sanitizeDescription('<a href=javascript:alert(1)>x</a>').html).toBe('<p>x</p>');
    expect(sanitizeDescription("<a href='javascript:alert(1)'>x</a>").html).toBe('<p>x</p>');
    expect(sanitizeDescription('<a>no href</a>').html).toBe('<p>no href</p>');
  });

  it('keeps http, https and mailto links, escapes them and decodes entities in the plain-text form', () => {
    const r = sanitizeDescription('<a href="https://example.com/p?a=1&amp;b=2&c=3">Buy now</a>');
    expect(r.html).toBe('<p><a href="https://example.com/p?a=1&amp;b=2&amp;c=3" rel="noopener noreferrer nofollow">Buy now</a></p>');
    expect(r.text).toBe('Buy now (https://example.com/p?a=1&b=2&c=3)'); // the href is decoded, not "&amp;"
    expect(sanitizeDescription('<a href=http://x.com>y</a>').html).toBe('<p><a href="http://x.com" rel="noopener noreferrer nofollow">y</a></p>');
    expect(sanitizeDescription('<a href="mailto:sales@example.com">mail us</a>').text).toBe('mail us (mailto:sales@example.com)');
    expect(sanitizeDescription('<a href="https://x.com">https://x.com</a>').text).toBe('https://x.com'); // no duplicate url
    expect(sanitizeDescription('<a href="https://x.com/&quot;onmouseover=&quot;alert(1)">x</a>').html).toBe('<p><a href="https://x.com/&quot;onmouseover=&quot;alert(1)" rel="noopener noreferrer nofollow">x</a></p>'); // quotes stay inside the attribute
    expect(safeHref('https://' + 'a'.repeat(2100))).toBeNull(); // too long
    expect(sanitizeDescription('<a href="https://a.com"><a href="https://b.com">nested</a></a>').html).toBe('<p><a href="https://a.com" rel="noopener noreferrer nofollow">nested</a></p>'); // no nested anchors
  });

  it('handles nested, unclosed and misplaced tags into well-formed output', () => {
    expect(sanitizeDescription('<p><strong>bold <em>both</p>').html).toBe('<p><strong>bold <em>both</em></strong></p>');
    expect(sanitizeDescription('<strong>never closed').html).toBe('<p><strong>never closed</strong></p>');
    expect(sanitizeDescription('</p></strong></ul>text').html).toBe('<p>text</p>');
    expect(sanitizeDescription('<li>orphan item</li>').html).toBe('<p>orphan item</p>');
    expect(sanitizeDescription('<ul><li>one<li>two</ul>').html).toBe('<ul><li>one</li><li>two</li></ul>');
    expect(sanitizeDescription('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>').html).toBe('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>');
    expect(sanitizeDescription('<ul>direct text</ul>').html).toBe('<ul><li>direct text</li></ul>');
    expect(sanitizeDescription('<p>one<p>two').html).toBe('<p>one</p><p>two</p>');
    expect(sanitizeDescription('<strong>a<ul><li>b</li></ul></strong>').html).toBe('<p><strong>a</strong></p><ul><li>b</li></ul>');
    expect(sanitizeDescription('line<br/>break<br>x').text).toBe('line\nbreak\nx');
    expect(sanitizeDescription('<scr<script>ipt>alert(1)</scr</script>ipt>').html).not.toContain('<script');
    assertSafe(sanitizeDescription('<scr<script>ipt>alert(1)</scr</script>ipt>').html);
    assertSafe(sanitizeDescription('<<p>>x<</p>').html);
    assertSafe(sanitizeDescription('<a href="http://x.com" <script>alert(1)</script>>y</a>').html);
  });

  it('keeps a literal "<" and ">" in text instead of swallowing the rest', () => {
    const r = sanitizeDescription('1 < 2 and 3 > 2');
    expect(r.text).toBe('1 < 2 and 3 > 2');
    expect(r.html).toBe('<p>1 &lt; 2 and 3 &gt; 2</p>');
    expect(sanitizeDescription('if x<y then z').text).toBe('if x<y then z');
    expect(sanitizeDescription('Tom &amp; Jerry &lt;3 &#65;').text).toBe('Tom & Jerry <3 A');
    expect(sanitizeDescription('Tom &amp; Jerry &lt;3').html).toBe('<p>Tom &amp; Jerry &lt;3</p>');
    expect(sanitizeDescription('&lt;script&gt;alert(1)&lt;/script&gt;').html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>'); // entity-escaped markup stays text
    assertSafe(sanitizeDescription('&lt;script&gt;alert(1)&lt;/script&gt; <b>x</b>').html);
  });

  it('removes control characters, bidi overrides and lone surrogates, keeps emoji and Indic text', () => {
    expect(sanitizeDescription(`a${cc(0)}b${cc(7)}c${cc(0x202e)}d${cc(0xfeff)}e`).text).toBe('abcde');
    expect(sanitizeDescription(`x${String.fromCharCode(0xd800)}y`).text).toBe('xy');
    expect(sanitizeDescription('&#0;&#8;&#x202E;ok').text).toBe('ok');
    const mixed = `${cc(0x1f600)} ${cc(0x928, 0x92e, 0x938, 0x94d, 0x924, 0x947)} caf${cc(0xe9)}`;
    expect(sanitizeDescription(mixed).text).toBe(mixed);
  });

  it('counts the limit in code points (emoji are one character)', () => {
    const emoji = cc(0x1f600);
    expect(sanitizeDescription(emoji.repeat(2000)).length).toBe(2000);
    expect(sanitizeDescription(emoji.repeat(2001)).length).toBe(2001);
    expect(DESCRIPTION_MAX_CHARS).toBe(2000);
  });

  it('is idempotent: sanitising the sanitised html changes nothing', () => {
    const samples = [
      'plain & simple', '<p>a</p><ul><li>b</li></ul>', '<b>x</b> <i>y</i> <a href="https://e.com/?a=1&b=2">z</a>', '1 < 2', '<ul><li>a<ul><li>b</li></ul></li></ul>',
      '<p><strong>bold <em>both</p>', 'line1\nline2\n\npara', '<a href="mailto:a@b.co">m</a>',
    ];
    for (const s of samples) {
      const once = sanitizeDescription(s);
      const twice = sanitizeDescription(once.html);
      expect(twice.html, s).toBe(once.html);
      expect(twice.text, s).toBe(once.text);
    }
  });

  it('truncates plain text at a sentence or word boundary', () => {
    expect(truncatePlainText('short', 2000)).toBe('short');
    expect(truncatePlainText('One two three. Four five six seven eight nine ten.', 20)).toBe('One two three.');
    expect(truncatePlainText('One two three. Four five six seven eight nine ten.', 30)).toBe('One two three. Four five six'); // the sentence end is too early: cut at a word
    expect(truncatePlainText('alpha beta gamma delta epsilon zeta', 20)).toBe('alpha beta gamma');
    expect(truncatePlainText('x'.repeat(50), 10)).toBe('x'.repeat(10));
    expect([...truncatePlainText(cc(0x1f600).repeat(30), 10)]).toHaveLength(10);
  });

  it('survives pathological input quickly (linear time, bounded output)', () => {
    const cases: Array<[string, string]> = [
      ['unterminated tags', '<a '.repeat(300_000)],
      ['bare angle brackets', '<'.repeat(1_000_000)],
      ['deep paragraphs', '<p>'.repeat(200_000)],
      ['deep lists', '<ul><li>'.repeat(60_000)],
      ['deep inline', '<strong><em><a href="http://x.com">'.repeat(40_000)],
      ['unclosed comments', '<!--'.repeat(100_000)],
      ['open quotes', "<a href='".repeat(100_000)],
      ['many attributes', `<a ${'x=1 '.repeat(100_000)}>y</a>`],
      ['entities', '&#x41;'.repeat(150_000)],
      ['ampersands', '&'.repeat(1_000_000)],
      ['doctype spam', '<!x'.repeat(100_000)],
      ['script spam', '<script>'.repeat(100_000)],
      ['mixed tags', '<b><i>x</b></i><li><ul>'.repeat(40_000)],
      ['long text', 'word '.repeat(200_000)],
      ['angle then letter', '<a<a<a<a'.repeat(100_000)],
    ];
    for (const [name, input] of cases) {
      const t0 = performance.now();
      const r = sanitizeDescription(input);
      const ms = performance.now() - t0;
      expect(ms, `${name}: ${ms.toFixed(0)} ms`).toBeLessThan(1500);
      expect(r.html.length, name).toBeLessThan(400_000);
      assertSafe(r.html);
    }
  });

  it('toPlainText decodes hrefs and collapses whitespace', () => {
    expect(toPlainText('<p>See <a href="https://e.com/?a=1&amp;b=2">here</a>.</p>')).toBe('See here (https://e.com/?a=1&b=2).');
    expect(toPlainText('<p>a\n   b\tc</p>')).toBe('a b c');
  });
});

// ==================================================================================================
// pure units: field rules
// ==================================================================================================
describe('field rules (pure)', () => {
  it('validates the master code', () => {
    expect(checkCode('TRV-1042')).toEqual({ code: 'TRV-1042', reason: null });
    expect(checkCode('  trv/10.2_x  ')).toEqual({ code: 'trv/10.2_x', reason: null });
    expect(checkCode('A'.repeat(64)).reason).toBeNull();
    expect(checkCode('A'.repeat(65)).reason).toBe('too_long');
    expect(checkCode('').reason).toBe('empty');
    expect(checkCode('   ').reason).toBe('empty');
    expect(checkCode(null).reason).toBe('empty');
    expect(checkCode('bad code').reason).toBe('invalid_characters');
    expect(checkCode('-abc').reason).toBe('invalid_characters');
    expect(checkCode('abc!').reason).toBe('invalid_characters');
    expect(checkCode('DRAFT-ABCD1234').reason).toBe('placeholder');
    expect(checkCode('draft-abcd1234').reason).toBe('placeholder');
    expect(checkCode('DRAFT-ABCD123').reason).toBeNull(); // 7 characters: a normal code
    expect(checkCode('DRAFT-ABCD12345').reason).toBeNull();
  });

  it('normalizes names and keys', () => {
    expect(collapseSpaces('  Urban \t  Carry\n')).toBe('Urban Carry');
    expect(nameKey('  URBAN   Carry ')).toBe('urban carry');
  });

  it('validates custom attributes (limits, duplicates, confirmation carry-over)', () => {
    const ok = normalizeCustomAttributes([{ name: ' Collection ', value: ' Summer  2026 ' }, { name: '', value: '' }]);
    expect(ok.issues).toEqual([]);
    expect(ok.value).toEqual([{ name: 'Collection', value: 'Summer 2026', confirmed: false }]);
    expect(normalizeCustomAttributes(null)).toEqual({ value: [], issues: [] });
    expect(normalizeCustomAttributes(undefined)).toEqual({ value: undefined, issues: [] });
    const twenty = Array.from({ length: 20 }, (_, i) => ({ name: `n${i}`, value: 'v' }));
    expect(normalizeCustomAttributes(twenty).issues).toEqual([]);
    expect(normalizeCustomAttributes([...twenty, { name: 'n20', value: 'v' }]).issues[0]).toMatchObject({ field: 'customAttributes', code: 'too_many' });
    expect(normalizeCustomAttributes([{ name: 'x'.repeat(60), value: 'v' }]).issues).toEqual([]);
    expect(normalizeCustomAttributes([{ name: 'x'.repeat(61), value: 'v' }]).issues[0]).toMatchObject({ field: 'customAttributes[0].name', code: 'too_long' });
    expect(normalizeCustomAttributes([{ name: 'n', value: 'y'.repeat(250) }]).issues).toEqual([]);
    expect(normalizeCustomAttributes([{ name: 'n', value: 'y'.repeat(251) }]).issues[0]).toMatchObject({ field: 'customAttributes[0].value', code: 'too_long' });
    expect(normalizeCustomAttributes([{ name: '', value: 'v' }]).issues[0]).toMatchObject({ field: 'customAttributes[0].name', code: 'required' });
    expect(normalizeCustomAttributes([{ name: 'n', value: '  ' }, { name: 'm', value: 'v' }]).issues[0]).toMatchObject({ field: 'customAttributes[0].value', code: 'required' });
    expect(normalizeCustomAttributes([{ name: 'Colour', value: 'a' }, { name: ' colour ', value: 'b' }]).issues[0]).toMatchObject({ field: 'customAttributes[1].name', code: 'duplicate_name' });
    // re-sending an unchanged confirmed fact keeps it confirmed; changing the value un-confirms it; explicit flags win
    const prev = [{ name: 'Fabric', value: 'Cotton', confirmed: true }, { name: 'Fit', value: 'Slim', confirmed: true }];
    const again = normalizeCustomAttributes([{ name: 'fabric', value: 'Cotton' }, { name: 'Fit', value: 'Regular' }, { name: 'New', value: 'x', confirmed: true }], prev);
    expect(again.value).toEqual([{ name: 'fabric', value: 'Cotton', confirmed: true }, { name: 'Fit', value: 'Regular', confirmed: false }, { name: 'New', value: 'x', confirmed: true }]);
  });

  it('normalizes a whole input with field-level issues; lenient mode cuts instead of failing', () => {
    const strict = { strict: true };
    const bad = normalizeFields({ title: '  ', brand: 'b'.repeat(81), material: 'm'.repeat(81), standardCategory: 's'.repeat(121), hsnCode: '12345', gstRateBps: 2801, countryOfOrigin: 'ZZ', productCode: 'DRAFT-ABCD1234' }, strict);
    expect(bad.issues.map((i) => i.field).sort()).toEqual(['brand', 'countryOfOrigin', 'gstRateBps', 'hsnCode', 'material', 'productCode', 'standardCategory', 'title']);
    const good = normalizeFields({ title: '  A   product  ', brand: ' Urban   Carry ', hsnCode: '6109', gstRateBps: 2800, countryOfOrigin: 'in', material: 'Canvas', dimensions: { length: 10, width: 5, height: 2.5, unit: 'cm' }, weight: { value: 1.2, unit: 'kg' } }, strict);
    expect(good.issues).toEqual([]);
    expect(good.fields).toMatchObject({ title: 'A product', brand: 'Urban Carry', hsnCode: '6109', gstRateBps: 2800, countryOfOrigin: 'IN', material: 'Canvas', lengthMm: 100, widthMm: 50, heightMm: 25, weightGrams: 1200 });
    for (const h of ['1234', '123456', '12345678']) expect(normalizeFields({ hsnCode: h }, strict).issues).toEqual([]);
    for (const h of ['123', '12345', '1234567', '123456789', 'abcd', '12 34']) expect(normalizeFields({ hsnCode: h }, strict).issues[0]).toMatchObject({ field: 'hsnCode' });
    for (const g of [0, 500, 1800, 2800]) expect(normalizeFields({ gstRateBps: g }, strict).issues).toEqual([]);
    for (const g of [-1, 2801, 18.5]) expect(normalizeFields({ gstRateBps: g }, strict).issues[0]).toMatchObject({ field: 'gstRateBps' });
    const lenient = normalizeFields({ title: 't'.repeat(250), brand: 'b'.repeat(90), description: 'word '.repeat(600) }, { strict: false });
    expect(lenient.issues).toEqual([]);
    expect([...lenient.fields.title!]).toHaveLength(200);
    expect([...lenient.fields.brand!]).toHaveLength(80);
    expect([...lenient.fields.description!].length).toBeLessThanOrEqual(2000);
    // a draft keeps its generated code when the client sends it back
    expect(normalizeFields({ productCode: 'DRAFT-ABCD1234' }, { strict: true, currentPlaceholderCode: 'DRAFT-ABCD1234' }).issues).toEqual([]);
    expect(normalizeFields({ productCode: 'DRAFT-ZZZZ9999' }, { strict: true, currentPlaceholderCode: 'DRAFT-ABCD1234' }).issues[0]).toMatchObject({ code: 'placeholder_code' });
    // description rules
    expect(normalizeFields({ description: 'a'.repeat(2000) }, strict).issues).toEqual([]);
    const tooLong = normalizeFields({ description: 'a'.repeat(2001) }, strict).issues[0]!;
    expect(tooLong).toMatchObject({ field: 'description', code: 'description_too_long', length: 2001, max: 2000 });
    expect(normalizeFields({ descriptionHtml: '<p>hi</p>', description: 'ignored' }, strict).fields).toMatchObject({ description: 'hi', descriptionHtml: '<p>hi</p>' });
    expect(normalizeFields({ description: null }, strict).fields).toMatchObject({ description: null, descriptionHtml: null });
  });

  it('ships the ISO country list with India first', () => {
    expect(COUNTRIES[0]).toEqual({ code: 'IN', name: 'India' });
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(249);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    expect(isCountryCode('US') && isCountryCode('JP') && isCountryCode('ZW') && isCountryCode('AX')).toBe(true);
    expect(isCountryCode('ZZ') || isCountryCode('in') || isCountryCode('IND')).toBe(false);
    const rest = COUNTRIES.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

// ==================================================================================================
// pure units: creation readiness
// ==================================================================================================
const base = (o: Partial<ReadinessInput> = {}): ReadinessInput => ({
  title: null, categoryId: null, productType: 'physical', code: null, codeIsPlaceholder: false, verifiedCode: null, codeConflict: false, brand: null, brandConfirmed: false,
  descriptionText: null, customAttributeCount: 0, categoryAttributes: { required: 0, filled: 0 }, image: 'none', channels: [], ...o,
});
const stateOf = (r: ReturnType<typeof evaluateCreationReadiness>, key: string) => [...r.required, ...r.recommended].find((i) => i.key === key)!.state;
const CAT = '11111111-1111-4111-8111-111111111111';

describe('creation readiness (pure function)', () => {
  it('lists the 5 required and 3 recommended items in the design order', () => {
    const r = evaluateCreationReadiness(base());
    expect(r.required.map((i) => i.key)).toEqual(['product_name', 'category', 'product_type', 'primary_image', 'master_sku']);
    expect(r.recommended.map((i) => i.key)).toEqual(['description', 'brand', 'attributes']);
    expect(r.required.map((i) => i.label)).toEqual(['Product name', 'Category', 'Product type', 'Primary image', 'Master SKU']);
    expect(r.chain).toEqual(['Product', 'Variants', 'Inventory', 'Listings', 'Channels']);
    expect(r.percent).toBe(13); // only the product type is done: 1 of 8 = 12.5 -> 13
  });

  it('product name needs 3 characters after trimming', () => {
    expect(stateOf(evaluateCreationReadiness(base({ title: 'ab' })), 'product_name')).toBe('pending');
    expect(stateOf(evaluateCreationReadiness(base({ title: '  ab  ' })), 'product_name')).toBe('pending');
    expect(stateOf(evaluateCreationReadiness(base({ title: 'abc' })), 'product_name')).toBe('done');
    expect(stateOf(evaluateCreationReadiness(base({ title: cc(0x1f600).repeat(3) })), 'product_name')).toBe('done');
  });

  it('category and product type', () => {
    expect(stateOf(evaluateCreationReadiness(base({ categoryId: CAT })), 'category')).toBe('done');
    expect(stateOf(evaluateCreationReadiness(base()), 'category')).toBe('pending');
    expect(stateOf(evaluateCreationReadiness(base({ productType: null })), 'product_type')).toBe('done');
    expect(stateOf(evaluateCreationReadiness(base({ productType: 'service' })), 'product_type')).toBe('done');
  });

  it('primary image: ready, placeholder, uploading, none', () => {
    const r = (image: ReadinessInput['image']) => evaluateCreationReadiness(base({ image }));
    expect(stateOf(r('ready'), 'primary_image')).toBe('done');
    expect(stateOf(r('placeholder'), 'primary_image')).toBe('placeholder');
    expect(stateOf(r('uploading'), 'primary_image')).toBe('uploading');
    expect(stateOf(r('none'), 'primary_image')).toBe('pending');
    expect(r('uploading').required.find((i) => i.key === 'primary_image')!.tag).toBe('Uploading');
    expect(r('placeholder').required.find((i) => i.key === 'primary_image')!.tag).toBe('Placeholder');
    expect(r('ready').required.find((i) => i.key === 'primary_image')!.tag).toBeUndefined();
  });

  it('master SKU: pending, verify, done, duplicate', () => {
    const r = (o: Partial<ReadinessInput>) => stateOf(evaluateCreationReadiness(base(o)), 'master_sku');
    expect(r({})).toBe('pending');
    expect(r({ code: '' })).toBe('pending');
    expect(r({ code: 'DRAFT-ABCD1234' })).toBe('pending'); // the generated code is not a real SKU
    expect(r({ code: 'TRV-1042', codeIsPlaceholder: true })).toBe('pending');
    expect(r({ code: 'bad code' })).toBe('pending');
    expect(r({ code: 'TRV-1042' })).toBe('verify');
    expect(r({ code: 'TRV-1042', verifiedCode: 'OTHER-1' })).toBe('verify'); // verified another code
    expect(r({ code: 'TRV-1042', verifiedCode: 'TRV-1042' })).toBe('done');
    expect(r({ code: 'TRV-1042', verifiedCode: 'TRV-1042', codeConflict: true })).toBe('duplicate'); // conflict wins
    expect(r({ code: 'TRV-1042', codeConflict: true })).toBe('duplicate');
    expect(r({ code: 'bad code', codeConflict: true })).toBe('pending');
    const tags = evaluateCreationReadiness(base({ code: 'A-1' })).required.find((i) => i.key === 'master_sku')!;
    expect(tags.tag).toBe('Verify');
    expect(evaluateCreationReadiness(base({ code: 'A-1', codeConflict: true })).required.find((i) => i.key === 'master_sku')!.tag).toBe('Duplicate');
  });

  it('brand: pending, confirm, done', () => {
    const r = (o: Partial<ReadinessInput>) => stateOf(evaluateCreationReadiness(base(o)), 'brand');
    expect(r({})).toBe('pending');
    expect(r({ brand: '   ' })).toBe('pending');
    expect(r({ brand: 'Urban Carry' })).toBe('confirm');
    expect(r({ brand: 'Urban Carry', brandConfirmed: true })).toBe('done');
    expect(r({ brand: null, brandConfirmed: true })).toBe('pending');
    expect(evaluateCreationReadiness(base({ brand: 'X' })).recommended.find((i) => i.key === 'brand')!.tag).toBe('Confirm');
  });

  it('attributes: a custom attribute or all required category attributes', () => {
    const r = (o: Partial<ReadinessInput>) => stateOf(evaluateCreationReadiness(base(o)), 'attributes');
    expect(r({})).toBe('pending');
    expect(r({ customAttributeCount: 1 })).toBe('done');
    expect(r({ categoryAttributes: { required: 2, filled: 1 } })).toBe('pending');
    expect(r({ categoryAttributes: { required: 2, filled: 2 } })).toBe('done');
    expect(r({ categoryAttributes: { required: 0, filled: 0 } })).toBe('pending'); // a category without required attributes proves nothing
  });

  it('description: any text counts', () => {
    const r = (d: string | null) => stateOf(evaluateCreationReadiness(base({ descriptionText: d })), 'description');
    expect(r(null)).toBe('pending');
    expect(r('')).toBe('pending');
    expect(r('   ')).toBe('pending');
    expect(r('x')).toBe('done');
  });

  it('percent = round(100 x (done + placeholder) / 8): the design\'s 3 of 8 is 38', () => {
    const figma = evaluateCreationReadiness(base({ title: 'Premium Travel Bag', categoryId: CAT, code: 'TRV-1042', brand: 'Urban Carry' }));
    expect(figma.required.map((i) => i.state)).toEqual(['done', 'done', 'done', 'pending', 'verify']);
    expect(figma.recommended.map((i) => i.state)).toEqual(['pending', 'confirm', 'pending']);
    expect(figma.percent).toBe(38);
    expect(evaluateCreationReadiness(base({ title: 'abc', categoryId: CAT, code: 'TRV-1042', verifiedCode: 'TRV-1042', brand: 'U', brandConfirmed: true, image: 'ready' })).percent).toBe(75); // 6 of 8
    const all = base({ title: 'abc', categoryId: CAT, code: 'TRV-1042', verifiedCode: 'TRV-1042', brand: 'U', brandConfirmed: true, image: 'ready', descriptionText: 'd', customAttributeCount: 1 });
    expect(evaluateCreationReadiness(all).percent).toBe(100);
    expect(evaluateCreationReadiness({ ...all, image: 'placeholder' }).percent).toBe(100); // a placeholder counts for the percent...
    expect(evaluateCreationReadiness({ ...all, image: 'placeholder' }).blockers.map((b) => b.key)).toEqual(['primary_image']); // ...but still blocks
    expect(evaluateCreationReadiness({ ...all, image: 'uploading' }).percent).toBe(88); // 7 of 8 = 87.5
    expect(evaluateCreationReadiness({ ...all, codeConflict: true }).percent).toBe(88);
    const counts = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => Math.round((100 * n) / 8));
    expect(counts).toEqual([0, 13, 25, 38, 50, 63, 75, 88, 100]);
  });

  it('blockers: required items only, with the design messages and fix targets', () => {
    const r = evaluateCreationReadiness(base({ title: 'Premium Travel Bag', categoryId: CAT, code: 'TRV-1042', brand: 'Urban Carry' }));
    expect(r.blockers).toEqual([{ key: 'primary_image', state: 'pending', message: 'Add a primary image before publishing this product to marketplaces.', fixTarget: 'primary_image' }]); // verify and confirm do not block
    const up = evaluateCreationReadiness(base({ title: 'abc', categoryId: CAT, code: 'A-1', image: 'uploading' }));
    expect(up.blockers[0]).toMatchObject({ key: 'primary_image', state: 'uploading', message: 'Primary image is uploading. Publication stays blocked until the upload completes.' });
    const dup = evaluateCreationReadiness(base({ title: 'abc', categoryId: CAT, code: 'A-1', codeConflict: true }));
    expect(dup.blockers.map((b) => [b.key, b.state, b.message, b.fixTarget])).toEqual([
      ['primary_image', 'pending', 'Add a primary image before publishing this product to marketplaces.', 'primary_image'],
      ['master_sku', 'duplicate', 'Resolve the duplicate SKU to continue.', 'master_sku'],
    ]);
    const ph = evaluateCreationReadiness(base({ image: 'placeholder' }));
    expect(ph.blockers.find((b) => b.key === 'primary_image')).toMatchObject({ state: 'placeholder', message: 'Replace the placeholder image before publishing.' });
    const empty = evaluateCreationReadiness(base());
    expect(empty.blockers.map((b) => [b.key, b.fixTarget])).toEqual([['product_name', 'product_name'], ['category', 'category'], ['primary_image', 'primary_image'], ['master_sku', 'master_sku']]);
    expect(empty.blockers.some((b) => b.key === 'product_type' || b.key === 'description' || b.key === 'brand')).toBe(false);
  });

  it('hints: the tag explanation shows while a verify or confirm tag exists', () => {
    const HINT = 'SKU and brand are entered; circles indicate pending verification or confirmation, not missing values.';
    expect(evaluateCreationReadiness(base({ code: 'A-1' })).hints).toEqual([HINT]);
    expect(evaluateCreationReadiness(base({ brand: 'X' })).hints).toEqual([HINT]);
    expect(evaluateCreationReadiness(base()).hints).toEqual([]);
    expect(evaluateCreationReadiness(base({ code: 'A-1', verifiedCode: 'A-1', brand: 'X', brandConfirmed: true })).hints).toEqual([]);
  });

  it('passes the connected channels through', () => {
    const channels = [{ code: 'flipkart', name: 'Flipkart' }, { code: 'mock', name: 'Mock' }];
    expect(evaluateCreationReadiness(base({ channels })).channels).toEqual(channels);
  });

  it('resolves the primary image state from documents (same definition as the images endpoint)', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const mins = (m: number) => new Date(now.getTime() - m * 60_000);
    const doc = (o: Partial<{ id: string; status: string; isPrimary: boolean; isPlaceholder: boolean; createdAt: Date }>) => ({ id: randomUUID(), status: 'uploaded', isPrimary: false, isPlaceholder: false, createdAt: mins(1), ...o });
    expect(resolveImageState([], now).state).toBe('none');
    expect(resolveImageState([doc({ isPrimary: true })], now).state).toBe('ready');
    expect(resolveImageState([doc({ isPrimary: true, status: 'processed' })], now).state).toBe('ready');
    expect(resolveImageState([doc({ isPrimary: true, isPlaceholder: true })], now).state).toBe('placeholder');
    expect(resolveImageState([doc({})], now).state).toBe('none'); // uploaded but not primary
    expect(resolveImageState([doc({ status: 'pending_upload', createdAt: mins(29) })], now).state).toBe('uploading');
    expect(resolveImageState([doc({ status: 'pending_upload', createdAt: mins(31) })], now).state).toBe('none'); // abandoned upload
    expect(resolveImageState([doc({ status: 'pending_upload', createdAt: mins(5) }), doc({ isPrimary: true })], now).state).toBe('ready'); // a ready primary wins
    expect(resolveImageState([doc({ status: 'rejected', isPrimary: true })], now).state).toBe('none');
    const withPrimary = resolveImageState([doc({ id: 'p1', isPrimary: true })], now);
    expect(withPrimary.primary?.id).toBe('p1');
  });
});

// ==================================================================================================
// HTTP
// ==================================================================================================
let t: TestApp;
let c: ReturnType<typeof clientFor>;
let admin: Actor;
let staff: Actor;
let viewer: Actor;
let other: Actor;

const J = (r: { body: unknown }) => JSON.stringify(r.body);
const owner = async (q: string, params: unknown[] = []) => {
  const pg = t.database!.pg;
  await pg.exec('RESET ROLE');
  try { return await pg.query<any>(q, params); } finally { await pg.exec('SET ROLE oms_app'); }
};
const draft = async (body: Record<string, unknown>, as: Actor = admin) => {
  const r = await c.post('/api/v1/products/drafts', body, as);
  expect(r.status, J(r)).toBe(201);
  return r.body.data as any;
};
const category = async (name: string, as: Actor = admin) => {
  const r = await c.post('/api/v1/categories', { name }, as);
  expect(r.status, J(r)).toBe(201);
  return r.body.data.id as string;
};
const addDoc = (vendorId: string, productId: string, o: { status?: string; primary?: boolean; placeholder?: boolean; minutesAgo?: number } = {}) =>
  owner(
    `insert into product_documents (id, vendor_id, product_id, kind, storage_key, file_name, mime_type, size_bytes, purpose, is_primary, is_placeholder, status, created_at)
     values (gen_random_uuid(), $1, $2, 'image', $3, 'x.jpg', 'image/jpeg', 100, 'product_image', $4, $5, $6, now() - ($7::text || ' minutes')::interval) returning id`,
    [vendorId, productId, `vendors/${vendorId}/products/${productId}/${randomUUID()}.jpg`, o.primary ?? false, o.placeholder ?? false, o.status ?? 'uploaded', String(o.minutesAgo ?? 0)],
  );
const readinessOf = async (id: string, as: Actor = admin) => (await c.get(`/api/v1/products/${id}/creation-readiness`, as)).body.data;
const item = (r: any, key: string) => [...r.required, ...r.recommended].find((i: any) => i.key === key);

beforeAll(async () => {
  t = await buildTestApp({ database: true });
  c = clientFor(t);
  admin = await c.registerVendor({ businessName: 'Creation Co' });
  staff = await c.addMember(admin, 'vendor_staff');
  viewer = await c.addMember(admin, 'vendor_viewer');
  other = await c.registerVendor({ businessName: 'Rival Co' });
}, 120_000);
afterAll(() => t.close());

describe('form options', () => {
  it('returns product types, GST slabs, countries (India first), materials, units, limits and image rules', async () => {
    await c.post('/api/v1/products/drafts', { title: 'Material user', material: 'Hemp fibre' }, admin);
    const r = await c.get('/api/v1/products/form-options', viewer);
    expect(r.status, J(r)).toBe(200);
    const d = r.body.data;
    expect(d.productTypes).toEqual(['physical', 'digital', 'service', 'bundle']);
    expect(d.gstSlabs).toEqual([{ bps: 0, label: '0%' }, { bps: 500, label: '5%' }, { bps: 1200, label: '12%' }, { bps: 1800, label: '18%' }, { bps: 2800, label: '28%' }]);
    expect(d.countries[0]).toEqual({ code: 'IN', name: 'India' });
    expect(d.countries.length).toBeGreaterThanOrEqual(249);
    expect(d.materials.map((m: any) => m.value)).toEqual(expect.arrayContaining(['Canvas', 'Leather', 'Hemp fibre'])); // curated + the business's own
    expect(d.units).toEqual({ dimension: 'cm', weight: 'kg', accepted: { dimension: ['cm', 'mm', 'in'], weight: ['kg', 'g', 'lb'] } });
    expect(d.limits).toMatchObject({ titleMin: 3, titleMax: 200, descriptionMaxChars: 2000, brandMax: 80, codeMax: 64, hsnLengths: [4, 6, 8], customAttributes: { max: 20, nameMax: 60, valueMax: 250 } });
    expect(d.image).toMatchObject({ maxPerProduct: 20, minShortSidePx: 200, recommendedLongSidePx: 1000, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] });
    expect(d.image.maxBytes).toBeGreaterThan(0);
    // another business does not see this business's materials
    const o = await c.get('/api/v1/products/form-options', other);
    expect(o.body.data.materials.map((m: any) => m.value)).not.toContain('Hemp fibre');
    expect((await c.get('/api/v1/products/form-options')).status).toBe(401);
  });

  it('suggests standard categories from values already used (prefix first, then contains), tenant-scoped', async () => {
    for (const [i, sc] of ['Travel Bags', 'Travel Accessories', 'Backpacks', 'Travel Bags'].entries()) await draft({ title: `Std ${i}`, standardCategory: sc });
    await draft({ title: 'Other tenant', standardCategory: 'Travel Secret' }, other);
    const all = (await c.get('/api/v1/products/standard-categories', admin)).body.data;
    expect(all.map((x: any) => x.value)).toEqual(expect.arrayContaining(['Travel Bags', 'Travel Accessories', 'Backpacks']));
    expect(all.map((x: any) => x.value)).not.toContain('Travel Secret');
    expect(all.find((x: any) => x.value === 'Travel Bags').productCount).toBe(2);
    const q = (await c.get('/api/v1/products/standard-categories?q=travel', admin)).body.data;
    expect(q.map((x: any) => x.value)).toEqual(['Travel Bags', 'Travel Accessories']); // both prefix matches, most used first
    const contains = (await c.get('/api/v1/products/standard-categories?q=pack', admin)).body.data;
    expect(contains.map((x: any) => x.value)).toEqual(['Backpacks']);
    expect((await c.get('/api/v1/products/standard-categories?limit=1', admin)).body.data).toHaveLength(1);
    expect((await c.get('/api/v1/products/standard-categories?limit=51', admin)).status).toBe(400);
  });
});

describe('product fields: physical data, description, material, custom attributes (create / patch / get)', () => {
  it('stores dimensions and weight as mm / grams and returns display and canonical values', async () => {
    const r = await c.post('/api/v1/products', { productCode: 'PHYS-1', title: 'Physical one', dimensions: { length: 25.5, width: 10, height: 2.5, unit: 'cm' }, weight: { value: 1.25, unit: 'kg' }, material: 'Canvas', standardCategory: 'Bags' }, admin);
    expect(r.status, J(r)).toBe(201);
    expect(r.body.data).toMatchObject({
      dimensions: { length: 25.5, width: 10, height: 2.5, unit: 'cm' }, dimensionsMm: { length: 255, width: 100, height: 25 },
      weight: { value: 1.25, unit: 'kg' }, weightGrams: 1250, material: 'Canvas', standardCategory: 'Bags',
    });
    const inch = await c.post('/api/v1/products', { productCode: 'PHYS-2', title: 'Inches one', dimensions: { length: 1, width: 2, height: 3, unit: 'in' }, weight: { value: 1, unit: 'lb' } }, admin);
    expect(inch.body.data).toMatchObject({ dimensionsMm: { length: 25, width: 51, height: 76 }, weightGrams: 454, weight: { value: 0.454, unit: 'kg' } });
    const mm = await c.post('/api/v1/products', { productCode: 'PHYS-3', title: 'Millimetres', dimensions: { length: 255, width: 100, height: 25, unit: 'mm' }, weight: { value: 1250, unit: 'g' } }, admin);
    expect(mm.body.data).toMatchObject({ dimensions: { length: 25.5, width: 10, height: 2.5 }, weightGrams: 1250 });
    // reading back and re-saving what the API showed does not drift
    const back = (await c.get(`/api/v1/products/${r.body.data.id}`, admin)).body.data;
    const again = await c.patch(`/api/v1/products/${r.body.data.id}`, { dimensions: back.dimensions, weight: back.weight, version: back.version }, admin);
    expect(again.body.data).toMatchObject({ dimensionsMm: { length: 255, width: 100, height: 25 }, weightGrams: 1250 });
    // none set -> nulls and empty list; list items carry the fields too
    const plain = await c.post('/api/v1/products', { productCode: 'PHYS-4', title: 'No physical data' }, admin);
    expect(plain.body.data).toMatchObject({ dimensions: null, dimensionsMm: null, weight: null, weightGrams: null, material: null, standardCategory: null, customAttributes: [], descriptionHtml: null });
    const list = await c.get('/api/v1/products?q=PHYS-1', admin);
    expect(list.body.data[0]).toMatchObject({ weightGrams: 1250, dimensionsMm: { length: 255, width: 100, height: 25 } });
    // PATCH null clears both
    const cleared = await c.patch(`/api/v1/products/${r.body.data.id}`, { dimensions: null, weight: null, material: null }, admin);
    expect(cleared.body.data).toMatchObject({ dimensions: null, dimensionsMm: null, weight: null, weightGrams: null, material: null });
  });

  it('rejects bad physical data with field-level errors (boundary and one past it)', async () => {
    const post = (extra: Record<string, unknown>) => c.post('/api/v1/products', { productCode: `PV-${randomUUID().slice(0, 8)}`, title: 'Validation', ...extra }, admin);
    const issues = (r: any) => r.body.error.details.issues.map((i: any) => [i.path, i.code]);
    expect((await post({ dimensions: { length: 10_000, width: 10_000, height: 10_000, unit: 'cm' } })).status).toBe(201); // 100,000 mm each
    const over = await post({ dimensions: { length: 10_000.05, width: 1, height: 1, unit: 'cm' } });
    expect(over.status).toBe(400);
    expect(issues(over)).toEqual([['dimensions.length', 'too_large']]);
    expect(issues(await post({ dimensions: { length: 0, width: -1, height: 0.04, unit: 'cm' } }))).toEqual([['dimensions.length', 'not_positive'], ['dimensions.width', 'not_positive'], ['dimensions.height', 'too_small']]);
    expect((await post({ dimensions: { length: 1, width: 1 } })).status).toBe(400); // all three or none
    expect((await post({ dimensions: { length: 1, width: 1, height: 1, unit: 'yd' } })).status).toBe(400);
    expect((await post({ weight: { value: 10_000, unit: 'kg' } })).status).toBe(201);
    expect(issues(await post({ weight: { value: 10_000.001, unit: 'kg' } }))).toEqual([['weight.value', 'too_large']]);
    expect(issues(await post({ weight: { value: 0.0004, unit: 'kg' } }))).toEqual([['weight.value', 'too_small']]);
    expect((await post({ weight: { value: 0, unit: 'g' } })).status).toBe(400);
    expect((await post({ weight: { value: 'heavy', unit: 'g' } })).status).toBe(400);
    expect((await post({ weight: { value: 5, unit: 'oz' } })).status).toBe(400);
  });

  it('validates the field limits at the boundary and one past it', async () => {
    const post = (extra: Record<string, unknown>) => c.post('/api/v1/products', { productCode: `LIM-${randomUUID().slice(0, 8)}`, title: 'Limits', ...extra }, admin);
    const bad = async (extra: Record<string, unknown>, path: string) => {
      const r = await post(extra);
      expect(r.status, JSON.stringify(extra).slice(0, 80)).toBe(400);
      expect(r.body.error.details.issues.map((i: any) => i.path), J(r)).toContain(path);
    };
    expect((await post({ title: 'x'.repeat(200) })).status).toBe(201);
    await bad({ title: 'x'.repeat(201) }, 'title');
    await bad({ title: 'ab' }, 'title');
    expect((await post({ brand: 'b'.repeat(80) })).status).toBe(201);
    await bad({ brand: 'b'.repeat(81) }, 'brand');
    expect((await post({ material: 'm'.repeat(80) })).status).toBe(201);
    await bad({ material: 'm'.repeat(81) }, 'material');
    expect((await post({ standardCategory: 's'.repeat(120) })).status).toBe(201);
    await bad({ standardCategory: 's'.repeat(121) }, 'standardCategory');
    expect((await c.post('/api/v1/products', { productCode: 'C'.repeat(64), title: 'Code limit' }, admin)).status).toBe(201);
    expect((await c.post('/api/v1/products', { productCode: 'C'.repeat(65), title: 'Code limit' }, admin)).status).toBe(400);
    for (const h of ['1234', '123456', '12345678']) expect((await post({ hsnCode: h })).status, h).toBe(201);
    for (const h of ['123', '12345', '1234567', '123456789', 'abcd']) await bad({ hsnCode: h }, 'hsnCode');
    for (const g of [0, 1800, 2800]) expect((await post({ gstRateBps: g })).status, String(g)).toBe(201);
    for (const g of [-1, 2801, 18.5]) await bad({ gstRateBps: g }, 'gstRateBps');
    expect((await post({ countryOfOrigin: 'in' })).body.data.countryOfOrigin).toBe('IN');
    await bad({ countryOfOrigin: 'ZZ' }, 'countryOfOrigin');
    await bad({ countryOfOrigin: 'India' }, 'countryOfOrigin');
    const attrs = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `attr ${i}`, value: 'v' }));
    expect((await post({ customAttributes: attrs(20) })).status).toBe(201);
    await bad({ customAttributes: attrs(21) }, 'customAttributes');
    expect((await post({ customAttributes: [{ name: 'n'.repeat(60), value: 'v'.repeat(250) }] })).status).toBe(201);
    await bad({ customAttributes: [{ name: 'n'.repeat(61), value: 'v' }] }, 'customAttributes[0].name');
    await bad({ customAttributes: [{ name: 'n', value: 'v'.repeat(251) }] }, 'customAttributes[0].value');
    await bad({ customAttributes: [{ name: 'Colour', value: 'a' }, { name: 'colour ', value: 'b' }] }, 'customAttributes[1].name');
    await bad({ customAttributes: [{ name: '', value: 'x' }] }, 'customAttributes[0].name');
  });

  it('description: stores html + plain text, 2,000 code points max with the counted length', async () => {
    const ok = await c.post('/api/v1/products', { productCode: 'DESC-1', title: 'Rich description', descriptionHtml: '<p>Hello <b>world</b></p><ul><li>One</li><li>Two</li></ul><script>x</script>' }, admin);
    expect(ok.status, J(ok)).toBe(201);
    expect(ok.body.data.descriptionHtml).toBe('<p>Hello <strong>world</strong></p><ul><li>One</li><li>Two</li></ul>');
    expect(ok.body.data.description).toBe('Hello world\n\n- One\n- Two');
    const plain = await c.post('/api/v1/products', { productCode: 'DESC-2', title: 'Plain description', description: 'Line one\nLine two' }, admin);
    expect(plain.body.data).toMatchObject({ description: 'Line one\nLine two', descriptionHtml: '<p>Line one<br>Line two</p>' });
    const at = await c.post('/api/v1/products', { productCode: 'DESC-3', title: 'Exactly 2000', description: 'a'.repeat(2000) }, admin);
    expect(at.status).toBe(201);
    const emoji = await c.post('/api/v1/products', { productCode: 'DESC-4', title: 'Emoji 2000', description: cc(0x1f600).repeat(2000) }, admin);
    expect(emoji.status, 'code points, not UTF-16 units').toBe(201);
    const over = await c.post('/api/v1/products', { productCode: 'DESC-5', title: 'Over 2000', description: 'a'.repeat(2001) }, admin);
    expect(over.status).toBe(400);
    expect(over.body.error.details).toMatchObject({ rule: 'description_too_long', length: 2001, max: 2000 });
    expect(over.body.error.details.issues[0]).toMatchObject({ path: 'description', code: 'description_too_long', length: 2001 });
    const overHtml = await c.post('/api/v1/products', { productCode: 'DESC-6', title: 'Over html', descriptionHtml: `<p>${'b'.repeat(2001)}</p>` }, admin);
    expect(overHtml.body.error.details).toMatchObject({ rule: 'description_too_long', length: 2001 });
    // patch: plain wins when only it is sent; html wins when both are; null clears both
    const id = ok.body.data.id;
    const p1 = await c.patch(`/api/v1/products/${id}`, { description: 'New plain' }, admin);
    expect(p1.body.data).toMatchObject({ description: 'New plain', descriptionHtml: '<p>New plain</p>' });
    const p2 = await c.patch(`/api/v1/products/${id}`, { description: 'ignored', descriptionHtml: '<p>html wins</p>' }, admin);
    expect(p2.body.data).toMatchObject({ description: 'html wins', descriptionHtml: '<p>html wins</p>' });
    const p3 = await c.patch(`/api/v1/products/${id}`, { description: null }, admin);
    expect(p3.body.data).toMatchObject({ description: null, descriptionHtml: null });
    // hostile markup never reaches the output
    const evil = await c.post('/api/v1/products', { productCode: 'DESC-7', title: 'Evil', descriptionHtml: '<a href="javascript:alert(1)" onclick="x()">click</a><img src=x onerror=alert(1)><iframe src="//e.test"></iframe>' }, admin);
    expect(evil.body.data.descriptionHtml).toBe('<p>click</p>');
  });

  it('custom attributes: replaced as a whole, unchanged confirmed facts stay confirmed', async () => {
    const r = await c.post('/api/v1/products', { productCode: 'CA-1', title: 'Custom attrs', customAttributes: [{ name: 'Collection', value: 'Summer 2026' }, { name: 'Fabric', value: 'Cotton', confirmed: true }] }, admin);
    expect(r.body.data.customAttributes).toEqual([{ name: 'Collection', value: 'Summer 2026', confirmed: false }, { name: 'Fabric', value: 'Cotton', confirmed: true }]);
    const id = r.body.data.id;
    const next = await c.patch(`/api/v1/products/${id}`, { customAttributes: [{ name: 'fabric', value: 'Cotton' }, { name: 'Fit', value: 'Slim' }] }, admin);
    expect(next.body.data.customAttributes).toEqual([{ name: 'fabric', value: 'Cotton', confirmed: true }, { name: 'Fit', value: 'Slim', confirmed: false }]);
    expect((await c.patch(`/api/v1/products/${id}`, { customAttributes: null }, admin)).body.data.customAttributes).toEqual([]);
  });

  it('variants inherit the product dimensions and weight in the response', async () => {
    const p = await c.post('/api/v1/products', { productCode: 'INH-1', title: 'Inheritance', dimensions: { length: 30, width: 20, height: 10, unit: 'cm' }, weight: { value: 2, unit: 'kg' } }, admin);
    const id = p.body.data.id;
    const bare = (await c.post(`/api/v1/products/${id}/variants`, { sku: 'INH-1-A' }, admin)).body.data;
    expect(bare).toMatchObject({ dimensionsMm: null, weightGrams: null, effectiveDimensionsMm: { length: 300, width: 200, height: 100 }, effectiveWeightGrams: 2000 });
    const own = (await c.post(`/api/v1/products/${id}/variants`, { sku: 'INH-1-B', weightGrams: 500, dimensionsMm: { length: 5, width: 5, height: 5 } }, admin)).body.data;
    expect(own).toMatchObject({ weightGrams: 500, effectiveWeightGrams: 500, effectiveDimensionsMm: { length: 5, width: 5, height: 5 } });
    const detail = (await c.get(`/api/v1/products/${id}`, admin)).body.data;
    expect(detail.variants.map((v: any) => v.effectiveWeightGrams).sort()).toEqual([2000, 500]);
    expect((await c.get(`/api/v1/products/${id}/variants`, admin)).body.data.map((v: any) => v.effectiveWeightGrams).sort()).toEqual([2000, 500]);
    expect((await c.get(`/api/v1/variants/${bare.id}`, admin)).body.data.effectiveWeightGrams).toBe(2000);
    expect((await c.get(`/api/v1/variants?sku=INH-1-A`, admin)).body.data[0].effectiveWeightGrams).toBe(2000);
    const up = await c.patch(`/api/v1/variants/${bare.id}`, { weightGrams: 750 }, admin);
    expect(up.body.data).toMatchObject({ weightGrams: 750, effectiveWeightGrams: 750, effectiveDimensionsMm: { length: 300, width: 200, height: 100 } });
    // changing the product weight is visible through the inheriting variant
    await c.patch(`/api/v1/products/${id}`, { weight: { value: 3, unit: 'kg' } }, admin);
    expect((await c.get(`/api/v1/variants/${own.id}`, admin)).body.data.effectiveWeightGrams).toBe(500);
  });

  it('stays backward compatible: the old create / patch bodies and responses still work', async () => {
    const r = await c.post('/api/v1/products', { productCode: 'OLD-1', title: 'Old style', brand: 'Acme', description: 'Plain text', tags: ['a'], hsnCode: '6109', gstRateBps: 1200, countryOfOrigin: 'IN' }, admin);
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({ productCode: 'OLD-1', brand: 'Acme', description: 'Plain text', tags: ['a'], status: 'draft', version: 1, variantCount: 0, productType: 'physical' });
    const u = await c.patch(`/api/v1/products/${r.body.data.id}`, { title: 'Old style renamed', version: 1 }, admin);
    expect(u.body.data).toMatchObject({ title: 'Old style renamed', version: 2, brand: 'Acme', tags: ['a'] });
    expect((await c.patch(`/api/v1/products/${r.body.data.id}`, { title: 'again', version: 1 }, admin)).status).toBe(409);
  });

  it('whitespace in names is collapsed and the placeholder code pattern is reserved', async () => {
    const r = await c.post('/api/v1/products', { productCode: 'WS-1', title: '  Spaced    out   name ' }, admin);
    expect(r.body.data.title).toBe('Spaced out name');
    for (const code of ['DRAFT-ABCD1234', 'draft-abcd1234']) {
      const bad = await c.post('/api/v1/products', { productCode: code, title: 'Reserved code' }, admin);
      expect(bad.status).toBe(400);
      expect(bad.body.error.details.issues[0]).toMatchObject({ path: 'productCode', code: 'placeholder_code' });
    }
    const patchBad = await c.patch(`/api/v1/products/${r.body.data.id}`, { productCode: 'DRAFT-ABCD1234' }, admin);
    expect(patchBad.status).toBe(400);
  });
});

describe('master code uniqueness', () => {
  it('is unique per business ignoring case; other businesses are independent', async () => {
    expect((await c.post('/api/v1/products', { productCode: 'Case-1', title: 'First' }, admin)).status).toBe(201);
    const dup = await c.post('/api/v1/products', { productCode: 'CASE-1', title: 'Second' }, admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'CONFLICT', details: { rule: 'duplicate_product_code', field: 'productCode', conflict: { type: 'product', code: 'Case-1', title: 'First' } } });
    expect((await c.post('/api/v1/products', { productCode: 'case-1', title: 'Third' }, admin)).status).toBe(409);
    expect((await c.post('/api/v1/products', { productCode: 'CASE-1', title: 'Other tenant' }, other)).status).toBe(201);
    // PATCH to a taken code (different case) is a clean 409 too
    const mine = (await c.post('/api/v1/products', { productCode: 'MINE-1', title: 'Mine' }, admin)).body.data;
    const p = await c.patch(`/api/v1/products/${mine.id}`, { productCode: 'cAsE-1' }, admin);
    expect(p.status).toBe(409);
    expect(p.body.error.details).toMatchObject({ rule: 'duplicate_product_code', conflict: { code: 'Case-1' } });
    // the product's own code in a different case is fine
    expect((await c.patch(`/api/v1/products/${mine.id}`, { productCode: 'mine-1' }, admin)).status).toBe(200);
  });

  it('two parallel creates of the same code: exactly one 201 and one 409', async () => {
    const results = await Promise.all(['RACE-CODE', 'race-code', 'Race-Code'].map((code, i) => c.post('/api/v1/products/drafts', { title: `Racer ${i}`, productCode: code }, admin)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    const loser = results.find((r) => r.status === 409)!;
    expect(loser.body.error.details).toMatchObject({ rule: 'duplicate_product_code', field: 'productCode' });
    const plain = await Promise.all([1, 2].map((i) => c.post('/api/v1/products', { productCode: 'RACE-PLAIN', title: `Plain racer ${i}` }, admin)));
    expect(plain.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('two parallel patches to the same code: exactly one 200 and one 409', async () => {
    const a = (await draft({ title: 'Patch racer A' })).product;
    const b = (await draft({ title: 'Patch racer B' })).product;
    const res = await Promise.all([a, b].map((p) => c.patch(`/api/v1/products/${p.id}/draft`, { productCode: 'PATCH-RACE', version: p.version }, admin)));
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    const res2 = await Promise.all([a, b].map((p, i) => c.patch(`/api/v1/products/${p.id}`, { productCode: `PATCH-RACE-${i}`, version: 99 }, admin)));
    expect(res2.map((r) => r.status)).toEqual([409, 409]); // wrong version: VERSION_CONFLICT
  });

  it('two parallel patches with the same version: exactly one wins, the other gets VERSION_CONFLICT', async () => {
    const d = (await draft({ title: 'Version racer' })).product;
    const res = await Promise.all(['one', 'two'].map((s) => c.patch(`/api/v1/products/${d.id}/draft`, { title: `Version racer ${s}`, version: d.version }, admin)));
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: d.version + 1 } });
  });
});

describe('SKU check and verify', () => {
  it('reports availability, conflicts (any case), similar variant SKUs and a suggestion', async () => {
    const owner1 = (await c.post('/api/v1/products', { productCode: 'SKU-Taken', title: 'Taken product', variants: [{ sku: 'SKU-Variant-1' }] }, admin)).body.data;
    await c.post('/api/v1/products', { productCode: 'SKU-Taken-2', title: 'Taken two' }, admin);
    await c.post('/api/v1/products', { productCode: 'sku-taken-3', title: 'Taken three' }, admin);
    const free = (await c.get('/api/v1/products/sku-check?code=SKU-FREE-1', admin)).body.data;
    expect(free).toEqual({ code: 'SKU-FREE-1', normalized: 'SKU-FREE-1', valid: true, reason: null, message: null, available: true, conflict: null, similar: [], suggestion: null });
    const taken = (await c.get('/api/v1/products/sku-check?code=sku-taken', admin)).body.data;
    expect(taken).toMatchObject({ valid: true, available: false, conflict: { type: 'product', id: owner1.id, title: 'Taken product', code: 'SKU-Taken' }, suggestion: 'sku-taken-4' });
    // excluding the product itself makes its own code available
    const own = (await c.get(`/api/v1/products/sku-check?code=SKU-TAKEN&excludeProductId=${owner1.id}`, admin)).body.data;
    expect(own).toMatchObject({ available: true, conflict: null, suggestion: null });
    // a variant SKU is only a warning
    const sim = (await c.get('/api/v1/products/sku-check?code=sku-variant-1', admin)).body.data;
    expect(sim).toMatchObject({ available: true, conflict: null, similar: [{ type: 'variant', sku: 'SKU-Variant-1', productId: owner1.id }] });
    expect((await c.get(`/api/v1/products/sku-check?code=sku-variant-1&excludeProductId=${owner1.id}`, admin)).body.data.similar).toEqual([]); // the product's own variants are not "similar"
    // invalid codes
    const inv = async (code: string) => (await c.get(`/api/v1/products/sku-check?code=${encodeURIComponent(code)}`, admin)).body.data;
    expect(await inv('bad code')).toMatchObject({ valid: false, reason: 'invalid_characters', available: false, conflict: null, suggestion: null });
    expect(await inv('DRAFT-ABCD1234')).toMatchObject({ valid: false, reason: 'placeholder', available: false });
    expect(await inv('X'.repeat(65))).toMatchObject({ valid: false, reason: 'too_long' });
    expect(await inv('')).toMatchObject({ valid: false, reason: 'empty' });
    expect(await inv('  padded-1  ')).toMatchObject({ valid: true, normalized: 'padded-1', available: true });
    // tenant isolation: the other business's codes are invisible
    expect((await c.get('/api/v1/products/sku-check?code=SKU-TAKEN', other)).body.data).toMatchObject({ available: true, conflict: null });
    expect((await c.get('/api/v1/products/sku-check?code=SKU-TAKEN', viewer)).status).toBe(200);
    expect((await c.get('/api/v1/products/sku-check?code=x&excludeProductId=nope', admin)).status).toBe(400);
  });

  it('suggests the next free code and keeps it within 64 characters', async () => {
    for (const code of ['NEXT', 'NEXT-2', 'NEXT-4']) expect((await c.post('/api/v1/products', { productCode: code, title: `Next ${code}` }, admin)).status).toBe(201);
    expect((await c.get('/api/v1/products/sku-check?code=NEXT', admin)).body.data.suggestion).toBe('NEXT-3');
    const long = 'L'.repeat(64);
    await c.post('/api/v1/products', { productCode: long, title: 'long' }, admin);
    const s = (await c.get(`/api/v1/products/sku-check?code=${long}`, admin)).body.data.suggestion as string;
    expect(s).toBe(`${'L'.repeat(62)}-2`);
    expect(s.length).toBe(64);
  });

  it('verify records the checked code; readiness turns verify into done; duplicates are refused', async () => {
    const d = (await draft({ title: 'Verify me', productCode: 'VERIFY-1' })).product;
    expect(item(await readinessOf(d.id), 'master_sku')).toMatchObject({ state: 'verify', tag: 'Verify' });
    const v = await c.post(`/api/v1/products/${d.id}/sku/verify`, { code: 'VERIFY-1' }, admin);
    expect(v.status, J(v)).toBe(200);
    expect(v.body.data).toMatchObject({ code: 'VERIFY-1', available: true, verified: true });
    expect(item(await readinessOf(d.id), 'master_sku').state).toBe('done');
    // changing the code makes it "verify" again until the new code is verified
    const p = await c.patch(`/api/v1/products/${d.id}/draft`, { productCode: 'VERIFY-2', version: d.version }, admin);
    expect(item(p.body.data.readiness, 'master_sku').state).toBe('verify');
    // a code verified BEFORE saving counts once the product has it
    expect((await c.post(`/api/v1/products/${d.id}/sku/verify`, { code: 'VERIFY-3' }, admin)).status).toBe(200);
    expect(item(await readinessOf(d.id), 'master_sku').state).toBe('verify'); // saved code is still VERIFY-2
    const p3 = await c.patch(`/api/v1/products/${d.id}/draft`, { productCode: 'VERIFY-3', version: p.body.data.creation.version }, admin);
    expect(item(p3.body.data.readiness, 'master_sku').state).toBe('done');
    // duplicates and invalid codes
    const other1 = (await draft({ title: 'Other holder', productCode: 'HOLDER-1' })).product;
    const dup = await c.post(`/api/v1/products/${d.id}/sku/verify`, { code: 'holder-1' }, admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'duplicate_product_code', conflict: { id: other1.id } });
    expect((await c.post(`/api/v1/products/${d.id}/sku/verify`, { code: 'bad code' }, admin)).status).toBe(400);
    expect((await c.post(`/api/v1/products/${d.id}/sku/verify`, { code: 'FREE-AGAIN' }, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/products/${d.id}/sku/verify`, { code: 'FREE-AGAIN' }, other)).status).toBe(404);
  });
});

describe('brands', () => {
  it('lifecycle: create (confirmed), duplicate 409, confirm, in-use delete 409, delete', async () => {
    const created = await c.post('/api/v1/brands', { name: '  Urban   Carry ' }, admin);
    expect(created.status, J(created)).toBe(201);
    expect(created.body.data).toMatchObject({ name: 'Urban Carry', confirmed: true, productCount: 0 });
    expect(created.body.data.confirmedAt).toBeTruthy();
    const dup = await c.post('/api/v1/brands', { name: 'URBAN carry' }, admin);
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ rule: 'duplicate_brand', existing: { id: created.body.data.id, name: 'Urban Carry', confirmed: true } });
    expect((await c.post('/api/v1/brands', { name: '   ' }, admin)).status).toBe(400);
    expect((await c.post('/api/v1/brands', { name: 'x'.repeat(81) }, admin)).status).toBe(400);
    expect((await c.post('/api/v1/brands', { name: 'y'.repeat(80) }, admin)).status).toBe(201);
    expect((await c.post('/api/v1/brands', { name: 'Urban Carry' }, other)).status).toBe(201); // per business

    // a product save adds the brand unconfirmed; the canonical spelling of an existing brand wins
    const p = await c.post('/api/v1/products', { productCode: 'BR-1', title: 'Brand product', brand: 'URBAN CARRY' }, admin);
    expect(p.body.data.brand).toBe('Urban Carry');
    const fresh = await c.post('/api/v1/products', { productCode: 'BR-2', title: 'Fresh brand', brand: '  Nordic   Pack ' }, admin);
    expect(fresh.body.data.brand).toBe('Nordic Pack');
    const nordic = (await c.get('/api/v1/brands?q=nordic', admin)).body.data[0];
    expect(nordic).toMatchObject({ name: 'Nordic Pack', confirmed: false, confirmedAt: null, productCount: 1 });
    const second = await c.post('/api/v1/products', { productCode: 'BR-3', title: 'Second', brand: 'nordic pack' }, admin);
    expect(second.body.data.brand).toBe('Nordic Pack'); // spelling of the stored brand wins even if unconfirmed
    expect((await c.get('/api/v1/brands?q=nordic', admin)).body.data).toHaveLength(1);

    // list order: confirmed first, then alphabetical; filter by confirmed
    const names = (await c.get('/api/v1/brands', admin)).body.data.map((b: any) => [b.name, b.confirmed]);
    const firstUnconfirmed = names.findIndex((n: any) => !n[1]);
    expect(names.slice(0, firstUnconfirmed).every((n: any) => n[1])).toBe(true);
    expect(names.slice(0, firstUnconfirmed).map((n: any) => n[0])).toEqual([...names.slice(0, firstUnconfirmed).map((n: any) => n[0])].sort((a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase())));
    expect((await c.get('/api/v1/brands?confirmed=false', admin)).body.data.every((b: any) => !b.confirmed)).toBe(true);
    expect((await c.get('/api/v1/brands?confirmed=true', admin)).body.data.every((b: any) => b.confirmed)).toBe(true);
    expect((await c.get('/api/v1/brands?limit=1', admin)).body.data).toHaveLength(1);
    expect((await c.get('/api/v1/brands', other)).body.data.map((b: any) => b.name)).toEqual(['Urban Carry']);

    // confirm: idempotent, tenant-scoped, readiness turns "confirm" into done
    const draftWithBrand = await draft({ title: 'Brand readiness', brand: 'Nordic Pack' });
    expect(item(draftWithBrand.readiness, 'brand')).toMatchObject({ state: 'confirm', tag: 'Confirm' });
    const confirm = await c.post(`/api/v1/brands/${nordic.id}/confirm`, {}, admin);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data).toMatchObject({ confirmed: true });
    const again = await c.post(`/api/v1/brands/${nordic.id}/confirm`, {}, staff);
    expect(again.body.data.confirmedAt).toBe(confirm.body.data.confirmedAt);
    expect(item(await readinessOf(draftWithBrand.product.id), 'brand')).toMatchObject({ state: 'done' });
    expect((await c.post(`/api/v1/brands/${nordic.id}/confirm`, {}, other)).status).toBe(404);
    expect((await c.post(`/api/v1/brands/${nordic.id}/confirm`, {}, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/brands/${randomUUID()}/confirm`, {}, admin)).status).toBe(404);

    // delete: blocked while a live product uses it, allowed once none does
    const blocked = await c.del(`/api/v1/brands/${nordic.id}`, admin);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details).toMatchObject({ rule: 'in_use', productCount: 3 });
    expect((await c.del(`/api/v1/brands/${nordic.id}`, other)).status).toBe(404);
    expect((await c.del(`/api/v1/brands/${nordic.id}`, viewer)).status).toBe(403);
    const users = (await c.get('/api/v1/products?filter[brand]=Nordic Pack', admin)).body.data as any[];
    expect(users).toHaveLength(3);
    for (const u of users) await c.patch(`/api/v1/products/${u.id}`, { brand: null }, admin);
    expect((await c.del(`/api/v1/brands/${nordic.id}`, admin)).status).toBe(200);
    expect((await c.get('/api/v1/brands?q=nordic', admin)).body.data).toEqual([]);
    expect((await c.del(`/api/v1/brands/${nordic.id}`, admin)).status).toBe(404);

    // audit + outbox
    const audit = await owner(`select action from audit_logs where vendor_id = $1 and action like 'brand.%' order by id`, [admin.vendorId]);
    expect(audit.rows.map((r: any) => r.action)).toEqual(expect.arrayContaining(['brand.created', 'brand.confirmed', 'brand.deleted']));
    const types = (await t.outbox()).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['brand.created', 'brand.confirmed', 'brand.deleted']));
  });

  it('a concurrent save of the same new brand creates exactly one brand', async () => {
    const res = await Promise.all([1, 2, 3].map((i) => c.post('/api/v1/products', { productCode: `BRACE-${i}`, title: `Brand race ${i}`, brand: i === 2 ? 'RACE   BRAND' : 'Race Brand' }, admin)));
    expect(res.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(new Set(res.map((r) => r.body.data.brand)).size).toBe(1);
    expect((await c.get('/api/v1/brands?q=race brand', admin)).body.data).toHaveLength(1);
  });

  it('works with draft saves and keeps products.brand in sync', async () => {
    const d = await draft({ title: 'Draft brand', brand: 'Kaveri Crafts' });
    expect(d.product).toMatchObject({ brand: 'Kaveri Crafts', brandRecord: { name: 'Kaveri Crafts', confirmed: false } });
    const patched = await c.patch(`/api/v1/products/${d.product.id}/draft`, { brand: 'KAVERI  crafts', version: d.creation.version }, admin);
    expect(patched.body.data.product.brand).toBe('Kaveri Crafts');
    const cleared = await c.patch(`/api/v1/products/${d.product.id}/draft`, { brand: null, version: patched.body.data.creation.version }, admin);
    expect(cleared.body.data.product).toMatchObject({ brand: null, brandRecord: null });
    expect(item(cleared.body.data.readiness, 'brand').state).toBe('pending');
  });
});

describe('drafts', () => {
  it('creates a draft from a title only with a generated placeholder code', async () => {
    const r = await c.post('/api/v1/products/drafts', { title: 'Just a title' }, admin);
    expect(r.status, J(r)).toBe(201);
    expect(r.headers.location).toBe(`/api/v1/products/${r.body.data.product.id}/creation`);
    const d = r.body.data;
    expect(d.product.productCode).toMatch(/^DRAFT-[A-Z0-9]{8}$/);
    expect(d.product).toMatchObject({ title: 'Just a title', status: 'draft', productType: 'physical', version: 1, variantCount: 0, category: null, brandRecord: null, primaryImage: { state: 'none', documentId: null, url: null } });
    expect(d.creation).toMatchObject({ currentStep: 'basic', completedSteps: [], version: 1, codeIsPlaceholder: true });
    expect(new Date(d.creation.savedAt).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(item(d.readiness, 'master_sku').state).toBe('pending');
    expect(d.readiness.percent).toBe(25); // name + type of 8 = 2 -> 25
    expect(d.readiness.blockers.map((b: any) => b.key)).toEqual(['category', 'primary_image', 'master_sku']);
    const two = await draft({ title: 'Another title' });
    expect(two.product.productCode).not.toBe(d.product.productCode);
    // it is a real product: visible in GET /products and counted
    expect((await c.get(`/api/v1/products/${d.product.id}`, admin)).body.data).toMatchObject({ status: 'draft', productCode: d.product.productCode });
  });

  it('creates a draft with every optional field and the same rules as a normal save', async () => {
    const cat = await category('Travel Accessories');
    const d = await draft({
      title: 'Premium Travel Bag', productCode: 'TRV-1042', productType: 'physical', categoryId: cat, brand: 'Full Draft Brand', description: 'Roomy and light.', countryOfOrigin: 'in',
      dimensions: { length: 50, width: 30, height: 25, unit: 'cm' }, weight: { value: 1.2, unit: 'kg' }, material: 'Canvas', standardCategory: 'Luggage', gstRateBps: 1800, hsnCode: '4202',
      customAttributes: [{ name: 'Collection', value: 'Summer' }], tags: ['bag'],
    });
    expect(d.product).toMatchObject({
      productCode: 'TRV-1042', categoryId: cat, category: { id: cat, name: 'Travel Accessories' }, brand: 'Full Draft Brand', description: 'Roomy and light.', descriptionHtml: '<p>Roomy and light.</p>', countryOfOrigin: 'IN',
      dimensionsMm: { length: 500, width: 300, height: 250 }, weightGrams: 1200, material: 'Canvas', standardCategory: 'Luggage', gstRateBps: 1800, hsnCode: '4202', tags: ['bag'],
      customAttributes: [{ name: 'Collection', value: 'Summer', confirmed: false }],
    });
    expect(d.creation.codeIsPlaceholder).toBe(false);
    expect(item(d.readiness, 'master_sku').state).toBe('verify');
    expect(item(d.readiness, 'attributes').state).toBe('done');
    expect(item(d.readiness, 'description').state).toBe('done');
    expect(d.readiness.percent).toBe(63); // name, category, type, description, attributes = 5 of 8
    // validation
    const bad = async (body: Record<string, unknown>, status = 400) => expect((await c.post('/api/v1/products/drafts', body, admin)).status, J({ body })).toBe(status);
    await bad({});
    await bad({ title: '' });
    await bad({ title: 'x'.repeat(201) });
    await bad({ title: 'ok', productCode: 'bad code' });
    await bad({ title: 'ok', productCode: 'DRAFT-ABCD1234' });
    await bad({ title: 'ok', categoryId: randomUUID() }, 404);
    await bad({ title: 'ok', description: 'a'.repeat(2001) });
    await bad({ title: 'ok', weight: { value: -1, unit: 'kg' } });
    await bad({ title: 'ok', productCode: 'TRV-1042' }, 409);
    await bad({ title: 'ok', productCode: 'trv-1042' }, 409);
    expect((await c.post('/api/v1/products/drafts', { title: 'a' }, admin)).status).toBe(201); // 1 character is a valid draft title
    expect((await c.post('/api/v1/products/drafts', { title: 'x'.repeat(200) }, admin)).status).toBe(201);
  });

  it('autosaves with a required optimistic version and returns the new version and savedAt', async () => {
    const d = await draft({ title: 'Autosave me' });
    expect((await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'No version' }, admin)).status).toBe(400); // version required
    const first = await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'Autosave me v2', material: 'Linen', version: d.creation.version }, admin);
    expect(first.status, J(first)).toBe(200);
    expect(first.body.data.product).toMatchObject({ title: 'Autosave me v2', material: 'Linen' });
    expect(first.body.data.creation.version).toBe(d.creation.version + 1);
    expect(new Date(first.body.data.creation.savedAt).getTime()).toBeGreaterThanOrEqual(new Date(d.creation.savedAt).getTime());
    const stale = await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'stale', version: d.creation.version }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: first.body.data.creation.version } });
    // partial: untouched fields survive
    const second = await c.patch(`/api/v1/products/${d.product.id}/draft`, { brand: 'Tiny', version: first.body.data.creation.version }, admin);
    expect(second.body.data.product).toMatchObject({ title: 'Autosave me v2', material: 'Linen', brand: 'Tiny' });
    // incomplete input is fine for a draft: 1-character title, no category
    const tiny = await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'x', version: second.body.data.creation.version }, admin);
    expect(tiny.status).toBe(200);
    expect(item(tiny.body.data.readiness, 'product_name').state).toBe('pending');
    // rules still apply
    const badHsn = await c.patch(`/api/v1/products/${d.product.id}/draft`, { hsnCode: '12345', version: tiny.body.data.creation.version }, admin);
    expect(badHsn.status).toBe(400);
    expect((await c.patch(`/api/v1/products/${d.product.id}/draft`, { description: 'a'.repeat(2001), version: tiny.body.data.creation.version }, admin)).body.error.details.rule).toBe('description_too_long');
    // permissions and tenancy
    expect((await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'viewer', version: 1 }, viewer)).status).toBe(403);
    expect((await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'rival', version: 1 }, other)).status).toBe(404);
    expect((await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'staff ok', version: tiny.body.data.creation.version }, staff)).status).toBe(200);
  });

  it('a draft code can be cleared (placeholder returns), replaced, and a real code survives other saves', async () => {
    const d = await draft({ title: 'Code juggler', productCode: 'JUGGLE-1' });
    expect(d.creation.codeIsPlaceholder).toBe(false);
    const cleared = await c.patch(`/api/v1/products/${d.product.id}/draft`, { productCode: '', version: d.creation.version }, admin);
    expect(cleared.status, J(cleared)).toBe(200);
    expect(cleared.body.data.product.productCode).toMatch(/^DRAFT-[A-Z0-9]{8}$/);
    expect(cleared.body.data.creation.codeIsPlaceholder).toBe(true);
    const keep = await c.patch(`/api/v1/products/${d.product.id}/draft`, { productCode: cleared.body.data.product.productCode, title: 'Code juggler 2', version: cleared.body.data.creation.version }, admin);
    expect(keep.status, 'sending the generated code back is allowed').toBe(200);
    expect(keep.body.data.creation.codeIsPlaceholder).toBe(true);
    const nul = await c.patch(`/api/v1/products/${d.product.id}/draft`, { productCode: null, version: keep.body.data.creation.version }, admin);
    expect(nul.body.data.product.productCode).toBe(cleared.body.data.product.productCode); // already a placeholder: unchanged
    const real = await c.patch(`/api/v1/products/${d.product.id}/draft`, { productCode: 'JUGGLE-2', version: nul.body.data.creation.version }, admin);
    expect(real.body.data).toMatchObject({ product: { productCode: 'JUGGLE-2' }, creation: { codeIsPlaceholder: false } });
    const other2 = await c.patch(`/api/v1/products/${d.product.id}/draft`, { productCode: 'DRAFT-QWERTY12', version: real.body.data.creation.version }, admin);
    expect(other2.status).toBe(400); // a user cannot pick the reserved pattern
    expect((await c.patch(`/api/v1/products/${d.product.id}/draft`, { title: 'still real', version: real.body.data.creation.version }, admin)).body.data.product.productCode).toBe('JUGGLE-2');
  });

  it('only drafts can be saved through the draft endpoints', async () => {
    const active = await c.makeVariant(admin, { status: 'active' });
    const p = (await c.get(`/api/v1/products/${active.productId}`, admin)).body.data;
    const r = await c.patch(`/api/v1/products/${active.productId}/draft`, { title: 'nope', version: p.version }, admin);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: 'CONFLICT', details: { rule: 'not_a_draft', status: 'active' } });
    const del = await c.del(`/api/v1/products/${active.productId}/draft`, admin);
    expect(del.status).toBe(409);
    expect(del.body.error.details.rule).toBe('not_a_draft');
    // the creation view still works for any product
    expect((await c.get(`/api/v1/products/${active.productId}/creation`, admin)).status).toBe(200);
  });

  it('GET /products/{id}/creation returns the editor view; unknown / other tenant ids are 404', async () => {
    const d = await draft({ title: 'View me', productCode: 'VIEW-1' });
    const r = await c.get(`/api/v1/products/${d.product.id}/creation`, viewer);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual(expect.objectContaining({ product: expect.objectContaining({ id: d.product.id }), creation: expect.any(Object), readiness: expect.any(Object) }));
    expect((await c.get(`/api/v1/products/${d.product.id}/creation`, other)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${randomUUID()}/creation`, admin)).status).toBe(404);
    expect((await c.get(`/api/v1/products/not-a-uuid/creation`, admin)).status).toBe(400);
    expect((await c.get(`/api/v1/products/${d.product.id}/creation`)).status).toBe(401);
  });

  it('lists drafts: paged, newest save first, searchable, tenant-scoped, with readiness and thumbnail', async () => {
    const vendor = (await c.registerVendor({ businessName: 'Draft Lister' }));
    const a = await draft({ title: 'Alpha bag', productCode: 'LIST-A' }, vendor);
    const b = await draft({ title: 'Beta bag' }, vendor);
    const cc2 = await draft({ title: 'Gamma case', productCode: 'LIST-C' }, vendor);
    const rival = await c.registerVendor({ businessName: 'Draft Rival' });
    await draft({ title: 'Rival draft' }, rival);
    await c.makeVariant(vendor, { status: 'active' }); // an active product is not a draft
    await addDoc(vendor.vendorId!, a.product.id, { primary: true });
    await c.patch(`/api/v1/products/${b.product.id}/draft`, { title: 'Beta bag edited', version: b.creation.version }, vendor); // beta is saved last

    const all = await c.get('/api/v1/products/drafts', vendor);
    expect(all.status, J(all)).toBe(200);
    expect(all.body.data).toMatchObject({ page: 1, pageSize: 25, total: 3, pages: 1 });
    expect(all.body.data.items.map((i: any) => i.title)).toEqual(['Beta bag edited', 'Gamma case', 'Alpha bag']);
    const row = all.body.data.items.find((i: any) => i.id === a.product.id);
    expect(row).toMatchObject({ id: a.product.id, title: 'Alpha bag', code: 'LIST-A', codeIsPlaceholder: false, currentStep: 'basic', readinessPercent: 38 }); // name, type, image = 3 of 8
    expect(row.thumbnailUrl).toMatch(/^\/api\/v1\/documents\/[0-9a-f-]+\/content$/);
    expect(new Date(row.savedAt).toISOString()).toBe(row.savedAt);
    const beta = all.body.data.items.find((i: any) => i.id === b.product.id);
    expect(beta).toMatchObject({ codeIsPlaceholder: true, thumbnailUrl: null, readinessPercent: 25 });
    expect((await c.get('/api/v1/products/drafts?sort=title', vendor)).body.data.items.map((i: any) => i.title)).toEqual(['Alpha bag', 'Beta bag edited', 'Gamma case']);
    expect((await c.get('/api/v1/products/drafts?sort=-productCode&pageSize=2', vendor)).body.data).toMatchObject({ total: 3, pages: 2 });
    expect((await c.get('/api/v1/products/drafts?q=gamma', vendor)).body.data.items.map((i: any) => i.id)).toEqual([cc2.product.id]);
    expect((await c.get('/api/v1/products/drafts?q=LIST-A', vendor)).body.data.items.map((i: any) => i.id)).toEqual([a.product.id]);
    const p2 = await c.get('/api/v1/products/drafts?pageSize=2&page=2', vendor);
    expect(p2.body.data.items).toHaveLength(1);
    expect((await c.get('/api/v1/products/drafts?sort=bogus', vendor)).status).toBe(400);
    expect((await c.get('/api/v1/products/drafts', rival)).body.data.items.map((i: any) => i.title)).toEqual(['Rival draft']);
    expect((await c.get('/api/v1/products/drafts', await c.addMember(vendor, 'vendor_viewer'))).status).toBe(200);
  });

  it('a draft created through the old POST /products also shows up (no wizard row needed)', async () => {
    const legacy = (await c.post('/api/v1/products', { productCode: 'LEGACY-1', title: 'Legacy draft' }, admin)).body.data;
    const list = await c.get('/api/v1/products/drafts?q=LEGACY-1', admin);
    expect(list.body.data.items[0]).toMatchObject({ id: legacy.id, code: 'LEGACY-1', currentStep: 'basic', codeIsPlaceholder: false });
    const view = await c.get(`/api/v1/products/${legacy.id}/creation`, admin);
    expect(view.body.data.creation).toMatchObject({ currentStep: 'basic', completedSteps: [], version: 1, codeIsPlaceholder: false });
    // and it can be autosaved (the wizard row is created on demand)
    const saved = await c.patch(`/api/v1/products/${legacy.id}/draft`, { material: 'Wool', version: 1 }, admin);
    expect(saved.status, J(saved)).toBe(200);
  });

  it('counts toward the plan limit like any product when the platform enforces limits', async () => {
    const vendor = await c.registerVendor({ businessName: 'Limit Co' });
    await t.relayEvents(); // the free-plan subscription is created by an event consumer
    await owner(`update plans set limits = jsonb_set(limits, '{products}', '2') where code = 'free'`);
    try {
      const platform = await c.platformAdmin('platform_admin');
      expect((await c.put(`/api/v1/admin/feature-flags/billing.enforce_limits/vendors/${vendor.vendorId}`, { enabled: true }, platform)).status).toBe(200);
      expect((await c.post('/api/v1/products/drafts', { title: 'Limit one' }, vendor)).status).toBe(201);
      expect((await c.post('/api/v1/products/drafts', { title: 'Limit two' }, vendor)).status).toBe(201);
      const blocked = await c.post('/api/v1/products/drafts', { title: 'Limit three' }, vendor);
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.details).toMatchObject({ rule: 'plan_limit', metric: 'products', limit: 2 });
      expect((await c.post('/api/v1/products', { productCode: 'LIMIT-3', title: 'Limit three' }, vendor)).status).toBe(403);
    } finally {
      await owner(`update plans set limits = limits - 'products' where code = 'free'`);
    }
  });

  it('discards drafts: soft delete, code reusable, audited; refused with stock; viewers cannot', async () => {
    const d = await draft({ title: 'To discard', productCode: 'DISCARD-1' });
    expect((await c.del(`/api/v1/products/${d.product.id}/draft`, viewer)).status).toBe(403);
    expect((await c.del(`/api/v1/products/${d.product.id}/draft`, other)).status).toBe(404);
    const r = await c.del(`/api/v1/products/${d.product.id}/draft`, staff);
    expect(r.status, J(r)).toBe(200);
    expect((await c.get(`/api/v1/products/${d.product.id}`, admin)).status).toBe(404);
    expect((await c.get(`/api/v1/products/${d.product.id}/creation`, admin)).status).toBe(404);
    expect((await c.get('/api/v1/products/drafts?q=DISCARD-1', admin)).body.data.items).toEqual([]);
    expect((await c.del(`/api/v1/products/${d.product.id}/draft`, admin)).status).toBe(404); // already gone
    expect((await draft({ title: 'Reuse code', productCode: 'DISCARD-1' })).product.productCode).toBe('DISCARD-1');
    const audit = await owner(`select action from audit_logs where vendor_id = $1 and resource_id = $2 order by id`, [admin.vendorId, d.product.id]);
    expect(audit.rows.map((x: any) => x.action)).toEqual(expect.arrayContaining(['product.draft_saved', 'product.draft_discarded']));
    expect((await t.outbox('product.draft_discarded')).some((e) => e.aggregateId === d.product.id)).toBe(true);

    // a draft with stock is not discardable
    const withStock = await c.post('/api/v1/products', { productCode: 'DISCARD-STOCK', title: 'Has stock', variants: [{ sku: 'DISCARD-STOCK-1' }] }, admin);
    const wh = await c.makeWarehouse(admin);
    await c.stock(admin, withStock.body.data.variants[0].id, wh.id, 5);
    const blocked = await c.del(`/api/v1/products/${withStock.body.data.id}/draft`, admin);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.rule).toBe('has_stock');
    expect((await c.get(`/api/v1/products/${withStock.body.data.id}`, admin)).status).toBe(200);
  });

  it('writes the audit records of the flow', async () => {
    const d = await draft({ title: 'Audited draft' });
    await c.patch(`/api/v1/products/${d.product.id}/draft`, { material: 'Steel', version: d.creation.version }, admin);
    const rows = await owner(`select action, metadata from audit_logs where vendor_id = $1 and resource_type = 'product' and resource_id = $2 order by id`, [admin.vendorId, d.product.id]);
    const actions = rows.rows.map((r: any) => r.action);
    expect(actions).toContain('product.create');
    expect(actions.filter((a: string) => a === 'product.draft_saved')).toHaveLength(2); // created + autosave
    expect(actions).not.toContain('product.update'); // a draft save is audited as draft_saved, not twice
    const events = (await t.outbox()).filter((e) => e.aggregateId === d.product.id).map((e) => e.type);
    expect(events).toEqual(expect.arrayContaining(['product.created', 'product.updated']));
  });
});

describe('creation readiness (saved and stateless)', () => {
  it('derives every state of the saved checklist from real data (image, SKU, brand, attributes)', async () => {
    const cat = await category('Readiness cat');
    const d = await draft({ title: 'Premium Travel Bag', categoryId: cat, productCode: 'RDY-1', brand: 'Rdy Brand' });
    const id = d.product.id as string;
    let r = await readinessOf(id);
    expect(r.required.map((i: any) => [i.key, i.state])).toEqual([['product_name', 'done'], ['category', 'done'], ['product_type', 'done'], ['primary_image', 'pending'], ['master_sku', 'verify']]);
    expect(r.recommended.map((i: any) => [i.key, i.state])).toEqual([['description', 'pending'], ['brand', 'confirm'], ['attributes', 'pending']]);
    expect(r.percent).toBe(38); // the design's "3 of 8 = 38%"
    expect(r.blockers).toEqual([{ key: 'primary_image', state: 'pending', message: 'Add a primary image before publishing this product to marketplaces.', fixTarget: 'primary_image' }]);
    expect(r.hints).toEqual(['SKU and brand are entered; circles indicate pending verification or confirmation, not missing values.']);
    expect(r.chain).toEqual(['Product', 'Variants', 'Inventory', 'Listings', 'Channels']);
    expect(r).toEqual((await c.get(`/api/v1/products/${id}/creation`, admin)).body.data.readiness); // same function behind both views

    // an abandoned upload (older than 30 minutes) does not count; a fresh one is "uploading"
    await addDoc(admin.vendorId!, id, { status: 'pending_upload', minutesAgo: 45 });
    expect(item(await readinessOf(id), 'primary_image').state).toBe('pending');
    const fresh = await addDoc(admin.vendorId!, id, { status: 'pending_upload', minutesAgo: 5 });
    r = await readinessOf(id);
    expect(item(r, 'primary_image')).toMatchObject({ state: 'uploading', tag: 'Uploading' });
    expect(r.blockers[0]).toMatchObject({ key: 'primary_image', state: 'uploading', message: 'Primary image is uploading. Publication stays blocked until the upload completes.' });
    expect(r.percent).toBe(38);
    // a placeholder primary: counts for the percent, still blocks
    await owner(`delete from product_documents where id = $1`, [fresh.rows[0].id]);
    await addDoc(admin.vendorId!, id, { primary: true, placeholder: true });
    r = await readinessOf(id);
    expect(item(r, 'primary_image')).toMatchObject({ state: 'placeholder' });
    expect(r.percent).toBe(50);
    expect(r.blockers[0]).toMatchObject({ key: 'primary_image', state: 'placeholder', message: 'Replace the placeholder image before publishing.' });
    expect((await c.get(`/api/v1/products/drafts?q=RDY-1`, admin)).body.data.items[0].thumbnailUrl).toMatch(/content$/);
    // a real primary replaces it
    await owner(`update product_documents set is_primary = false, deleted_at = now() where product_id = $1 and is_placeholder`, [id]);
    await addDoc(admin.vendorId!, id, { primary: true });
    r = await readinessOf(id);
    expect(item(r, 'primary_image').state).toBe('done');
    expect(r.blockers).toEqual([]);
    expect(r.percent).toBe(50);
    // verified sku, confirmed brand, description, custom attribute -> 100%
    await c.post(`/api/v1/products/${id}/sku/verify`, { code: 'RDY-1' }, admin);
    const brand = (await c.get('/api/v1/brands?q=rdy brand', admin)).body.data[0];
    await c.post(`/api/v1/brands/${brand.id}/confirm`, {}, admin);
    const cur = (await c.get(`/api/v1/products/${id}`, admin)).body.data;
    await c.patch(`/api/v1/products/${id}/draft`, { description: 'Some text', customAttributes: [{ name: 'Fit', value: 'Slim' }], version: cur.version }, admin);
    r = await readinessOf(id);
    expect(r.percent).toBe(100);
    expect(r.required.concat(r.recommended).every((i: any) => i.state === 'done')).toBe(true);
    expect(r.hints).toEqual([]);
    expect((await c.get(`/api/v1/products/${id}/creation-readiness`, other)).status).toBe(404);
  });

  it('counts category-required attributes (product level) as done only when all are filled', async () => {
    const cat = await category('Attr category');
    const a1 = (await c.post('/api/v1/attributes', { code: `req_a_${randomUUID().slice(0, 6)}`, name: 'Req A', dataType: 'text' }, admin)).body.data;
    const a2 = (await c.post('/api/v1/attributes', { code: `req_b_${randomUUID().slice(0, 6)}`, name: 'Req B', dataType: 'text' }, admin)).body.data;
    const varAttr = (await c.post('/api/v1/attributes', { code: `req_v_${randomUUID().slice(0, 6)}`, name: 'Req V', dataType: 'text', appliesTo: 'variant' }, admin)).body.data;
    const set = await c.put(`/api/v1/categories/${cat}/attributes`, { items: [{ attributeId: a1.id, isRequired: true }, { attributeId: a2.id, isRequired: true }, { attributeId: varAttr.id, isRequired: true }] }, admin);
    expect(set.status, J(set)).toBe(200);
    const d = await draft({ title: 'Attribute product', categoryId: cat });
    const id = d.product.id;
    expect(item(d.readiness, 'attributes').state).toBe('pending');
    await c.put(`/api/v1/products/${id}/attribute-values`, { values: [{ attributeId: a1.id, value: 'one' }] }, admin);
    expect(item(await readinessOf(id), 'attributes').state).toBe('pending'); // 1 of 2
    await c.put(`/api/v1/products/${id}/attribute-values`, { values: [{ attributeId: a2.id, value: 'two' }] }, admin);
    expect(item(await readinessOf(id), 'attributes').state).toBe('done'); // variant-level attributes are not expected on the master record
    // stateless preview of a category change
    const other1 = await category('Other attr category');
    const prev = await c.post('/api/v1/products/creation-readiness', { productId: id, values: { categoryId: other1 } }, admin);
    expect(item(prev.body.data, 'attributes').state).toBe('pending');
  });

  it('stateless preview evaluates unsaved values, including a duplicate candidate code', async () => {
    const cat = await category('Preview cat');
    await draft({ title: 'Holder of the code', productCode: 'PREVIEW-TAKEN' });
    const empty = await c.post('/api/v1/products/creation-readiness', { values: {} }, admin);
    expect(empty.status, J(empty)).toBe(200);
    expect(empty.body.data.percent).toBe(13);
    expect(empty.body.data.blockers.map((b: any) => b.key)).toEqual(['product_name', 'category', 'primary_image', 'master_sku']);
    const figma = await c.post('/api/v1/products/creation-readiness', { values: { title: 'Premium Travel Bag', categoryId: cat, productType: 'physical', productCode: 'TRV-9001', brand: 'Figma Unconfirmed' } }, admin);
    expect(figma.body.data.percent).toBe(38);
    expect(figma.body.data.required.map((i: any) => i.state)).toEqual(['done', 'done', 'done', 'pending', 'verify']);
    expect(figma.body.data.recommended.map((i: any) => i.state)).toEqual(['pending', 'confirm', 'pending']);
    const dup = await c.post('/api/v1/products/creation-readiness', { values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'preview-taken' } }, admin);
    expect(item(dup.body.data, 'master_sku')).toMatchObject({ state: 'duplicate', tag: 'Duplicate' });
    expect(dup.body.data.blockers.find((b: any) => b.key === 'master_sku')).toMatchObject({ state: 'duplicate', message: 'Resolve the duplicate SKU to continue.', fixTarget: 'master_sku' });
    expect(dup.body.data.blockers.map((b: any) => b.key)).toEqual(['primary_image', 'master_sku']);
    // description and attributes are evaluated from the unsaved editor content
    const rich = await c.post('/api/v1/products/creation-readiness', { values: { descriptionHtml: '<p><b>Hi</b></p><script>x</script>', customAttributes: [{ name: 'a', value: 'b' }, { name: '', value: '' }] } }, admin);
    expect(item(rich.body.data, 'description').state).toBe('done');
    expect(item(rich.body.data, 'attributes').state).toBe('done');
    const blankish = await c.post('/api/v1/products/creation-readiness', { values: { descriptionHtml: '<p> </p>', customAttributes: [{ name: 'only name', value: '' }] } }, admin);
    expect(item(blankish.body.data, 'description').state).toBe('pending');
    expect(item(blankish.body.data, 'attributes').state).toBe('pending');
    // an existing confirmed brand is "done", a placeholder or invalid code is "pending"
    await c.post('/api/v1/brands', { name: 'Preview Brand' }, admin);
    const brand = await c.post('/api/v1/products/creation-readiness', { values: { brand: ' preview   brand ', productCode: 'DRAFT-ABCD1234' } }, admin);
    expect(item(brand.body.data, 'brand').state).toBe('done');
    expect(item(brand.body.data, 'master_sku').state).toBe('pending');
    // over a saved product: the saved product's own code is not a duplicate of itself, other values stay
    const own = (await draft({ title: 'Preview own', productCode: 'PREVIEW-OWN', categoryId: cat })).product;
    const same = await c.post('/api/v1/products/creation-readiness', { productId: own.id, values: { productCode: 'PREVIEW-OWN' } }, admin);
    expect(item(same.body.data, 'master_sku').state).toBe('verify');
    expect(item(same.body.data, 'category').state).toBe('done');
    const changed = await c.post('/api/v1/products/creation-readiness', { productId: own.id, values: { productCode: 'PREVIEW-TAKEN', title: 'x' } }, admin);
    expect(item(changed.body.data, 'master_sku').state).toBe('duplicate');
    expect(item(changed.body.data, 'product_name').state).toBe('pending');
    // nothing was written
    expect((await c.get(`/api/v1/products/${own.id}`, admin)).body.data).toMatchObject({ productCode: 'PREVIEW-OWN', title: 'Preview own', version: own.version });
    // access and tenancy
    expect((await c.post('/api/v1/products/creation-readiness', { values: {} }, viewer)).status).toBe(200);
    expect((await c.post('/api/v1/products/creation-readiness', { productId: own.id, values: {} }, other)).status).toBe(404);
    expect((await c.post('/api/v1/products/creation-readiness', { values: { productCode: 'PREVIEW-TAKEN' } }, other)).body.data.required.find((i: any) => i.key === 'master_sku').state).toBe('verify'); // not a duplicate in another business
    expect((await c.post('/api/v1/products/creation-readiness', { values: { categoryId: 'nope' } }, admin)).status).toBe(400);
  });

  it('lists the connected channels', async () => {
    const vendor = await c.registerVendor({ businessName: 'Channel Co' });
    const none = await c.post('/api/v1/products/creation-readiness', { values: {} }, vendor);
    expect(none.body.data.channels).toEqual([]);
    const acc = await c.connectAccount(vendor, 'mock', { displayName: 'My mock store' });
    const r = await c.post('/api/v1/products/creation-readiness', { values: {} }, vendor);
    expect(r.body.data.channels).toEqual([{ code: 'mock', name: expect.any(String) }]);
    expect(r.body.data.channels[0].name.length).toBeGreaterThan(0);
    const dto = await draft({ title: 'Channel draft' }, vendor);
    expect(dto.readiness.channels).toEqual(r.body.data.channels);
    // a paused account is not connected
    await owner(`update marketplace_accounts set status = 'paused' where id = $1`, [acc.id]);
    expect((await c.post('/api/v1/products/creation-readiness', { values: {} }, vendor)).body.data.channels).toEqual([]);
  });
});

describe('step validation and continue', () => {
  it('validate-step reports errors and warnings, writes nothing except the verified SKU', async () => {
    const cat = await category('Step cat');
    const d = await draft({ title: 'ab' });
    const id = d.product.id;
    const v1 = await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic' }, admin);
    expect(v1.status, J(v1)).toBe(200);
    expect(v1.body.data.valid).toBe(false);
    expect(v1.body.data.errors.map((e: any) => [e.field, e.code])).toEqual([['title', 'title_too_short'], ['categoryId', 'category_required'], ['productCode', 'code_required']]);
    expect(v1.body.data.errors.every((e: any) => typeof e.message === 'string' && e.message.length > 0)).toBe(true);
    expect(v1.body.data.readiness.percent).toBeGreaterThan(0);

    // unsaved values are laid over the saved product
    const holder = await draft({ title: 'Holder', productCode: 'STEP-TAKEN' });
    const v2 = await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic', values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'step-taken' } }, admin);
    expect(v2.body.data.valid).toBe(false);
    expect(v2.body.data.errors).toEqual([{ field: 'productCode', code: 'duplicate_product_code', message: 'Master SKU already exists. Use a unique SKU to continue.' }]);
    expect(item(v2.body.data.readiness, 'master_sku').state).toBe('duplicate');
    expect(holder.product.id).toBeTruthy();

    const v3 = await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic', values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'STEP-FREE', description: 'a'.repeat(2001), hsnCode: '12345', weight: { value: 0, unit: 'kg' } } }, admin);
    expect(v3.body.data.errors.map((e: any) => [e.field, e.code]).sort()).toEqual([['description', 'description_too_long'], ['hsnCode', 'invalid_hsn'], ['weight.value', 'not_positive']]);
    const v4 = await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic', values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'STEP-FREE' } }, admin);
    expect(v4.body.data).toMatchObject({ valid: true, errors: [], warnings: [] });
    expect(item(v4.body.data.readiness, 'master_sku').state).toBe('done'); // the free code was recorded as verified
    expect(item(v4.body.data.readiness, 'product_name').state).toBe('done');
    // nothing but the verified code was written: still the original draft values
    const after = (await c.get(`/api/v1/products/${id}`, admin)).body.data;
    expect(after).toMatchObject({ title: 'ab', productCode: d.product.productCode, categoryId: null, version: d.product.version });
    // ... and that verified code makes the saved readiness "done" once the code is saved
    const saved = await c.patch(`/api/v1/products/${id}/draft`, { productCode: 'STEP-FREE', version: d.creation.version }, admin);
    expect(item(saved.body.data.readiness, 'master_sku').state).toBe('done');

    // warnings: a variant SKU equal to the code
    await c.post('/api/v1/products', { productCode: 'STEP-OTHER', title: 'Other family', variants: [{ sku: 'STEP-SIM' }] }, admin);
    const v5 = await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic', values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'step-sim' } }, admin);
    expect(v5.body.data.valid).toBe(true);
    expect(v5.body.data.warnings).toEqual([expect.objectContaining({ field: 'productCode', code: 'similar_variant_sku' })]);
    // a missing category and a cleared code
    const v6 = await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic', values: { categoryId: randomUUID(), productCode: '' } }, admin);
    expect(v6.body.data.errors.map((e: any) => [e.field, e.code])).toEqual([['title', 'title_too_short'], ['categoryId', 'category_not_found'], ['productCode', 'code_required']]);
    // unknown step, permissions, tenancy
    expect((await c.post(`/api/v1/products/${id}/validate-step`, { step: 'variants' }, admin)).status).toBe(400);
    expect((await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic' }, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/products/${id}/validate-step`, { step: 'basic' }, other)).status).toBe(404);
  });

  it('continue: saves the values, completes the basic step and moves to variants', async () => {
    const cat = await category('Continue cat');
    const d = await draft({ title: 'Continue me' });
    const r = await c.post(`/api/v1/products/${d.product.id}/creation/continue`, {
      step: 'basic', version: d.creation.version,
      values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'CONT-1', brand: 'Cont Brand', description: 'Nice bag', weight: { value: 2, unit: 'kg' } },
    }, admin);
    expect(r.status, J(r)).toBe(200);
    expect(r.body.data.product).toMatchObject({ title: 'Premium Travel Bag', categoryId: cat, productCode: 'CONT-1', brand: 'Cont Brand', description: 'Nice bag', weightGrams: 2000 });
    expect(r.body.data.creation).toMatchObject({ currentStep: 'variants', completedSteps: ['basic'], codeIsPlaceholder: false, version: d.creation.version + 1 });
    expect(item(r.body.data.readiness, 'master_sku').state).toBe('done'); // continue verified the code
    // idempotent retry without values (same version): still fine, still completed once
    const again = await c.post(`/api/v1/products/${d.product.id}/creation/continue`, { step: 'basic', version: r.body.data.creation.version }, admin);
    expect(again.status, J(again)).toBe(200);
    expect(again.body.data.creation).toMatchObject({ currentStep: 'variants', completedSteps: ['basic'], version: r.body.data.creation.version });
    // the draft list shows the step
    expect((await c.get('/api/v1/products/drafts?q=CONT-1', admin)).body.data.items[0]).toMatchObject({ currentStep: 'variants' });
    const audit = await owner(`select action from audit_logs where vendor_id = $1 and resource_id = $2`, [admin.vendorId, d.product.id]);
    expect(audit.rows.map((x: any) => x.action)).toContain('product.creation_step_completed');
  });

  it('continue with problems: 422 VALIDATION_FAILED, the valid values are still saved, the bad code is not', async () => {
    const cat = await category('Fail cat');
    await draft({ title: 'Code holder', productCode: 'FAIL-TAKEN' });
    const d = await draft({ title: 'Fail me' });
    const r = await c.post(`/api/v1/products/${d.product.id}/creation/continue`, {
      step: 'basic', version: d.creation.version, values: { title: 'Premium Travel Bag', categoryId: cat, productCode: 'fail-taken', brand: 'Fail Brand', material: 'Wool' },
    }, admin);
    expect(r.status, J(r)).toBe(422);
    expect(r.body.error).toMatchObject({ code: 'VALIDATION_FAILED', details: { step: 'basic' } });
    expect(r.body.error.details.errors).toEqual([{ field: 'productCode', code: 'duplicate_product_code', message: 'Master SKU already exists. Use a unique SKU to continue.' }]);
    expect(r.body.error.details.creation.creation.version).toBe(d.creation.version + 1);
    // the draft kept everything except the code
    const saved = (await c.get(`/api/v1/products/${d.product.id}/creation`, admin)).body.data;
    expect(saved.product).toMatchObject({ title: 'Premium Travel Bag', categoryId: cat, brand: 'Fail Brand', material: 'Wool', productCode: d.product.productCode });
    expect(saved.creation).toMatchObject({ currentStep: 'basic', completedSteps: [], codeIsPlaceholder: true });
    // field-level problems are reported and the rest is saved
    const r2 = await c.post(`/api/v1/products/${d.product.id}/creation/continue`, {
      step: 'basic', version: saved.creation.version, values: { productCode: 'FAIL-FREE', description: 'a'.repeat(2001), hsnCode: 'abc12', title: 'Better title' },
    }, admin);
    expect(r2.status).toBe(422);
    expect(r2.body.error.details.errors.map((e: any) => [e.field, e.code]).sort()).toEqual([['description', 'description_too_long'], ['hsnCode', 'invalid_hsn']]);
    const saved2 = (await c.get(`/api/v1/products/${d.product.id}/creation`, admin)).body.data;
    expect(saved2.product).toMatchObject({ title: 'Better title', productCode: 'FAIL-FREE', description: null, hsnCode: null });
    // missing category on a fresh draft
    const bare = await draft({ title: 'Bare', productCode: 'FAIL-BARE' });
    const r3 = await c.post(`/api/v1/products/${bare.product.id}/creation/continue`, { step: 'basic', version: bare.creation.version }, admin);
    expect(r3.status).toBe(422);
    expect(r3.body.error.details.errors.map((e: any) => e.code)).toEqual(['category_required']);
    expect(r3.body.error.details.creation.creation).toMatchObject({ currentStep: 'basic', completedSteps: [] });
    // the placeholder code blocks continue
    const ph = await draft({ title: 'Placeholder holder', categoryId: cat });
    const r4 = await c.post(`/api/v1/products/${ph.product.id}/creation/continue`, { step: 'basic', version: ph.creation.version }, admin);
    expect(r4.status).toBe(422);
    expect(r4.body.error.details.errors).toEqual([{ field: 'productCode', code: 'code_required', message: expect.stringContaining('Master SKU') }]);
  });

  it('continue: stale version is a 409, only drafts, permissions, tenancy, bad step', async () => {
    const cat = await category('Cont rules cat');
    const d = await draft({ title: 'Rules draft', categoryId: cat, productCode: 'CONT-RULES' });
    const stale = await c.post(`/api/v1/products/${d.product.id}/creation/continue`, { step: 'basic', version: 99 }, admin);
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentVersion: 1 } });
    expect((await c.post(`/api/v1/products/${d.product.id}/creation/continue`, { step: 'basic' }, admin)).status).toBe(400); // version required
    expect((await c.post(`/api/v1/products/${d.product.id}/creation/continue`, { step: 'variants', version: 1 }, admin)).status).toBe(400);
    expect((await c.post(`/api/v1/products/${d.product.id}/creation/continue`, { step: 'basic', version: 1 }, viewer)).status).toBe(403);
    expect((await c.post(`/api/v1/products/${d.product.id}/creation/continue`, { step: 'basic', version: 1 }, other)).status).toBe(404);
    const active = await c.makeVariant(admin, { status: 'active' });
    const notDraft = await c.post(`/api/v1/products/${active.productId}/creation/continue`, { step: 'basic', version: 1 }, admin);
    expect(notDraft.status).toBe(409);
    expect(notDraft.body.error.details.rule).toBe('not_a_draft');
    // a parallel continue with the same code from two drafts: one succeeds, the other is told about the duplicate
    const a = await draft({ title: 'Parallel A', categoryId: cat });
    const b = await draft({ title: 'Parallel B', categoryId: cat });
    const res = await Promise.all([a, b].map((x) => c.post(`/api/v1/products/${x.product.id}/creation/continue`, { step: 'basic', version: x.creation.version, values: { productCode: 'PARALLEL-CODE' } }, admin)));
    expect(res.map((x) => x.status).sort()).toEqual([200, 422]);
    expect(res.find((x) => x.status === 422)!.body.error.details.errors[0]).toMatchObject({ field: 'productCode', code: 'duplicate_product_code' });
  });
});

describe('permissions and tenant isolation', () => {
  it('viewers read but cannot write; everything is tenant scoped; anonymous is rejected', async () => {
    const d = await draft({ title: 'Isolation draft', productCode: 'ISO-1' });
    const reads = ['/api/v1/products/form-options', '/api/v1/products/standard-categories', '/api/v1/brands', '/api/v1/products/drafts', '/api/v1/products/sku-check?code=X1',
      `/api/v1/products/${d.product.id}/creation`, `/api/v1/products/${d.product.id}/creation-readiness`];
    for (const url of reads) {
      expect((await c.get(url, viewer)).status, url).toBe(200);
      expect((await c.get(url)).status, url).toBe(401);
    }
    const writes: Array<[string, string, unknown]> = [
      ['post', '/api/v1/products/drafts', { title: 'x' }], ['patch', `/api/v1/products/${d.product.id}/draft`, { title: 'x', version: 1 }], ['delete', `/api/v1/products/${d.product.id}/draft`, undefined],
      ['post', '/api/v1/brands', { name: 'x' }], ['post', `/api/v1/products/${d.product.id}/sku/verify`, { code: 'X' }], ['post', `/api/v1/products/${d.product.id}/validate-step`, { step: 'basic' }],
      ['post', `/api/v1/products/${d.product.id}/creation/continue`, { step: 'basic', version: 1 }],
    ];
    for (const [method, url, body] of writes) {
      const r = method === 'post' ? await c.post(url, body, viewer) : method === 'patch' ? await c.patch(url, body, viewer) : await c.del(url, viewer);
      expect(r.status, `${method} ${url}`).toBe(403);
    }
    // another business cannot reach this draft through any endpoint
    for (const url of [`/api/v1/products/${d.product.id}/creation`, `/api/v1/products/${d.product.id}/creation-readiness`]) expect((await c.get(url, other)).status, url).toBe(404);
    expect((await c.get('/api/v1/products/drafts?q=ISO-1', other)).body.data.items).toEqual([]);
    expect((await c.get('/api/v1/products?q=ISO-1', other)).body.data).toEqual([]);
    expect((await c.get('/api/v1/products/sku-check?code=ISO-1', other)).body.data.available).toBe(true);
  });
});

describe('API documentation', () => {
  it('documents every endpoint of the creation flow with tags, summary and 2xx responses', async () => {
    const res = await t.app.inject('/docs/openapi');
    expect(res.statusCode).toBe(200);
    const doc = res.json() as { paths: Record<string, Record<string, { summary?: string; description?: string; tags?: string[]; responses: Record<string, unknown> }>> };
    const expected: Array<[string, string]> = [
      ['get', '/api/v1/products/form-options'], ['get', '/api/v1/products/standard-categories'], ['get', '/api/v1/brands'], ['post', '/api/v1/brands'], ['post', '/api/v1/brands/{id}/confirm'],
      ['delete', '/api/v1/brands/{id}'], ['get', '/api/v1/products/sku-check'], ['post', '/api/v1/products/{id}/sku/verify'], ['post', '/api/v1/products/drafts'], ['get', '/api/v1/products/drafts'],
      ['get', '/api/v1/products/{id}/creation'], ['patch', '/api/v1/products/{id}/draft'], ['delete', '/api/v1/products/{id}/draft'], ['get', '/api/v1/products/{id}/creation-readiness'],
      ['post', '/api/v1/products/creation-readiness'], ['post', '/api/v1/products/{id}/validate-step'], ['post', '/api/v1/products/{id}/creation/continue'],
    ];
    for (const [method, path] of expected) {
      const op = doc.paths[path]?.[method];
      expect(op, `${method} ${path}`).toBeDefined();
      expect(op!.summary, `${method} ${path}`).toBeTruthy();
      expect(op!.description, `${method} ${path}`).toBeTruthy();
      expect(op!.tags?.length, `${method} ${path}`).toBeGreaterThan(0);
      expect(Object.keys(op!.responses).some((s) => s.startsWith('2')), `${method} ${path}`).toBe(true);
    }
  });
});
