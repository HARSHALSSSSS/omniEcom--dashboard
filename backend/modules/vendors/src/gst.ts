/** GST domain rules: state code table, GSTIN structure and checksum, PAN extraction. Pure functions, no I/O. */

/** GST state / union territory codes (the first two digits of a GSTIN, also used for the place of supply). */
export const GST_STATES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

/** Name of a GST state code ("27" -> "Maharashtra"); null for codes that do not exist. */
export function stateNameForCode(code: string): string | null {
  const key = String(code).trim();
  return Object.prototype.hasOwnProperty.call(GST_STATES, key) ? GST_STATES[key]! : null;
}

export function listGstStates(): Array<{ code: string; name: string }> {
  return Object.entries(GST_STATES).map(([code, name]) => ({ code, name }));
}

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** Corporate Identification Number: listing status, 5-digit industry code, state, year, ownership type, 6-digit serial. */
export const CIN_PATTERN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The mod-36 check character for the first 14 characters of a GSTIN. */
export function gstinChecksumChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]!);
    if (value < 0) return '';
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36]!;
}

export type GstinProblem = 'format' | 'state_code' | 'checksum';

export interface GstinCheck {
  valid: boolean;
  gstin: string;
  problem?: GstinProblem;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  expectedCheckChar?: string;
}

/** Full GSTIN validation: structure, known state code and the check character. Input is normalised (trim, upper case). */
export function checkGstin(input: string): GstinCheck {
  const gstin = input.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) return { valid: false, gstin, problem: 'format' };
  const stateCode = gstin.slice(0, 2);
  const stateName = stateNameForCode(stateCode);
  if (!stateName) return { valid: false, gstin, problem: 'state_code', stateCode };
  const expected = gstinChecksumChar(gstin.slice(0, 14));
  if (expected !== gstin[14]) return { valid: false, gstin, problem: 'checksum', stateCode, stateName, expectedCheckChar: expected };
  return { valid: true, gstin, stateCode, stateName, pan: gstin.slice(2, 12) };
}

export const GSTIN_PROBLEM_MESSAGE: Record<GstinProblem, string> = {
  format: 'GSTIN must be 15 characters: 2 state digits, the 10 character PAN, an entity number, the letter Z and a check character',
  state_code: 'The first two digits of the GSTIN are not a valid GST state code',
  checksum: 'The GSTIN check character is wrong, please re-check the number',
};
