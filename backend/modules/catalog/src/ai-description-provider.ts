import { DESCRIPTION_MAX_CHARS, sanitizeDescription } from './description';

/**
 * Description writing for "Improve with AI". Everything in this file is pure and deterministic (same input, same output) and makes no
 * network calls. A language-model provider can be plugged in later behind `DescriptionProvider`; the rules provider below is the default.
 *
 * Grounding rule: generated copy may only use `DescriptionFacts`, which the service builds from data that exists on the product
 * (name, category name, confirmed brand, material, country of origin, dimensions, weight, confirmed custom attributes).
 */
export type AiMode = 'rewrite' | 'concise' | 'benefits';

export interface DescriptionFacts {
  name: string;
  category: string | null;
  /** only a confirmed brand */
  brand: string | null;
  material: string | null;
  /** ISO 3166-1 alpha-2 code */
  countryOfOrigin: string | null;
  dimensionsMm: { length: number; width: number; height: number } | null;
  weightGrams: number | null;
  /** only confirmed custom attributes */
  attributes: Array<{ name: string; value: string }>;
}

export interface GenerateInput {
  mode: AiMode;
  facts: DescriptionFacts;
  /** the seller's current description as plain text (what `rewrite` works on) */
  text: string;
}

export interface DescriptionProvider {
  readonly name: string;
  /** returns plain text: paragraphs separated by a blank line, bullets as "- item" */
  generate(input: GenerateInput): string | Promise<string>;
}

export const GROUNDING_NOTE_NO_FACTS = 'Based on the product name and category only. Add verified features before highlighting specific benefits.';

// ------------------------------------------------------------------------------------------------
// small text helpers
// ------------------------------------------------------------------------------------------------
const DANDA = String.fromCharCode(0x964);
const NOT_WORD_EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}\p{M}]+$/gu;

const isControl = (cp: number) => cp < 32 || (cp >= 0x7f && cp <= 0x9f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0x2028 || cp === 0x2029 || cp === 0xfeff;

/** collapse every run of whitespace to one space, drop control / zero-width characters, trim */
export function cleanInline(s: string | null | undefined): string {
  const kept = [...(s ?? '')].filter((ch) => !isControl(ch.codePointAt(0)!) || /\s/.test(ch)).join('');
  return kept.replace(/\s+/g, ' ').trim();
}

/** product name as used inside a sentence: clean, without a leading "The" and without trailing sentence punctuation */
export function nameForSentence(raw: string | null | undefined): string {
  let n = cleanInline(raw);
  n = n.replace(/^the\s+(?=\S)/i, '');
  n = n.replace(/[.!?,;:]+$/g, '').trim();
  return n;
}

/** first word of the category name, lower-case, without surrounding punctuation ("Travel Accessories" -> "travel") */
export function categoryKeyword(category: string | null | undefined): string {
  const first = cleanInline(category).split(' ')[0] ?? '';
  return first.replace(NOT_WORD_EDGE, '').toLowerCase();
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const num = (n: number, decimals: number) => Number(n.toFixed(decimals)).toString();

const COUNTRIES: Record<string, string> = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', AE: 'United Arab Emirates', CN: 'China', JP: 'Japan', KR: 'South Korea', DE: 'Germany', FR: 'France',
  IT: 'Italy', ES: 'Spain', PT: 'Portugal', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria', SE: 'Sweden', NO: 'Norway', DK: 'Denmark',
  FI: 'Finland', PL: 'Poland', CZ: 'Czechia', TR: 'Turkey', GR: 'Greece', IE: 'Ireland', CA: 'Canada', MX: 'Mexico', BR: 'Brazil', AR: 'Argentina',
  CL: 'Chile', CO: 'Colombia', PE: 'Peru', AU: 'Australia', NZ: 'New Zealand', SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand', VN: 'Vietnam', ID: 'Indonesia',
  PH: 'Philippines', BD: 'Bangladesh', LK: 'Sri Lanka', NP: 'Nepal', PK: 'Pakistan', HK: 'Hong Kong', TW: 'Taiwan', SA: 'Saudi Arabia', IL: 'Israel',
  EG: 'Egypt', ZA: 'South Africa', KE: 'Kenya', NG: 'Nigeria', MA: 'Morocco', RU: 'Russia', UA: 'Ukraine', HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria',
};
/** country name for an ISO code; the code itself when unknown */
export const countryLabel = (code: string): string => COUNTRIES[code.trim().toUpperCase()] ?? code.trim().toUpperCase();

// ------------------------------------------------------------------------------------------------
// facts -> bullets
// ------------------------------------------------------------------------------------------------
export interface FactSummary { basis: string[]; bullets: string[]; hasFacts: boolean }

const RESERVED_ATTRIBUTE_NAMES = new Set(['brand', 'material', 'weight', 'dimensions', 'country of origin', 'country']);

/** the verified facts (beyond name / category) as display bullets, and the names of the facts that exist ("basis") */
export function summarizeFacts(f: DescriptionFacts): FactSummary {
  const basis: string[] = [];
  const bullets: string[] = [];
  if (nameForSentence(f.name)) basis.push('name');
  if (cleanInline(f.category)) basis.push('category');
  const brand = cleanInline(f.brand);
  if (brand) { basis.push('brand'); bullets.push(`Brand: ${brand}`); }
  const material = cleanInline(f.material);
  if (material) { basis.push('material'); bullets.push(`Material: ${material}`); }
  const country = cleanInline(f.countryOfOrigin);
  if (country) { basis.push('countryOfOrigin'); bullets.push(`Made in ${countryLabel(country)}`); }
  const d = f.dimensionsMm;
  if (d && d.length > 0 && d.width > 0 && d.height > 0) {
    basis.push('dimensions');
    bullets.push(`Dimensions: ${num(d.length / 10, 2)} x ${num(d.width / 10, 2)} x ${num(d.height / 10, 2)} cm`);
  }
  if (f.weightGrams && f.weightGrams > 0) { basis.push('weight'); bullets.push(`Weight: ${num(f.weightGrams / 1000, 3)} kg`); }
  const seen = new Set<string>();
  let attrs = 0;
  for (const a of f.attributes) {
    const name = cleanInline(a.name);
    const value = cleanInline(a.value);
    const key = name.toLowerCase();
    if (!name || !value || RESERVED_ATTRIBUTE_NAMES.has(key) || seen.has(key)) continue;
    seen.add(key);
    bullets.push(`${name}: ${value}`);
    attrs++;
  }
  if (attrs > 0) basis.push('attributes');
  return { basis, bullets, hasFacts: bullets.length > 0 };
}

const joinWords = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);
const BASIS_WORDS: Record<string, string> = {
  name: 'product name', category: 'category', brand: 'confirmed brand', material: 'material', countryOfOrigin: 'country of origin', dimensions: 'dimensions', weight: 'weight', attributes: 'confirmed attributes',
};

/** the grounding line shown under the preview */
export function groundingNote(o: { mode: AiMode; basis: string[]; needsFacts: boolean; unchanged: boolean }): string {
  if (o.mode === 'rewrite' || o.basis.includes('text')) return o.unchanged ? 'Your text already reads well, so no changes are suggested.' : 'Based on your own text only. No new information was added.';
  if (o.mode === 'benefits' && o.needsFacts) return GROUNDING_NOTE_NO_FACTS;
  const words = o.basis.map((b) => BASIS_WORDS[b] ?? b);
  if (words.length === 0) return 'Based on the product details you provided only.';
  const onlyNameCategory = o.basis.every((b) => b === 'name' || b === 'category');
  if (onlyNameCategory) return `Based on the ${joinWords(words)} only.`;
  return `Based on the ${joinWords(words)} only. Nothing else was added.`;
}

const KEEP_ORIGINAL = 'Your original remains unchanged above.';
/** why the suggestion looks the way it does (shown under the preview in the editor) */
export function explanationFor(o: { mode: AiMode; basis: string[]; needsFacts: boolean; unchanged: boolean }): string {
  if (o.mode === 'rewrite') {
    return o.unchanged ? `Your text already reads well, so no changes are suggested. ${KEEP_ORIGINAL}`
      : `Simplifies the sentence using only your existing description. No new features or product claims have been added. ${KEEP_ORIGINAL}`;
  }
  if (o.mode === 'concise' && o.basis.includes('text')) {
    return o.unchanged ? `Your text is already concise, so no shortening is suggested. ${KEEP_ORIGINAL}`
      : `Shortens your existing description by removing filler. No new features or product claims have been added. ${KEEP_ORIGINAL}`;
  }
  return groundingNote(o);
}

// ------------------------------------------------------------------------------------------------
// concise / benefits
// ------------------------------------------------------------------------------------------------
function subject(f: DescriptionFacts): { ref: string; collection: string; keyword: string } {
  const name = nameForSentence(f.name);
  const category = cleanInline(f.category);
  return { ref: name ? `the ${name}` : 'this product', collection: category ? ` in our ${category} collection` : '', keyword: categoryKeyword(category) };
}

export function conciseText(f: DescriptionFacts): string {
  const s = subject(f);
  return `Explore ${s.ref}${s.collection}. Review the product details to find out whether it suits your ${s.keyword ? `${s.keyword} ` : ''}needs.`;
}

export function benefitsText(f: DescriptionFacts): string {
  const s = subject(f);
  const facts = summarizeFacts(f);
  if (!facts.hasFacts) return `Explore ${s.ref}${s.collection}. Review the product details for more information.`;
  const intro = `Discover ${s.ref}${s.collection}. Here is what we know about it:`;
  const bullets = [...facts.bullets];
  const build = () => `${intro}\n\n${bullets.map((b) => `- ${b}`).join('\n')}`;
  while (bullets.length > 1 && [...build()].length > DESCRIPTION_MAX_CHARS) bullets.pop();
  return build();
}

// ------------------------------------------------------------------------------------------------
// rewrite
// ------------------------------------------------------------------------------------------------
const ABBREVIATIONS = new Set(['e.g.', 'i.e.', 'etc.', 'vs.', 'no.', 'mr.', 'mrs.', 'ms.', 'dr.', 'approx.', 'inc.', 'ltd.', 'co.', 'cm.', 'kg.']);
const isProtected = (token: string) => token.includes('://') || token.includes('@') || /^\(?www\./i.test(token) || /^\(?mailto:/i.test(token);

function tidyToken(t: string): string {
  if (isProtected(t)) return t;
  let x = t.replace(/([!?])\1+/g, '$1').replace(/([,;:])\1+/g, '$1').replace(/\.{4,}/g, '...').replace(/(?<!\.)\.\.(?!\.)/g, '.');
  x = x.replace(/(\p{Ll})([,;])(?=\p{L})/gu, '$1$2 ');
  x = x.replace(/(\p{Ll})([.!?])(?=\p{Lu})/gu, '$1$2 ');
  if (/^i(?:'(?:m|ll|ve|d))?(?:$|[,.!?;:])/.test(x)) x = `I${x.slice(1)}`;
  return x;
}

function tidyFragment(s: string): string {
  const tokens = cleanInline(s).split(' ').filter(Boolean).map(tidyToken);
  return tokens.join(' ').replace(/ +([,;])(?=\p{L})/gu, '$1 ').replace(/ +([,;:!?])/g, '$1').trim();
}

function capitalizeFirst(s: string): string {
  const first = s.split(' ')[0] ?? '';
  if (isProtected(first) || /^\p{Ll}\p{Lu}/u.test(first.replace(/^[^\p{L}\p{N}]+/u, ''))) return s;
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (/\p{L}/u.test(ch)) { chars[i] = ch.toUpperCase(); break; }
    if (/\p{N}/u.test(ch)) break;
  }
  return chars.join('');
}

function splitSentences(s: string): string[] {
  const tokens = s.split(' ');
  const out: string[] = [];
  let cur: string[] = [];
  const ends = new RegExp(`[.!?${DANDA}]["')\\]]*$`, 'u');
  for (const t of tokens) {
    cur.push(t);
    const lower = t.toLowerCase();
    if (ends.test(t) && !isProtected(t) && !ABBREVIATIONS.has(lower) && !/^\p{L}\.$/u.test(t) && !/^\.\.\.$/.test(t)) { out.push(cur.join(' ')); cur = []; }
  }
  if (cur.length) out.push(cur.join(' '));
  return out;
}

const sentenceKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function endWithPunctuation(line: string): string {
  const words = line.split(' ');
  const last = words[words.length - 1] ?? '';
  if (words.length < 4 || isProtected(last)) return line;
  if (!/[\p{L}\p{N}\p{M}]$/u.test(line)) return line;
  return /\p{Script=Devanagari}$/u.test(line) ? `${line}${DANDA}` : `${line}.`;
}

/** cut text to at most `max` characters at the last sentence (or line, or word) boundary */
export function trimToLimit(text: string, max = DESCRIPTION_MAX_CHARS): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const head = chars.slice(0, max).join('');
  const boundary = new RegExp(`[.!?${DANDA}]["')\\]]*(?=\\s|$)|\\n`, 'gu');
  let cut = -1;
  for (const m of head.matchAll(boundary)) cut = m.index! + (m[0] === '\n' ? 0 : m[0].length);
  if (cut < Math.floor(head.length / 4)) cut = head.lastIndexOf(' ');
  const res = (cut > 0 ? head.slice(0, cut) : head).trimEnd();
  return res;
}

// ------------------------------------------------------------------------------------------------
// word-level rules shared by rewrite and concise (closed lists, no new vocabulary)
// ------------------------------------------------------------------------------------------------
interface Tok { lead: string; core: string; trail: string; key: string }
interface Rule { words: string[]; to: string[]; notFirst?: boolean; guard?: (prevKey: string) => boolean }

function parseTok(raw: string): Tok {
  const m = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}\p{M}]*)$/su.exec(raw)!;
  const core = m[2] ?? '';
  // links, e-mail addresses and anything with a digit (numbers, units, sizes) never take part in a rule
  const key = isProtected(raw) || /\d/.test(core) || core.includes('/') ? '' : core.toLowerCase();
  return { lead: m[1] ?? '', core, trail: m[3] ?? '', key };
}
const tokText = (t: Tok) => `${t.lead}${t.core}${t.trail}`;
const SENTENCE_END = new RegExp(`[.!?${DANDA}]`, 'u');

function findRule(cur: Tok[], i: number, rules: Rule[], keptBefore: Tok[]): Rule | null {
  for (const r of rules) {
    const n = r.words.length;
    if (i + n > cur.length) continue;
    let ok = true;
    for (let k = 0; k < n && ok; k++) {
      if (cur[i + k]!.key !== r.words[k]) ok = false;
      else if (k < n - 1 && (cur[i + k]!.trail !== '' || cur[i + k + 1]!.lead !== '')) ok = false;
    }
    if (!ok) continue;
    if (r.notFirst && keptBefore.length === 0) continue;
    if (r.guard && !r.guard(keptBefore[keptBefore.length - 1]?.key ?? '')) continue;
    return r;
  }
  return null;
}

function applyRules(tokens: Tok[], rules: Rule[]): Tok[] {
  let cur = tokens;
  for (let pass = 0; pass < 6; pass++) {
    const out: Tok[] = [];
    let pendingLead = '';
    let changed = false;
    for (let i = 0; i < cur.length;) {
      const hit = findRule(cur, i, rules, out);
      if (!hit) {
        const t = cur[i]!;
        out.push(pendingLead ? { ...t, lead: pendingLead + t.lead } : t);
        pendingLead = '';
        i++;
        continue;
      }
      changed = true;
      const n = hit.words.length;
      const lead = cur[i]!.lead;
      const trail = cur[i + n - 1]!.trail;
      if (hit.to.length > 0) {
        const w = hit.to[0]!;
        out.push({ lead: pendingLead + lead, core: w, trail, key: w });
        pendingLead = '';
      } else {
        pendingLead += lead;
        const prev = out[out.length - 1];
        if (prev && SENTENCE_END.test(trail)) out[out.length - 1] = { ...prev, trail: prev.trail.replace(/[,;]+$/, '') + trail };
      }
      i += n;
    }
    cur = out;
    if (!changed) break;
  }
  return cur;
}

const byLength = (rules: Rule[]) => [...rules].sort((a, b) => b.words.length - a.words.length);
const w = (s: string) => s.split(' ');

/** "designed for" -> "for" (also "that is designed for", made / built / created); never at the start of a sentence, never after an adverb such as "perfectly" */
const DESIGN_VERBS = ['designed', 'made', 'built', 'created'];
const NOT_AFTER = new Set(['tailor', 'custom', 'purpose', 'well', 'hand', 'specially', 'ready', 'not', 'never', 'is', 'are', 'was', 'were', 'be']);
const designGuard = (prev: string) => prev !== '' && !prev.endsWith('ly') && !NOT_AFTER.has(prev);
const DESIGNED_FOR_RULES: Rule[] = byLength(DESIGN_VERBS.flatMap((v) => [
  { words: [v, 'for'], to: ['for'], notFirst: true, guard: designGuard },
  ...['that', 'which'].flatMap((rel) => ['is', 'are'].map((be) => ({ words: [rel, be, v, 'for'], to: ['for'], notFirst: true, guard: designGuard }))),
]));

/** closed list: adjectives that get a comma between them when two or more stand next to each other */
export const ADJECTIVES = new Set([
  'durable', 'premium', 'lightweight', 'spacious', 'stylish', 'compact', 'sturdy', 'elegant', 'sleek', 'strong', 'soft', 'comfortable', 'waterproof', 'versatile',
  'reliable', 'modern', 'classic', 'portable', 'practical', 'rugged', 'breathable', 'handy', 'roomy', 'slim', 'flexible', 'ergonomic', 'luxurious', 'robust', 'stable',
]);

function commaAdjectives(tokens: Tok[]): Tok[] {
  return tokens.map((t, i) => {
    const next = tokens[i + 1];
    if (!next || !ADJECTIVES.has(t.key) || !ADJECTIVES.has(next.key) || t.trail !== '' || next.lead !== '') return t;
    return { ...t, trail: ',' };
  });
}

/** rewrite polish for one sentence: "designed for X" -> "for X", commas between consecutive adjectives */
function refineSentence(sentence: string): string {
  const toks = sentence.split(' ').filter(Boolean).map(parseTok);
  return commaAdjectives(applyRules(toks, DESIGNED_FOR_RULES)).map(tokText).join(' ');
}

// concise: the closed rule list. Replacements use only words that are in the source or one of: because, if, can.
const REPLACEMENTS: Rule[] = [
  { words: w('in order to'), to: ['to'] }, { words: w('so as to'), to: ['to'] },
  { words: w('due to the fact that'), to: ['because'] }, { words: w('in the event that'), to: ['if'] },
  { words: w('for the purpose of'), to: ['for'] },
  { words: w('is able to'), to: ['can'] }, { words: w('are able to'), to: ['can'] },
  { words: w('has the ability to'), to: ['can'] }, { words: w('have the ability to'), to: ['can'] },
  { words: w('each and every'), to: ['each'] },
];
const FILLER_PHRASES = [
  'please note that', 'it is important to note that', 'it should be noted that', 'needless to say', 'as a matter of fact', 'in fact', 'of course', 'at the end of the day',
];
const INTENSIFIERS = [
  'very', 'really', 'extremely', 'truly', 'absolutely', 'incredibly', 'highly', 'quite', 'just', 'simply', 'actually', 'literally', 'totally', 'completely', 'utterly',
  'super', 'amazingly', 'remarkably', 'exceptionally', 'undoubtedly', 'definitely', 'certainly', 'basically',
];
const CONCISE_RULES: Rule[] = byLength([
  ...DESIGNED_FOR_RULES, ...REPLACEMENTS,
  ...FILLER_PHRASES.map((p) => ({ words: w(p), to: [] as string[] })),
  ...INTENSIFIERS.map((p) => ({ words: [p], to: [] as string[] })),
]);
const TRAILING_PHRASES = ['and so on', 'and so forth', 'and much more', 'and many more', 'and more', 'and the like', 'etc'].map(w).sort((a, b) => b.length - a.length);

function dropTrailingPhrase(tokens: Tok[]): Tok[] {
  for (const p of TRAILING_PHRASES) {
    const n = p.length;
    if (tokens.length <= n) continue;
    const tail = tokens.slice(tokens.length - n);
    if (!tail.every((t, k) => t.key === p[k] && (k === n - 1 || t.trail === ''))) continue;
    const end = tail[n - 1]!.trail;
    const head = tokens.slice(0, tokens.length - n);
    const last = head[head.length - 1]!;
    const base = last.trail.replace(/[,;]+$/, '');
    head[head.length - 1] = { ...last, trail: base === '' ? end : base };
    return head;
  }
  return tokens;
}

/** repeated words ("the the") and repeated two-word clauses ("great value great value") */
function dropRepeats(tokens: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const prev = out[out.length - 1];
    if (prev && t.key !== '' && t.key === prev.key && prev.trail === '' && t.lead === '') {
      out[out.length - 1] = { ...prev, trail: t.trail };
      continue;
    }
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    const next = tokens[i + 1];
    if (a && b && next && t.key !== '' && t.key === a.key && next.key !== '' && next.key === b.key && a.trail === '' && t.trail === '' && b.trail === '' && t.lead === '' && next.lead === '' && next.key !== t.key) {
      out[out.length - 1] = { ...b, trail: next.trail };
      i++;
      continue;
    }
    out.push(t);
  }
  return out;
}

function condenseSentence(sentence: string): string {
  const upper = /^\P{L}*\p{Lu}/u.test(sentence);
  let toks = sentence.split(' ').filter(Boolean).map(parseTok);
  toks = dropTrailingPhrase(dropRepeats(applyRules(toks, CONCISE_RULES)));
  toks = dropRepeats(toks);
  if (toks.length === 0 || toks.every((t) => t.key === '' && !/[\p{L}\p{N}]/u.test(t.core))) return '';
  const out = toks.map(tokText).join(' ');
  return upper ? capitalizeFirst(out) : out;
}

/**
 * Condenses the seller's own text with a closed rule list: filler ("designed for" -> "for", "in order to" -> "to", intensifiers, "please note that"),
 * repeated words / clauses / sentences, trailing "and so on" / "etc.". Only deletes, or replaces by "to", "for", "because", "if", "can", "each".
 * Links, numbers and units are never touched. The result is strictly shorter than the input, otherwise the input is returned unchanged.
 */
export function condenseText(plain: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of plain.replace(/\r\n?/g, '\n').split('\n')) {
    const line = cleanInline(raw);
    if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    const item = /^(- |\d+\. )(.*)$/.exec(line);
    if (item) {
      const text = condenseSentence(item[2]!);
      const key = sentenceKey(text);
      if (!text || !key || seen.has(`b:${key}`)) continue;
      seen.add(`b:${key}`);
      out.push(`${item[1]}${text}`);
      continue;
    }
    const kept: string[] = [];
    for (const sentence of splitSentences(line)) {
      const text = condenseSentence(sentence);
      const key = sentenceKey(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      kept.push(text);
    }
    if (kept.length) out.push(kept.join(' '));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  const result = out.join('\n');
  return [...result].length > 0 && [...result].length < [...plain].length ? result : plain;
}

/** deterministic clean-up of the seller's own text: spacing, repeated punctuation, sentence capitals, duplicates, final full stop, length */
export function rewriteText(plain: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of plain.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    const item = /^(- |\d+\. )(.*)$/.exec(line);
    if (item) {
      const text = capitalizeFirst(refineSentence(tidyFragment(item[2]!)));
      const key = sentenceKey(text);
      if (!text || !key || seen.has(`b:${key}`)) continue;
      seen.add(`b:${key}`);
      out.push(`${item[1]}${text}`);
      continue;
    }
    const kept: string[] = [];
    for (const sentence of splitSentences(tidyFragment(line))) {
      const text = capitalizeFirst(refineSentence(sentence));
      const key = sentenceKey(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      kept.push(text);
    }
    if (kept.length) out.push(endWithPunctuation(kept.join(' ')));
  }
  while (out.length && out[out.length - 1] === '') out.pop();
  return trimToLimit(out.join('\n'));
}

// ------------------------------------------------------------------------------------------------
// plain text <-> html
// ------------------------------------------------------------------------------------------------
/** paragraphs / "- " bullets / "1. " items of a plain text as escaped HTML (everything is escaped; the sanitiser still runs afterwards) */
export function plainToHtml(text: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(escapeHtml).join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flushPara(); closeList(); continue; }
    const bullet = /^- (.*)$/.exec(line);
    const numbered = /^\d+\. (.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${escapeHtml((bullet ?? numbered)![1]!)}</li>`);
      continue;
    }
    closeList();
    para.push(line);
  }
  flushPara();
  closeList();
  return out.join('');
}

/** canonical plain text + sanitised html of generated text (the sanitiser is the single source of truth for both) */
export function finalizeText(raw: string): { text: string; html: string } {
  const s = sanitizeDescription(plainToHtml(trimToLimit(raw)));
  if (s.length <= DESCRIPTION_MAX_CHARS) return { text: s.text, html: s.html };
  const cut = sanitizeDescription(plainToHtml(trimToLimit(s.text, DESCRIPTION_MAX_CHARS - 50)));
  return { text: cut.text, html: cut.html };
}

// ------------------------------------------------------------------------------------------------
// the rules provider
// ------------------------------------------------------------------------------------------------
export const rulesProvider: DescriptionProvider = {
  name: 'rules',
  generate({ mode, facts, text }) {
    if (mode === 'concise') return cleanInline(text) ? condenseText(text) : conciseText(facts);
    if (mode === 'benefits') return benefitsText(facts);
    return rewriteText(text);
  },
};
