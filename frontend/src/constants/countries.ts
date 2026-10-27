/**
 * ONE complete ISO 3166-1 country list (alpha-2 code + name) for every country control of the app. The API stores the alpha-2 code
 * (for example "IN"); older records may hold a name or a lower-case code, which `countryCodeFor` resolves for display without ever rewriting them.
 * The same list the backend validates against (backend/modules/catalog/src/countries.ts).
 */
const RAW: Array<[string, string]> = [
  ['AF', 'Afghanistan'], ['AX', 'Aland Islands'], ['AL', 'Albania'], ['DZ', 'Algeria'], ['AS', 'American Samoa'], ['AD', 'Andorra'], ['AO', 'Angola'], ['AI', 'Anguilla'],
  ['AQ', 'Antarctica'], ['AG', 'Antigua and Barbuda'], ['AR', 'Argentina'], ['AM', 'Armenia'], ['AW', 'Aruba'], ['AU', 'Australia'], ['AT', 'Austria'], ['AZ', 'Azerbaijan'],
  ['BS', 'Bahamas'], ['BH', 'Bahrain'], ['BD', 'Bangladesh'], ['BB', 'Barbados'], ['BY', 'Belarus'], ['BE', 'Belgium'], ['BZ', 'Belize'], ['BJ', 'Benin'],
  ['BM', 'Bermuda'], ['BT', 'Bhutan'], ['BO', 'Bolivia'], ['BQ', 'Bonaire, Sint Eustatius and Saba'], ['BA', 'Bosnia and Herzegovina'], ['BW', 'Botswana'], ['BV', 'Bouvet Island'],
  ['BR', 'Brazil'], ['IO', 'British Indian Ocean Territory'], ['BN', 'Brunei'], ['BG', 'Bulgaria'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'], ['CV', 'Cabo Verde'],
  ['KH', 'Cambodia'], ['CM', 'Cameroon'], ['CA', 'Canada'], ['KY', 'Cayman Islands'], ['CF', 'Central African Republic'], ['TD', 'Chad'], ['CL', 'Chile'], ['CN', 'China'],
  ['CX', 'Christmas Island'], ['CC', 'Cocos (Keeling) Islands'], ['CO', 'Colombia'], ['KM', 'Comoros'], ['CG', 'Congo'], ['CD', 'Congo (Democratic Republic)'],
  ['CK', 'Cook Islands'], ['CR', 'Costa Rica'], ['CI', 'Cote d\'Ivoire'], ['HR', 'Croatia'], ['CU', 'Cuba'], ['CW', 'Curacao'], ['CY', 'Cyprus'], ['CZ', 'Czechia'],
  ['DK', 'Denmark'], ['DJ', 'Djibouti'], ['DM', 'Dominica'], ['DO', 'Dominican Republic'], ['EC', 'Ecuador'], ['EG', 'Egypt'], ['SV', 'El Salvador'], ['GQ', 'Equatorial Guinea'],
  ['ER', 'Eritrea'], ['EE', 'Estonia'], ['SZ', 'Eswatini'], ['ET', 'Ethiopia'], ['FK', 'Falkland Islands'], ['FO', 'Faroe Islands'], ['FJ', 'Fiji'], ['FI', 'Finland'],
  ['FR', 'France'], ['GF', 'French Guiana'], ['PF', 'French Polynesia'], ['TF', 'French Southern Territories'], ['GA', 'Gabon'], ['GM', 'Gambia'], ['GE', 'Georgia'],
  ['DE', 'Germany'], ['GH', 'Ghana'], ['GI', 'Gibraltar'], ['GR', 'Greece'], ['GL', 'Greenland'], ['GD', 'Grenada'], ['GP', 'Guadeloupe'], ['GU', 'Guam'], ['GT', 'Guatemala'],
  ['GG', 'Guernsey'], ['GN', 'Guinea'], ['GW', 'Guinea-Bissau'], ['GY', 'Guyana'], ['HT', 'Haiti'], ['HM', 'Heard Island and McDonald Islands'], ['VA', 'Holy See'],
  ['HN', 'Honduras'], ['HK', 'Hong Kong'], ['HU', 'Hungary'], ['IS', 'Iceland'], ['IN', 'India'], ['ID', 'Indonesia'], ['IR', 'Iran'], ['IQ', 'Iraq'], ['IE', 'Ireland'],
  ['IM', 'Isle of Man'], ['IL', 'Israel'], ['IT', 'Italy'], ['JM', 'Jamaica'], ['JP', 'Japan'], ['JE', 'Jersey'], ['JO', 'Jordan'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'],
  ['KI', 'Kiribati'], ['KP', 'Korea (North)'], ['KR', 'Korea (South)'], ['KW', 'Kuwait'], ['KG', 'Kyrgyzstan'], ['LA', 'Laos'], ['LV', 'Latvia'], ['LB', 'Lebanon'],
  ['LS', 'Lesotho'], ['LR', 'Liberia'], ['LY', 'Libya'], ['LI', 'Liechtenstein'], ['LT', 'Lithuania'], ['LU', 'Luxembourg'], ['MO', 'Macao'], ['MG', 'Madagascar'],
  ['MW', 'Malawi'], ['MY', 'Malaysia'], ['MV', 'Maldives'], ['ML', 'Mali'], ['MT', 'Malta'], ['MH', 'Marshall Islands'], ['MQ', 'Martinique'], ['MR', 'Mauritania'],
  ['MU', 'Mauritius'], ['YT', 'Mayotte'], ['MX', 'Mexico'], ['FM', 'Micronesia'], ['MD', 'Moldova'], ['MC', 'Monaco'], ['MN', 'Mongolia'], ['ME', 'Montenegro'],
  ['MS', 'Montserrat'], ['MA', 'Morocco'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'], ['NA', 'Namibia'], ['NR', 'Nauru'], ['NP', 'Nepal'], ['NL', 'Netherlands'],
  ['NC', 'New Caledonia'], ['NZ', 'New Zealand'], ['NI', 'Nicaragua'], ['NE', 'Niger'], ['NG', 'Nigeria'], ['NU', 'Niue'], ['NF', 'Norfolk Island'], ['MK', 'North Macedonia'],
  ['MP', 'Northern Mariana Islands'], ['NO', 'Norway'], ['OM', 'Oman'], ['PK', 'Pakistan'], ['PW', 'Palau'], ['PS', 'Palestine'], ['PA', 'Panama'], ['PG', 'Papua New Guinea'],
  ['PY', 'Paraguay'], ['PE', 'Peru'], ['PH', 'Philippines'], ['PN', 'Pitcairn'], ['PL', 'Poland'], ['PT', 'Portugal'], ['PR', 'Puerto Rico'], ['QA', 'Qatar'], ['RE', 'Reunion'],
  ['RO', 'Romania'], ['RU', 'Russia'], ['RW', 'Rwanda'], ['BL', 'Saint Barthelemy'], ['SH', 'Saint Helena, Ascension and Tristan da Cunha'], ['KN', 'Saint Kitts and Nevis'],
  ['LC', 'Saint Lucia'], ['MF', 'Saint Martin (French part)'], ['PM', 'Saint Pierre and Miquelon'], ['VC', 'Saint Vincent and the Grenadines'], ['WS', 'Samoa'],
  ['SM', 'San Marino'], ['ST', 'Sao Tome and Principe'], ['SA', 'Saudi Arabia'], ['SN', 'Senegal'], ['RS', 'Serbia'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'],
  ['SG', 'Singapore'], ['SX', 'Sint Maarten (Dutch part)'], ['SK', 'Slovakia'], ['SI', 'Slovenia'], ['SB', 'Solomon Islands'], ['SO', 'Somalia'], ['ZA', 'South Africa'],
  ['GS', 'South Georgia and the South Sandwich Islands'], ['SS', 'South Sudan'], ['ES', 'Spain'], ['LK', 'Sri Lanka'], ['SD', 'Sudan'], ['SR', 'Suriname'],
  ['SJ', 'Svalbard and Jan Mayen'], ['SE', 'Sweden'], ['CH', 'Switzerland'], ['SY', 'Syria'], ['TW', 'Taiwan'], ['TJ', 'Tajikistan'], ['TZ', 'Tanzania'], ['TH', 'Thailand'],
  ['TL', 'Timor-Leste'], ['TG', 'Togo'], ['TK', 'Tokelau'], ['TO', 'Tonga'], ['TT', 'Trinidad and Tobago'], ['TN', 'Tunisia'], ['TR', 'Turkey'], ['TM', 'Turkmenistan'],
  ['TC', 'Turks and Caicos Islands'], ['TV', 'Tuvalu'], ['UG', 'Uganda'], ['UA', 'Ukraine'], ['AE', 'United Arab Emirates'], ['GB', 'United Kingdom'], ['US', 'United States'],
  ['UM', 'United States Minor Outlying Islands'], ['UY', 'Uruguay'], ['UZ', 'Uzbekistan'], ['VU', 'Vanuatu'], ['VE', 'Venezuela'], ['VN', 'Vietnam'],
  ['VG', 'Virgin Islands (British)'], ['VI', 'Virgin Islands (U.S.)'], ['WF', 'Wallis and Futuna'], ['EH', 'Western Sahara'], ['YE', 'Yemen'], ['ZM', 'Zambia'], ['ZW', 'Zimbabwe'],
];

export interface Country { code: string; name: string }

const BY_CODE = new Map<string, string>(RAW);
const BY_NAME = new Map<string, string>(RAW.map(([code, name]) => [name.toLowerCase(), code]));

/** India first (the main market), then A-Z by name */
export const COUNTRIES: readonly Country[] = Object.freeze([
  { code: "IN", name: BY_CODE.get("IN") ?? "India" },
  ...RAW.filter(([code]) => code !== "IN").map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, "en")),
]);

export const isCountryCode = (code: string): boolean => BY_CODE.has(code);

/** the country name of a stored value (code or name); null when it is not a known country */
export function countryName(value: string | null | undefined): string | null {
  const code = countryCodeFor(value);
  return code ? (BY_CODE.get(code) ?? null) : null;
}

/** the alpha-2 code a stored value stands for (a code in any case, or a country name); null when unknown */
export function countryCodeFor(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (BY_CODE.has(upper)) return upper;
  return BY_NAME.get(v.toLowerCase()) ?? null;
}

/** the options of a country control: every country, plus the stored value when it is not in the list so that nothing is lost */
export function countryOptions(stored?: string | null): Country[] {
  const v = (stored ?? "").trim();
  if (!v || countryCodeFor(v)) return [...COUNTRIES];
  return [{ code: v, name: v }, ...COUNTRIES];
}

/** a workspace in India (INR or an Indian time zone) opens country controls on India; others have no default */
export function defaultCountryCode(business: { currency?: string; timezone?: string } | null | undefined): string | null {
  if (!business) return null;
  return business.currency === "INR" || business.timezone === "Asia/Kolkata" || business.timezone === "Asia/Calcutta" ? "IN" : null;
}
