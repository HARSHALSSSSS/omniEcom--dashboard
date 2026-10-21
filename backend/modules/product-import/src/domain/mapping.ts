import { PRESETS, PRESET_BY_CODE, TARGET_FIELDS, norm, type PresetCode } from './catalogue';

/** Sørensen-Dice coefficient on character bigrams: 1 = identical, 0 = nothing in common. */
export function similarity(a: string, b: string): number {
  const x = norm(a);
  const y = norm(b);
  if (x === '' || y === '') return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < x.length - 1; i++) grams.set(x.slice(i, i + 2), (grams.get(x.slice(i, i + 2)) ?? 0) + 1);
  let overlap = 0;
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) { overlap++; grams.set(g, n - 1); }
  }
  return (2 * overlap) / (x.length + y.length - 2);
}

export interface PresetMatch { code: PresetCode; label: string; confidence: number }

/** Which header dialect the file looks like: the share of the dialect's signature headers present (generic when none fits). */
export function detectPreset(headers: string[]): PresetMatch {
  const have = new Set(headers.map(norm));
  let best: PresetMatch = { code: 'generic', label: PRESET_BY_CODE.get('generic')!.label, confidence: 100 };
  let bestScore = 0;
  for (const preset of PRESETS) {
    if (preset.signature.length === 0) continue;
    const hits = preset.signature.filter((h) => have.has(h)).length;
    const score = hits / preset.signature.length;
    if (hits >= 3 && score > bestScore && score >= 0.5) { bestScore = score; best = { code: preset.code, label: preset.label, confidence: Math.round(score * 100) }; }
  }
  return best;
}

export type MatchMethod = 'exact' | 'preset' | 'alias' | 'contains' | 'fuzzy';
export interface AutoMapEntry { target: string; source: string; confidence: number; method: MatchMethod }

const MIN_CONFIDENCE = 70;

function scoreOf(header: string, targetKey: string, aliases: string[], label: string, presetTarget: string | undefined): { confidence: number; method: MatchMethod } | null {
  const h = norm(header);
  if (h === '') return null;
  if (h === norm(targetKey) || h === norm(label)) return { confidence: 100, method: 'exact' };
  if (presetTarget === targetKey) return { confidence: 98, method: 'preset' };
  if (aliases.includes(h)) return { confidence: 96, method: 'alias' };
  let best: { confidence: number; method: MatchMethod } | null = null;
  for (const alias of aliases) {
    if (alias.length >= 5 && h.length >= 5 && (h.includes(alias) || alias.includes(h))) { best = { confidence: 80, method: 'contains' }; break; }
  }
  if (best) return best;
  let top = 0;
  for (const alias of [norm(targetKey), norm(label), ...aliases]) top = Math.max(top, similarity(h, alias));
  return top >= 0.8 ? { confidence: Math.round(top * 90), method: 'fuzzy' } : null;
}

/**
 * Best one-to-one assignment of source columns to target fields: every (column, field) pair is scored (exact name, header dialect,
 * alias, containment, bigram similarity), then pairs are taken from the highest score down so no column or field is used twice.
 */
export function autoMap(headers: string[], preset: PresetCode): AutoMapEntry[] {
  const dialect = PRESET_BY_CODE.get(preset)?.headers ?? {};
  const pairs: Array<AutoMapEntry & { order: number }> = [];
  headers.forEach((header, col) => {
    TARGET_FIELDS.forEach((field, fi) => {
      const s = scoreOf(header, field.key, field.aliases, field.label, dialect[norm(header)]);
      if (s && s.confidence >= MIN_CONFIDENCE) pairs.push({ target: field.key, source: header, confidence: s.confidence, method: s.method, order: col * 100 + fi });
    });
  });
  pairs.sort((a, b) => b.confidence - a.confidence || a.order - b.order);
  const usedSource = new Set<string>();
  const usedTarget = new Set<string>();
  const out: AutoMapEntry[] = [];
  for (const pair of pairs) {
    if (usedSource.has(pair.source) || usedTarget.has(pair.target)) continue;
    usedSource.add(pair.source);
    usedTarget.add(pair.target);
    out.push({ target: pair.target, source: pair.source, confidence: pair.confidence, method: pair.method });
  }
  return out;
}

export const toMapping = (entries: AutoMapEntry[]): Record<string, string | null> => Object.fromEntries(entries.map((e) => [e.target, e.source]));
