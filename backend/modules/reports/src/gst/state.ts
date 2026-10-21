import { stateNameForCode } from '@oms/mod-vendors';

/** Maps what marketplaces and warehouses write in an address (name, abbreviation, ISO code, GST code) to the two digit GST state code. */
const norm = (s: string): string => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

let byName: Map<string, string> | null = null;
const names = (): Map<string, string> => {
  if (byName) return byName;
  const m = new Map<string, string>();
  for (let n = 1; n <= 99; n++) {
    const code = String(n).padStart(2, '0');
    const name = stateNameForCode(code);
    if (name) m.set(norm(name), code);
  }
  const alias: Record<string, string> = {
    orissa: '21', pondicherry: '34', uttaranchal: '05', 'new delhi': '07', 'nct of delhi': '07', 'national capital territory of delhi': '07', 'delhi ncr': '07',
    chattisgarh: '22', telengana: '36', 'andaman nicobar islands': '35', 'andaman and nicobar': '35', 'dadra and nagar haveli': '26', 'daman and diu': '26', 'dadra nagar haveli': '26',
    'jammu kashmir': '01', 'j and k': '01', bengal: '19', 'tamilnadu': '33', 'tamil nadu state': '33',
  };
  for (const [k, v] of Object.entries(alias)) m.set(k, v);
  byName = m;
  return m;
};

const ABBREVIATIONS: Record<string, string> = {
  JK: '01', HP: '02', PB: '03', CH: '04', UK: '05', UT: '05', HR: '06', DL: '07', RJ: '08', UP: '09', BR: '10', SK: '11', AR: '12', NL: '13', MN: '14', MZ: '15', TR: '16', ML: '17', AS: '18', WB: '19',
  JH: '20', OD: '21', OR: '21', CG: '22', CT: '22', MP: '23', GJ: '24', DD: '25', DN: '26', MH: '27', KA: '29', GA: '30', LD: '31', KL: '32', TN: '33', PY: '34', AN: '35', TS: '36', TG: '36', AP: '37', LA: '38',
};

/** the GST state code of an address-like object (`stateCode`, `state`), or null when it cannot be told */
export function stateCodeOf(addr: Record<string, unknown> | null | undefined): string | null {
  if (!addr) return null;
  for (const key of ['stateCode', 'state_code', 'state']) {
    const v = addr[key];
    if (typeof v === 'number') { const c = String(v).padStart(2, '0'); if (stateNameForCode(c)) return c; }
    if (typeof v !== 'string' || !v.trim()) continue;
    const raw = v.trim();
    if (/^\d{1,2}$/.test(raw)) { const c = raw.padStart(2, '0'); if (stateNameForCode(c)) return c; continue; }
    const iso = /^IN[-_ ]?([A-Za-z]{2})$/.exec(raw);
    if (iso) { const c = ABBREVIATIONS[iso[1]!.toUpperCase()]; if (c) return c; }
    if (/^[A-Za-z]{2}$/.test(raw)) { const c = ABBREVIATIONS[raw.toUpperCase()]; if (c) return c; }
    const c = names().get(norm(raw));
    if (c) return c;
  }
  return null;
}
