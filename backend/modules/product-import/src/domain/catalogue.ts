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
  /** a marketplace catalogue of at most this many products is read inside the request; larger ones run as a job */
  marketplaceInlineProducts: 100,
  /** the activity feed keeps the newest events of a session only */
  activityEvents: 300,
  /** at most this many per-row events are recorded by one validation / commit run */
  activityRowEventsPerRun: 150,
  revalidationChanges: 200,
} as const;

export const DUPLICATE_STRATEGIES = ['skip', 'update', 'create_variant_for_new_sku', 'ask', 'create_new'] as const;
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number];
export const CURRENCY_UNITS = ['rupees', 'paise'] as const;
export type CurrencyUnit = (typeof CURRENCY_UNITS)[number];

export const DUPLICATE_STRATEGY_INFO: Record<DuplicateStrategy, { label: string; description: string }> = {
  skip: { label: 'Skip existing', description: 'Rows whose SKU or product code already exists in the catalogue are left untouched.' },
  update: { label: 'Update existing', description: 'Existing products and SKUs are updated with the non-empty values of the file; new SKUs of an existing product become new variants. A stock column is applied as a stock count.' },
  create_variant_for_new_sku: { label: 'Add new variants', description: 'A new SKU under an existing product code becomes a variant of that product; SKUs that already exist are left untouched.' },
  ask: { label: 'Ask me for each duplicate', description: 'Every row whose SKU already exists becomes a "Duplicate SKU" issue showing the existing product; you choose "use existing" (update it) or "create new" (a new product with a unique SKU) per row.' },
  create_new: { label: 'Create new products', description: 'Rows whose SKU already exists are created as new products with a generated unique SKU suffix; nothing existing is touched.' },
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

export const ISSUE_ACTIONS = ['accept_suggestion', 'custom_value', 'ignore', 'use_existing', 'create_new'] as const;
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
  /** duplicate_sku against the catalogue: the master product/variant the row collides with */
  existing?: ExistingInfo;
  /** how sure the importer is that the proposal is what the seller wants */
  confidence?: 'high' | 'medium' | 'low';
  confidenceReason?: string;
}

/** server-owned copy of the review screen: why an issue matters and what happens to the row if it is left open */
export function issueCopy(code: string, field: string | null): { whyItMatters: string; impact: string } {
  switch (code) {
    case 'missing_sku': return { whyItMatters: 'The SKU is the key that stock, orders and marketplace listings use to find this product. Without one it cannot be created.', impact: 'The row is not imported until it has a unique SKU.' };
    case 'invalid_sku': return { whyItMatters: 'Marketplaces and warehouse labels reject SKUs with spaces or special characters, so the product could not be listed or picked.', impact: 'The row is not imported until the SKU only uses letters, digits and . _ - /.' };
    case 'duplicate_sku': return { whyItMatters: 'Two products with one SKU would share stock and orders, so the wrong item could be shipped or oversold.', impact: 'The row is held back until you update the existing product or create a new one with a unique SKU.' };
    case 'missing_title': return { whyItMatters: 'The title is what customers read on every marketplace; listings without one are rejected.', impact: 'The row is not imported until it has a product title.' };
    case 'category_unmapped': return { whyItMatters: 'Category drives marketplace attributes, GST defaults and reports. An unknown category leaves the product uncategorised.', impact: 'The row can still be imported; it uses the default category, or none, and will need a category before it can be listed.' };
    case 'invalid_image': return { whyItMatters: 'Listings with a broken image link show a blank picture or are rejected by marketplaces, which hurts conversion.', impact: 'The row can be imported without this image; the product will wait for an image before it is listed.' };
    case 'duplicate_barcode': return { whyItMatters: 'A barcode identifies one item at the packing bench and on marketplaces; a shared barcode makes scans pick the wrong product.', impact: 'The row is held back until the barcode is unique or left empty.' };
    case 'invalid_barcode': return { whyItMatters: 'Scanners and marketplace catalogues only accept valid EAN/UPC style codes, so this value would never match.', impact: 'The row is not imported until the barcode is valid or left empty.' };
    case 'pricing_invalid':
      if (field === 'mrp') return { whyItMatters: 'The MRP is the legal ceiling for the selling price in India; a price above it can get listings blocked.', impact: 'The row is not imported until the MRP is at least the selling price.' };
      if (field === 'costPrice') return { whyItMatters: 'Cost price feeds margin reports; a cost above the selling price means every sale loses money.', impact: 'The row can be imported, but margin reports will show a loss for it.' };
      return { whyItMatters: 'A missing or zero selling price would list the product for free or not at all.', impact: 'The row is not imported until it has a valid selling price.' };
    case 'stock_invalid': return { whyItMatters: 'Opening stock sets what you can sell. A wrong number oversells or hides stock on every channel.', impact: 'Stock for this row is not received until the quantity is a whole number of zero or more.' };
    case 'missing_warehouse': return { whyItMatters: 'Stock has to be received into a warehouse so it can be reserved for orders.', impact: 'Rows with stock cannot be imported until a warehouse is chosen.' };
    case 'commit_failed': return { whyItMatters: 'The catalogue rejected this row while it was being created, so nothing of it was saved.', impact: 'The row stays out of the catalogue; fix the cause and import it again.' };
    case 'invalid_field':
      if (field === 'title') return { whyItMatters: 'The title is shown on every marketplace and has length and character rules.', impact: 'The row is not imported until the title is valid.' };
      if (field === 'gstRate' || field === 'hsn') return { whyItMatters: 'HSN and GST rate go on every tax invoice; wrong values cause filing errors.', impact: 'The row is not imported until the tax value is valid.' };
      return { whyItMatters: `The value in "${field ?? 'this column'}" does not follow the catalogue rules, so it cannot be saved as it is.`, impact: 'The row is not imported until the value is corrected.' };
    default: return { whyItMatters: 'This value does not meet the catalogue rules.', impact: 'The row may be held back until it is fixed.' };
  }
}

/** the catalogue side of a "CSV SKU vs existing master product" comparison */
export interface ExistingInfo {
  id: string;
  productId: string;
  variantId: string;
  productCode: string;
  sku: string;
  title: string | null;
  /** selling price in rupees */
  price: number | null;
  barcode: string | null;
}
