import { Product, ProductsKpiSummary } from "@/types/product";

export const initialMockProducts: Product[] = [
  {
    id: "prod-1",
    sku: "TRV-1042",
    title: "Voyager Pro Ergonomic Travel Backpack 35L",
    brand: "Nova Living",
    category: "Bags & Luggage",
    description: "Water-resistant, TSA-approved travel companion engineered for digital nomads and daily commuters with quick-access laptop compartment.",
    bullets: [
      "Water-repellent 1000D Cordura ballistic nylon exterior",
      "Padded 16-inch MacBook Pro compartment with faux-fur lining",
      "Ergonomic breathable mesh shoulder straps and luggage pass-through",
      "Hidden RFID-blocking passport pocket"
    ],
    status: "active",
    price: 3899,
    mrp: 6499,
    costPrice: 1650,
    taxRatePercent: 18,
    hsnCode: "42021290",
    stock: 14,
    reservedStock: 3,
    availableStock: 11,
    coverDays: 5,
    readinessScore: 100,
    blockers: [],
    media: [
      { id: "m-1", url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Front view backpack" },
      { id: "m-2", url: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=600&q=80", isPrimary: false, altText: "Interior compartments" },
    ],
    variants: [
      {
        id: "var-1-1",
        productId: "prod-1",
        sku: "TRV-1042-BLK",
        title: "Voyager Pro Backpack - Stealth Black",
        options: { Color: "Stealth Black", Capacity: "35L" },
        price: 3899,
        mrp: 6499,
        inventory: 8,
        status: "active",
      },
      {
        id: "var-1-2",
        productId: "prod-1",
        sku: "TRV-1042-OLV",
        title: "Voyager Pro Backpack - Olive Drab",
        options: { Color: "Olive Drab", Capacity: "35L" },
        price: 3899,
        mrp: 6499,
        inventory: 6,
        status: "active",
      }
    ],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "live", marketplaceSku: "B09TRV1042", price: 3899, stock: 14, lastSyncedAt: "2026-10-15T12:30:00Z" },
      { channelId: "ch-fk", channelName: "Flipkart", status: "live", marketplaceSku: "FK-TRV-1042", price: 3949, stock: 14, lastSyncedAt: "2026-10-15T12:28:00Z" },
      { channelId: "ch-shp", channelName: "Shopify", status: "live", marketplaceSku: "TRV-1042", price: 3899, stock: 14, lastSyncedAt: "2026-10-15T12:35:00Z" },
      { channelId: "ch-msh", channelName: "Meesho", status: "syncing", marketplaceSku: "MSH-TRV1042", price: 3799, stock: 14, lastSyncedAt: "2026-10-15T11:45:00Z" }
    ],
    attributes: {
      Material: "Ballistic Nylon",
      Closure: "YKK Aquaguard Zippers",
      Dimensions: "48 x 32 x 20 cm",
      Warranty: "2 Years International Warranty"
    },
    activity: [
      { id: "act-1", timestamp: "2026-10-15T12:30:00Z", user: "Abhishek Sharma", action: "Stock update", details: "Allocated 5 units to Amazon FBA" },
      { id: "act-2", timestamp: "2026-10-12T09:14:00Z", user: "Abhishek Sharma", action: "Price modified", details: "Selling price updated from ₹3,999 to ₹3,899" }
    ],
    createdAt: "2026-08-10T10:00:00Z",
    updatedAt: "2026-10-15T12:30:00Z",
  },
  {
    id: "prod-2",
    sku: "BP-1021",
    title: "Classic Backpack",
    brand: "Nova Living",
    category: "Bags & Luggage",
    description: "Everyday minimalist classic backpack featuring padded straps, dual water bottle holders, and durable canvas build.",
    bullets: [
      "Durable lightweight canvas exterior with water-repellent coating",
      "Padded 15-inch laptop sleeve and interior organizer pockets",
      "Quick-stash front zippered pocket",
      "Breathable cushioned air-mesh back panel"
    ],
    status: "active",
    price: 2499,
    mrp: 3999,
    costPrice: 950,
    taxRatePercent: 18,
    hsnCode: "42021290",
    stock: 8,
    reservedStock: 2,
    availableStock: 6,
    coverDays: 2,
    readinessScore: 92,
    blockers: [],
    media: [
      { id: "m-bp-1", url: "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Classic Backpack Rose front" },
      { id: "m-bp-2", url: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=600&q=80", isPrimary: false, altText: "Side view" },
    ],
    variants: [
      { id: "var-bp-1", productId: "prod-2", sku: "BP-1021-ROS", title: "Classic Backpack - Dusty Rose", options: { Color: "Dusty Rose" }, price: 2499, mrp: 3999, inventory: 3, status: "active" },
      { id: "var-bp-2", productId: "prod-2", sku: "BP-1021-BLK", title: "Classic Backpack - Matte Black", options: { Color: "Matte Black" }, price: 2499, mrp: 3999, inventory: 3, status: "active" },
      { id: "var-bp-3", productId: "prod-2", sku: "BP-1021-OLV", title: "Classic Backpack - Olive", options: { Color: "Olive" }, price: 2499, mrp: 3999, inventory: 2, status: "active" }
    ],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "live", marketplaceSku: "B09BP1021", price: 2499, stock: 8, lastSyncedAt: "2026-10-15T12:15:00Z" },
      { channelId: "ch-fk", channelName: "Flipkart", status: "live", marketplaceSku: "FK-BP-1021", price: 2499, stock: 8, lastSyncedAt: "2026-10-15T12:15:00Z" }
    ],
    attributes: {
      Material: "Waterproof Canvas",
      Closure: "Zipper",
      Capacity: "22L",
      Warranty: "1 Year Limited Warranty"
    },
    activity: [
      { id: "act-bp-1", timestamp: "2026-10-14T16:00:00Z", user: "System", action: "Low stock alert", details: "Available units dropped below threshold (8 units left)" }
    ],
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-10-14T16:00:00Z",
  },
  {
    id: "prod-3",
    sku: "OS-2048",
    title: "Cotton Overshirt",
    brand: "Nova Living",
    category: "Apparel & Fashion",
    description: "Premium heavyweight utility overshirt crafted from 100% organic combed cotton with structured chore pockets.",
    bullets: [
      "100% Super Combed Organic Cotton",
      "240 GSM dense French Terry knit",
      "Antiqued button placket and reinforced patch pockets",
      "Drop-shoulder relaxed chore silhouette"
    ],
    status: "active",
    price: 1899,
    mrp: 3499,
    costPrice: 700,
    taxRatePercent: 12,
    hsnCode: "61091000",
    stock: 0,
    reservedStock: 0,
    availableStock: 0,
    coverDays: 0,
    readinessScore: 88,
    blockers: ["Inventory depletion alert - 0 units available across all channels"],
    media: [
      { id: "m-os-1", url: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Cotton Overshirt on hanger" }
    ],
    variants: [
      { id: "var-os-1", productId: "prod-3", sku: "OS-2048-M", title: "Cotton Overshirt - M", options: { Size: "M" }, price: 1899, mrp: 3499, inventory: 0, status: "active" },
      { id: "var-os-2", productId: "prod-3", sku: "OS-2048-L", title: "Cotton Overshirt - L", options: { Size: "L" }, price: 1899, mrp: 3499, inventory: 0, status: "active" }
    ],
    channels: [
      { channelId: "ch-shp", channelName: "Shopify", status: "live", marketplaceSku: "OS-2048", price: 1899, stock: 0, lastSyncedAt: "2026-10-15T12:00:00Z" },
      { channelId: "ch-amz", channelName: "Amazon", status: "live", marketplaceSku: "B09OS2048", price: 1899, stock: 0, lastSyncedAt: "2026-10-15T12:00:00Z" }
    ],
    attributes: {
      Fabric: "100% Cotton",
      Fit: "Relaxed Boxy",
      Pattern: "Solid",
      CountryOfOrigin: "India"
    },
    activity: [
      { id: "act-os-1", timestamp: "2026-10-15T08:00:00Z", user: "System", action: "Out of stock", details: "All stock depleted on Amazon and Shopify" }
    ],
    createdAt: "2026-09-15T11:00:00Z",
    updatedAt: "2026-10-15T08:00:00Z",
  },
  {
    id: "prod-4",
    sku: "ORG-3102",
    title: "Travel Organizer Set",
    brand: "Nova Living",
    category: "Bags & Luggage",
    description: "6-piece compression packing cube set engineered with tear-resistant ripstop nylon and breathable mesh windows.",
    bullets: [
      "Ultralight ripstop honeycomb nylon with dual compression zippers",
      "Breathable see-through mesh tops for rapid TSA inspection",
      "Includes shoe bag, laundry pouch, and 4 modular clothing cubes"
    ],
    status: "incomplete",
    price: 1499,
    mrp: 2999,
    costPrice: 550,
    taxRatePercent: 18,
    hsnCode: "42029200",
    stock: 0,
    reservedStock: 0,
    availableStock: 0,
    coverDays: 0,
    readinessScore: 68,
    blockers: [
      "High-resolution lifestyle gallery images missing",
      "Detailed bullet points need channel validation"
    ],
    media: [],
    variants: [
      { id: "var-org-1", productId: "prod-4", sku: "ORG-3102-GRY", title: "Organizer Set - Heather Grey", options: { Color: "Heather Grey" }, price: 1499, mrp: 2999, inventory: 0, status: "draft" }
    ],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "not_listed" }
    ],
    attributes: {
      Material: "Ripstop Nylon",
      Pieces: "6 Pieces",
      Warranty: "1 Year"
    },
    activity: [
      { id: "act-org-1", timestamp: "2026-10-15T09:00:00Z", user: "Abhishek Sharma", action: "Draft created", details: "Initial catalog draft created" }
    ],
    createdAt: "2026-10-15T09:00:00Z",
    updatedAt: "2026-10-15T09:00:00Z",
  },
  {
    id: "prod-6",
    sku: "LUM-3310",
    title: "Lumina Matte Portable Ultrasonic Diffuser",
    brand: "Nova Living",
    category: "Home & Kitchen",
    description: "Whisper-quiet ceramic ultrasonic aroma diffuser with warm amber night light and intermittent mist mode.",
    bullets: [
      "Real handcrafted ceramic stone shell",
      "2.4MHz ultrasonic vibration with zero heat",
      "Auto shut-off sensor when reservoir is dry"
    ],
    status: "draft",
    price: 2199,
    mrp: 3499,
    costPrice: 850,
    taxRatePercent: 18,
    hsnCode: "85098000",
    stock: 25,
    reservedStock: 0,
    availableStock: 25,
    coverDays: 14,
    readinessScore: 80,
    blockers: [
      "Secondary lifestyle images recommended",
      "Amazon listing preparation incomplete"
    ],
    media: [
      { id: "m-7", url: "https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Ceramic diffuser" }
    ],
    variants: [],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "not_listed" },
      { channelId: "ch-shp", channelName: "Shopify", status: "syncing" }
    ],
    attributes: {
      Capacity: "180 ml",
      Runtime: "Up to 8 hours"
    },
    activity: [],
    createdAt: "2026-10-01T14:00:00Z",
    updatedAt: "2026-10-11T11:00:00Z",
  }
];

export const mockKpis: ProductsKpiSummary = {
  totalProducts: 427,
  activeListings: 1142,
  lowStockCount: 18,
  incompleteCatalogCount: 12
};
