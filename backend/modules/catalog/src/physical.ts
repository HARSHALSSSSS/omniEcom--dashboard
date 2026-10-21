/**
 * Product-level physical data: dimensions and weight. The API accepts display units (cm / mm / in, kg / g / lb) and stores integers
 * (millimetres, grams). Conversion is exact: the JSON number is read as the decimal it prints as (no binary floating point), multiplied by an
 * exact rational factor and rounded half up with BigInt arithmetic, so 25.4 mm == 1 in, 0.05 cm == 1 mm and re-saving a value that was read
 * back from the API never drifts.
 */
export const DIMENSION_UNITS = ['cm', 'mm', 'in'] as const;
export const WEIGHT_UNITS = ['kg', 'g', 'lb'] as const;
export type DimensionUnit = (typeof DIMENSION_UNITS)[number];
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const MAX_DIMENSION_MM = 100_000;
export const MAX_WEIGHT_GRAMS = 10_000_000;

export type PhysicalFailure = { ok: false; code: 'not_a_number' | 'not_positive' | 'too_small' | 'too_large' | 'bad_unit'; message: string };
export type PhysicalResult = { ok: true; value: number } | PhysicalFailure;

/** exact rational factor to the canonical unit: canonical = value * num / den */
const TO_MM: Record<DimensionUnit, [bigint, bigint]> = { mm: [1n, 1n], cm: [10n, 1n], in: [254n, 10n] };
const TO_GRAMS: Record<WeightUnit, [bigint, bigint]> = { g: [1n, 1n], kg: [1000n, 1n], lb: [45_359_237n, 100_000n] };

/** reads a finite positive number as an exact decimal: value = digits / 10^scale */
function parseDecimal(n: number): { digits: bigint; scale: number } | null {
  const m = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(n));
  if (!m) return null;
  const frac = m[2] ?? '';
  const exp = m[3] ? parseInt(m[3], 10) : 0;
  let digits = BigInt(m[1]! + frac);
  let scale = frac.length - exp;
  if (scale < 0) { digits *= 10n ** BigInt(-scale); scale = 0; }
  return { digits, scale };
}

function convert(value: unknown, factor: [bigint, bigint], max: number, label: string, unit: string): PhysicalResult {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { ok: false, code: 'not_a_number', message: `${label} must be a finite number` };
  if (value <= 0) return { ok: false, code: 'not_positive', message: `${label} must be greater than 0` };
  if (value > 1e15) return { ok: false, code: 'too_large', message: `${label} is too large` };
  if (value < 1e-9) return { ok: false, code: 'too_small', message: `${label} is too small to store (the smallest unit is 1 ${unit === 'in' || unit === 'cm' || unit === 'mm' ? 'mm' : 'g'})` };
  const d = parseDecimal(value);
  if (!d) return { ok: false, code: 'not_a_number', message: `${label} must be a finite number` };
  const den = 10n ** BigInt(d.scale) * factor[1];
  const stored = (2n * d.digits * factor[0] + den) / (2n * den); // round half up
  if (stored < 1n) return { ok: false, code: 'too_small', message: `${label} is below the smallest storable value (1 ${unit === 'in' || unit === 'cm' || unit === 'mm' ? 'mm' : 'g'})` };
  if (stored > BigInt(max)) return { ok: false, code: 'too_large', message: `${label} is above the maximum (${max.toLocaleString('en-US')} ${unit === 'in' || unit === 'cm' || unit === 'mm' ? 'mm' : 'g'})` };
  return { ok: true, value: Number(stored) };
}

export function toMillimetres(value: unknown, unit: string, label = 'value'): PhysicalResult {
  if (!(DIMENSION_UNITS as readonly string[]).includes(unit)) return { ok: false, code: 'bad_unit', message: `unit must be one of ${DIMENSION_UNITS.join(', ')}` };
  return convert(value, TO_MM[unit as DimensionUnit], MAX_DIMENSION_MM, label, unit);
}

export function toGrams(value: unknown, unit: string, label = 'value'): PhysicalResult {
  if (!(WEIGHT_UNITS as readonly string[]).includes(unit)) return { ok: false, code: 'bad_unit', message: `unit must be one of ${WEIGHT_UNITS.join(', ')}` };
  return convert(value, TO_GRAMS[unit as WeightUnit], MAX_WEIGHT_GRAMS, label, unit);
}

const round = (x: number, decimals: number) => { const f = 10 ** decimals; return Math.round(x * f) / f; };

/** display value of a stored length. cm and mm are exact; inches are rounded to 3 decimals, which always converts back to the same millimetres */
export function fromMillimetres(mm: number, unit: DimensionUnit): number {
  return unit === 'mm' ? mm : unit === 'cm' ? mm / 10 : round(mm / 25.4, 3);
}
/** display value of a stored weight. g and kg are exact; pounds are rounded to 4 decimals, which always converts back to the same grams */
export function fromGrams(g: number, unit: WeightUnit): number {
  return unit === 'g' ? g : unit === 'kg' ? g / 1000 : round(g / 453.592_37, 4);
}

export interface FieldProblem { field: string; code: string; message: string }
export interface DimensionsInput { length: number; width: number; height: number; unit?: string }
export interface WeightInput { value: number; unit?: string }
export interface DimensionsMm { length: number; width: number; height: number }

export type Normalized<T> = { value: T | null | undefined; issues: FieldProblem[] };

/** undefined = not sent (keep), null = clear, object = all three sides converted to integer millimetres */
export function normalizeDimensions(input: DimensionsInput | null | undefined, path = 'dimensions'): Normalized<DimensionsMm> {
  if (input === undefined) return { value: undefined, issues: [] };
  if (input === null) return { value: null, issues: [] };
  const unit = input.unit ?? 'cm';
  const issues: FieldProblem[] = [];
  const out: Partial<DimensionsMm> = {};
  if (!(DIMENSION_UNITS as readonly string[]).includes(unit)) issues.push({ field: `${path}.unit`, code: 'bad_unit', message: `unit must be one of ${DIMENSION_UNITS.join(', ')}` });
  else {
    for (const side of ['length', 'width', 'height'] as const) {
      const r = toMillimetres(input[side], unit, side);
      if (r.ok) out[side] = r.value;
      else issues.push({ field: `${path}.${side}`, code: r.code, message: r.message });
    }
  }
  return issues.length ? { value: undefined, issues } : { value: out as DimensionsMm, issues };
}

export function normalizeWeight(input: WeightInput | null | undefined, path = 'weight'): Normalized<number> {
  if (input === undefined) return { value: undefined, issues: [] };
  if (input === null) return { value: null, issues: [] };
  const unit = input.unit ?? 'kg';
  const r = toGrams(input.value, unit, 'weight');
  return r.ok ? { value: r.value, issues: [] } : { value: undefined, issues: [{ field: r.code === 'bad_unit' ? `${path}.unit` : `${path}.value`, code: r.code, message: r.message }] };
}

export const displayDimensions = (mm: { lengthMm: number | null; widthMm: number | null; heightMm: number | null }) =>
  mm.lengthMm != null && mm.widthMm != null && mm.heightMm != null
    ? { length: fromMillimetres(mm.lengthMm, 'cm'), width: fromMillimetres(mm.widthMm, 'cm'), height: fromMillimetres(mm.heightMm, 'cm'), unit: 'cm' as const }
    : null;

export const canonicalDimensions = (mm: { lengthMm: number | null; widthMm: number | null; heightMm: number | null }): DimensionsMm | null =>
  mm.lengthMm != null && mm.widthMm != null && mm.heightMm != null ? { length: mm.lengthMm, width: mm.widthMm, height: mm.heightMm } : null;

export const displayWeight = (grams: number | null) => (grams != null ? { value: fromGrams(grams, 'kg'), unit: 'kg' as const } : null);
