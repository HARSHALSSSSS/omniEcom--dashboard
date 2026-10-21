/**
 * What the import wizard knows about the product model: the target fields a column can be mapped to, the header
 * dialects it recognises (Shopify product export, Amazon inventory loader) and the issue vocabulary of the review step.
 * Pure data, shared by the auto-mapper, the validator and `GET /imports/options`.
 */
export const LIMITS = {
  maxBytes: 25 * 1024 * 1024,
  maxRows: 10_000,
  maxColumns: 200,
  maxCellChars: 5_000,
  previewRows: 10,
  /** a re-validation of at most this many rows runs inside the request instead of a job */
  inlineRevalidateRows: 1_000,
} as const;

export const DUPLICATE_STRATEGIES = ['skip', 'update', 'create_variant_for_new_sku'] as const;
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number];
export const CURRENCY_UNITS = ['rupees', 'paise'] as const;
export type CurrencyUnit = (typeof CURRENCY_UNITS)[number];

export const DUPLICATE_STRATEGY_INFO: Record<DuplicateStrategy, { label: string; description: string }> = {
  skip: { label: 'Skip existing', description: 'Rows whose SKU or product code already exists in the catalogue are left untouched.' },
  update: { label: 'Update existing', description: 'Existing products and SKUs are updated with the non-empty values of the file; new SKUs of an existing product become new variants. A stock column is applied as a stock count.' },
  create_variant_for_new_sku: { label: 'Add new variants', description: 'A new SKU under an existing product code becomes a variant of that product; SKUs that already exist are left untouched.' },
};

export type FieldGroup = 'identity' | 'content' | 'pricing' | 'inventory' | 'media' | 'taxonomy' | 'variants';

export interface TargetField {
  key: string;
  label: string;
  group: FieldGroup;
  required: boolean;
  /** not blocking, but a product without it is rarely ready to list */
  recommended: boolean;
  example: string;
  description: string;
  /** alternative header spellings (compared after lower-casing and dropping everything but letters and digits) */
  aliases: string[];
}

const f = (key: string, label: string, group: FieldGroup, example: string, description: string, aliases: string[], flags: { required?: boolean; recommended?: boolean } = {}): TargetField => ({
  key, label, group, example, description, aliases, required: flags.required ?? false, recommended: flags.recommended ?? false,
});

export const TARGET_FIELDS: readonly TargetField[] = [
  f('sku', 'SKU', 'identity', 'TRV-1042-S', 'Your unique stock keeping unit (letters, digits and . _ - /).', ['skucode', 'itemsku', 'sellersku', 'variantsku', 'merchantsku', 'productsku', 'articlenumber', 'itemcode', 'partnumber', 'sellerskuid'], { required: true }),
  f('productCode', 'Product code (groups variants)', 'identity', 'TRV-1042', 'Rows with the same code become variants of one product. Defaults to the SKU.', ['productcode', 'stylecode', 'parentsku', 'handle', 'mastersku', 'masterproductcode', 'groupid', 'parentid']),
  f('title', 'Product title', 'content', 'Traverse All-Weather Travel Jacket', 'Name shown on marketplaces.', ['productname', 'name', 'itemname', 'producttitle', 'productnamefull', 'listingtitle'], { required: true }),
  f('description', 'Description', 'content', 'Lightweight, water resistant jacket ...', 'Plain text or HTML (sanitised).', ['bodyhtml', 'productdescription', 'longdescription', 'details', 'body', 'shortdescription']),
  f('brand', 'Brand', 'content', 'Traverse', 'Brand name.', ['brandname', 'vendor', 'brandvendor']),
  f('manufacturer', 'Manufacturer', 'content', 'Traverse Apparel Pvt Ltd', 'Manufacturer or packer.', ['manufacturername', 'maker', 'packer']),
  f('countryOfOrigin', 'Country of origin', 'content', 'IN', 'ISO country code (IN, CN, ...).', ['origincountry', 'madein', 'countryofmanufacture', 'origin', 'country']),
  f('tags', 'Tags', 'content', 'travel|jacket|monsoon', 'Separated by | , or ;', ['keywords', 'searchterms', 'labels']),
  f('category', 'Category', 'taxonomy', 'Men > Outerwear', 'Category name, path (A > B), slug or id of one of your categories.', ['categorypath', 'categoryl3', 'categoryname', 'producttype', 'type', 'itemtype', 'productcategory', 'department', 'categories', 'feedproducttype'], { recommended: true }),
  f('sellingPrice', 'Selling price', 'pricing', '3499', 'Price customers pay (rupees or paise, see the settings).', ['sellingprice', 'price', 'saleprice', 'retailprice', 'variantprice', 'standardprice', 'ourprice', 'offerprice', 'sellprice', 'sp'], { required: true }),
  f('mrp', 'MRP', 'pricing', '4999', 'Maximum retail price; the selling price cannot exceed it.', ['mrp', 'mrpprice', 'maximumretailprice', 'listprice', 'compareatprice', 'variantcompareatprice', 'msrp']),
  f('costPrice', 'Cost price', 'pricing', '2100', 'What you pay for one unit (used for margins).', ['cost', 'costperitem', 'purchaseprice', 'buyingprice', 'unitcost', 'cp']),
  f('hsn', 'HSN code', 'pricing', '6203', '4, 6 or 8 digits.', ['hsncode', 'hsnsac', 'harmonizedcode', 'variantharmonizedsystemcode']),
  f('gstRate', 'GST rate (%)', 'pricing', '12', 'Percent, for example 5, 12 or 18.', ['gst', 'gstpercent', 'taxrate', 'tax', 'gstrateinpercent', 'igst']),
  f('stock', 'Stock quantity', 'inventory', '120', 'Units on hand in the import warehouse.', ['quantity', 'qty', 'inventoryqty', 'variantinventoryqty', 'inventory', 'stockquantity', 'availablequantity', 'onhand', 'inventoryquantity', 'openingstock']),
  f('barcode', 'Barcode (EAN/UPC)', 'inventory', '8901234567890', 'Unique per business.', ['ean', 'upc', 'gtin', 'barcodeean', 'variantbarcode', 'externalproductid', 'isbn']),
  f('weight', 'Weight (grams)', 'inventory', '450', 'Grams; "0.5 kg" is understood too.', ['weightgrams', 'variantgrams', 'grams', 'itemweight', 'weightg']),
  f('imageUrl', 'Primary image URL', 'media', 'https://cdn.example.com/p1.jpg', 'http(s) address; it is checked for syntax only and never fetched.', ['image', 'primaryimageurl', 'imagesrc', 'mainimageurl', 'image1', 'imagelink', 'picture', 'photo', 'imageurl1'], { recommended: true }),
  f('additionalImageUrls', 'More image URLs', 'media', 'https://cdn.example.com/p1b.jpg|https://cdn.example.com/p1c.jpg', 'Separated by | or whitespace.', ['additionalimages', 'otherimageurls', 'images', 'imageurls', 'otherimageurl1', 'additionalimageurls', 'imageurl2']),
  f('option1Name', 'Option 1 name', 'variants', 'Size', 'Variant axis, e.g. Size.', ['option1name', 'optionname1', 'variationtheme']),
  f('option1Value', 'Option 1 value', 'variants', 'M', 'Value of the first axis.', ['option1value', 'optionvalue1', 'size']),
  f('option2Name', 'Option 2 name', 'variants', 'Colour', 'Second variant axis.', ['option2name', 'optionname2']),
  f('option2Value', 'Option 2 value', 'variants', 'Navy', 'Value of the second axis.', ['option2value', 'optionvalue2', 'color', 'colour']),
  f('option3Name', 'Option 3 name', 'variants', 'Material', 'Third variant axis.', ['option3name', 'optionname3']),
  f('option3Value', 'Option 3 value', 'variants', 'Cotton', 'Value of the third axis.', ['option3value', 'optionvalue3']),
];

export const TARGET_BY_KEY: ReadonlyMap<string, TargetField> = new Map(TARGET_FIELDS.map((t) => [t.key, t]));
export const REQUIRED_TARGETS: readonly string[] = TARGET_FIELDS.filter((t) => t.required).map((t) => t.key);

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export type PresetCode = 'shopify' | 'amazon' | 'generic';

export interface Preset {
  code: PresetCode;
  label: string;
  description: string;
  /** normalised header -> target field */
  headers: Record<string, string>;
  /** normalised headers that identify the dialect */
  signature: string[];
}

const p = (map: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(map).map(([h, t]) => [norm(h), t]));

export const PRESETS: readonly Preset[] = [
  {
    code: 'shopify', label: 'Shopify product export', description: 'Products CSV exported from the Shopify admin: one row per variant, extra image rows share the handle.',
    signature: ['handle', 'variantsku', 'variantprice', 'option1name', 'bodyhtml', 'imagesrc'].map(norm),
    headers: p({
      Handle: 'productCode', Title: 'title', 'Body (HTML)': 'description', Vendor: 'brand', 'Product Category': 'category', Type: 'category', Tags: 'tags',
      'Option1 Name': 'option1Name', 'Option1 Value': 'option1Value', 'Option2 Name': 'option2Name', 'Option2 Value': 'option2Value', 'Option3 Name': 'option3Name', 'Option3 Value': 'option3Value',
      'Variant SKU': 'sku', 'Variant Grams': 'weight', 'Variant Inventory Qty': 'stock', 'Variant Price': 'sellingPrice', 'Variant Compare At Price': 'mrp', 'Variant Barcode': 'barcode',
      'Image Src': 'imageUrl', 'Cost per item': 'costPrice', 'Variant Tax Code': 'hsn',
    }),
  },
  {
    code: 'amazon', label: 'Amazon inventory loader', description: 'Inventory file / flat file from Seller Central (item_sku, item_name, standard_price ...).',
    signature: ['item_sku', 'item_name', 'standard_price', 'main_image_url', 'external_product_id', 'feed_product_type'].map(norm),
    headers: p({
      item_sku: 'sku', 'seller-sku': 'sku', item_name: 'title', product_description: 'description', brand_name: 'brand', manufacturer: 'manufacturer', standard_price: 'sellingPrice',
      list_price: 'mrp', maximum_retail_price: 'mrp', quantity: 'stock', external_product_id: 'barcode', main_image_url: 'imageUrl', other_image_url1: 'additionalImageUrls',
      item_type: 'category', feed_product_type: 'category', country_of_origin: 'countryOfOrigin', parent_sku: 'productCode', hsn_code: 'hsn', generic_keywords: 'tags',
    }),
  },
  { code: 'generic', label: 'Generic CSV / Excel', description: 'Any spreadsheet with a header row; columns are matched by name.', signature: [], headers: {} },
];

export const PRESET_BY_CODE: ReadonlyMap<PresetCode, Preset> = new Map(PRESETS.map((x) => [x.code, x]));

// ---------------------------------------------------------------- issues
export const ISSUE_CODES = [
  'missing_sku', 'invalid_sku', 'duplicate_sku', 'missing_title', 'invalid_field', 'category_unmapped', 'invalid_image', 'duplicate_barcode', 'invalid_barcode',
  'pricing_invalid', 'stock_invalid', 'missing_warehouse', 'commit_failed',
] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export const ISSUE_INFO: Record<IssueCode, { title: string; severity: 'error' | 'warning' | 'mixed' }> = {
  missing_sku: { title: 'Missing SKU identifier', severity: 'error' },
  invalid_sku: { title: 'SKU contains unsupported characters', severity: 'error' },
  duplicate_sku: { title: 'Duplicate SKU', severity: 'error' },
  missing_title: { title: 'Missing product title', severity: 'error' },
  invalid_field: { title: 'Invalid value', severity: 'error' },
  category_unmapped: { title: 'Unrecognized category', severity: 'warning' },
  invalid_image: { title: 'Invalid image URL', severity: 'warning' },
  duplicate_barcode: { title: 'Duplicate barcode', severity: 'error' },
  invalid_barcode: { title: 'Invalid barcode', severity: 'error' },
  pricing_invalid: { title: 'Invalid pricing', severity: 'mixed' },
  stock_invalid: { title: 'Invalid stock quantity', severity: 'mixed' },
  missing_warehouse: { title: 'No warehouse for stock', severity: 'error' },
  commit_failed: { title: 'Row could not be imported', severity: 'error' },
};

export const ISSUE_ACTIONS = ['accept_suggestion', 'custom_value', 'ignore'] as const;
export type IssueAction = (typeof ISSUE_ACTIONS)[number];
export type SuggestionKind = 'set_value' | 'map_category' | 'skip_row';

export interface Suggestion {
  kind: SuggestionKind;
  /** target field the value belongs to (set_value, map_category) */
  field?: string;
  /** the replacement, as it would be typed into the file (a category id for map_category) */
  value?: string;
  /** human readable form of the fix, e.g. the category path */
  label?: string;
}
