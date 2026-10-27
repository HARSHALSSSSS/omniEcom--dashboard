import { eq, schema, type Tx } from '@oms/database';
import { Errors } from '@oms/shared';
import { resolveSettings } from '@oms/mod-vendors';

/**
 * The catalog rules a business saved in Settings > Products & Listings. Nothing here is enforced unless the seller opted in:
 * the SKU formula only counts once it was explicitly saved (`skuTemplate` is null otherwise) and the EAN check only when `strictEan` is on.
 */
export interface CatalogRules {
  /** null = the seller never saved a formula: no SKU enforcement */
  skuTemplate: string | null;
  skuSeparator: '-' | '_' | '/';
  skuCasing: 'uppercase' | 'lowercase' | 'as_is';
  strictEan: boolean;
}

export async function loadCatalogRules(tx: Tx, vendorId: string): Promise<CatalogRules> {
  const [v] = await tx.select({ settings: schema.vendors.settings }).from(schema.vendors).where(eq(schema.vendors.id, vendorId));
  const c = resolveSettings(v?.settings).catalog;
  return { skuTemplate: c.skuTemplateSet ? c.skuTemplate : null, skuSeparator: c.skuSeparator, skuCasing: c.skuCasing, strictEan: c.strictEan };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** the SKU formula as a pattern: [BRAND] letters or digits, [CAT3] three letters or digits, [SEQ6] six digits; every "-" of the formula is the chosen separator */
export function skuPattern(template: string, separator: string): RegExp {
  const parts = template.split(/(\[BRAND\]|\[CAT3\]|\[SEQ6\])/);
  const body = parts.map((p) => (p === '[BRAND]' ? '[A-Za-z0-9]+' : p === '[CAT3]' ? '[A-Za-z0-9]{3}' : p === '[SEQ6]' ? '[0-9]{6}' : escape(p.replace(/-/g, separator)))).join('');
  return new RegExp(`^${body}$`);
}

/** why a SKU breaks the saved formula, or null when it follows it (or no formula is enforced) */
export function skuProblem(sku: string, rules: CatalogRules): string | null {
  if (!rules.skuTemplate) return null;
  const shape = `${rules.skuTemplate.replace(/-/g, rules.skuSeparator)} (BRAND letters or digits, CAT3 three letters or digits, SEQ6 six digits)`;
  if (!skuPattern(rules.skuTemplate, rules.skuSeparator).test(sku)) return `The SKU must follow your SKU formula ${shape}.`;
  if (rules.skuCasing === 'uppercase' && sku !== sku.toUpperCase()) return 'The SKU must be in UPPERCASE, as set in your SKU formula rules.';
  if (rules.skuCasing === 'lowercase' && sku !== sku.toLowerCase()) return 'The SKU must be in lowercase, as set in your SKU formula rules.';
  return null;
}

/** GS1 check digit of a GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) */
export function validGtin(code: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** why a barcode breaks the strict EAN rule, or null (rule off, or the barcode is a valid GTIN) */
export function eanProblem(barcode: string, rules: CatalogRules): string | null {
  if (!rules.strictEan) return null;
  return validGtin(barcode.trim()) ? null : 'The barcode must be a valid EAN / UPC: 8, 12, 13 or 14 digits with a correct check digit.';
}

export interface RuleCheck { path: string; kind: 'sku' | 'barcode'; value: string | null | undefined }

/** the first problem of each checked value as a field-level 422 (`details.issues[].path` names the input); empty values are not judged here */
export function assertCatalogRules(rules: CatalogRules, checks: RuleCheck[]): void {
  if (!rules.skuTemplate && !rules.strictEan) return;
  const issues: Array<{ path: string; message: string }> = [];
  for (const c of checks) {
    if (!c.value) continue;
    const message = c.kind === 'sku' ? skuProblem(c.value, rules) : eanProblem(c.value, rules);
    if (message) issues.push({ path: c.path, message });
  }
  if (issues.length) throw Errors.validation({ issues });
}
