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
    sku: "OS-2048",
    title: "Oversized Heavyweight Cotton T-Shirt (240 GSM)",
    brand: "Nova Living",
    category: "Apparel & Fashion",
    description: "Premium streetwear boxy cut t-shirt crafted with combed organic Aegean cotton with ribbed collar.",
    bullets: [
      "100% Super Combed Organic Cotton",
      "240 GSM dense French Terry knit",
      "Pre-shrunk fabric with bio-silicon wash",
      "Drop-shoulder boxy oversized silhouette"
    ],
    status: "active",
    price: 1199,
    mrp: 2499,
    costPrice: 420,
    taxRatePercent: 12,
    hsnCode: "61091000",
    stock: 9,
    reservedStock: 2,
    availableStock: 7,
    coverDays: 3,
    readinessScore: 95,
    blockers: [],
    media: [
      { id: "m-3", url: "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Black t-shirt front" }
    ],
    variants: [
      { id: "var-2-1", productId: "prod-2", sku: "OS-2048-BLK-M", title: "Oversized Tee - Black / M", options: { Color: "Jet Black", Size: "M" }, price: 1199, mrp: 2499, inventory: 4, status: "active" },
      { id: "var-2-2", productId: "prod-2", sku: "OS-2048-BLK-L", title: "Oversized Tee - Black / L", options: { Color: "Jet Black", Size: "L" }, price: 1199, mrp: 2499, inventory: 5, status: "active" }
    ],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "live", marketplaceSku: "B09OS2048", price: 1199, stock: 9, lastSyncedAt: "2026-10-15T12:15:00Z" },
      { channelId: "ch-fk", channelName: "Flipkart", status: "live", marketplaceSku: "FK-OS-2048", price: 1199, stock: 9, lastSyncedAt: "2026-10-15T12:15:00Z" },
      { channelId: "ch-shp", channelName: "Shopify", status: "live", marketplaceSku: "OS-2048", price: 1199, stock: 9, lastSyncedAt: "2026-10-15T12:15:00Z" }
    ],
    attributes: {
      Fabric: "100% Cotton",
      Fit: "Oversized",
      Pattern: "Solid",
      CountryOfOrigin: "India"
    },
    activity: [
      { id: "act-3", timestamp: "2026-10-14T16:00:00Z", user: "System", action: "Low stock alert", details: "Available units dropped below threshold (10 units)" }
    ],
    createdAt: "2026-09-01T10:00:00Z",
    updatedAt: "2026-10-14T16:00:00Z",
  },
  {
    id: "prod-3",
    sku: "BP-1021",
    title: "Nordic Minimalist Ceramic Coffee Tumbler with Lid 350ml",
    brand: "Nova Living",
    category: "Home & Kitchen",
    description: "Double-wall insulated ceramic mug with spill-resistant lid, designed to preserve beverage aroma.",
    bullets: [
      "Thermal double-wall ceramic core with matte exterior",
      "Splash-proof sliding lid with silicone gasket",
      "Fits standard automobile cupholders",
      "Microwave and dishwasher safe"
    ],
    status: "active",
    price: 899,
    mrp: 1499,
    costPrice: 320,
    taxRatePercent: 18,
    hsnCode: "69111011",
    stock: 5,
    reservedStock: 1,
    availableStock: 4,
    coverDays: 2,
    readinessScore: 90,
    blockers: [],
    media: [
      { id: "m-4", url: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Matte white tumbler" }
    ],
    variants: [],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "live", price: 899, stock: 5 },
      { channelId: "ch-shp", channelName: "Shopify", status: "live", price: 899, stock: 5 }
    ],
    attributes: {
      Volume: "350 ml",
      DishwasherSafe: "Yes",
      MicrowaveSafe: "Yes"
    },
    activity: [],
    createdAt: "2026-09-15T11:00:00Z",
    updatedAt: "2026-10-13T09:00:00Z",
  },
  {
    id: "prod-4",
    sku: "NL-001",
    title: "Aura Smart Ambient LED Desk Lamp Pro",
    brand: "Nova Living",
    category: "Electronics",
    description: "App-controlled tunable white and RGB desk lamp with Qi fast wireless charging base.",
    bullets: [
      "CRI 95+ full spectrum eye-care lighting",
      "Built-in 15W Qi fast wireless charging pad",
      "Smart home integration with Alexa, Google Home & Apple HomeKit",
      "Stepless touch-dimming with auto ambient sensor"
    ],
    status: "active",
    price: 4499,
    mrp: 7999,
    costPrice: 2100,
    taxRatePercent: 18,
    hsnCode: "94052090",
    stock: 82,
    reservedStock: 6,
    availableStock: 76,
    coverDays: 34,
    readinessScore: 100,
    blockers: [],
    media: [
      { id: "m-5", url: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Aura LED Desk Lamp" }
    ],
    variants: [],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "live", price: 4499, stock: 82 },
      { channelId: "ch-fk", channelName: "Flipkart", status: "live", price: 4499, stock: 82 },
      { channelId: "ch-shp", channelName: "Shopify", status: "live", price: 4499, stock: 82 },
      { channelId: "ch-msh", channelName: "Meesho", status: "live", price: 4399, stock: 82 }
    ],
    attributes: {
      Wattage: "24W",
      WirelessChargeSpeed: "15W",
      Connectivity: "Wi-Fi 2.4GHz + BLE 5.0"
    },
    activity: [],
    createdAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-10-10T14:00:00Z",
  },
  {
    id: "prod-5",
    sku: "ARC-8012",
    title: "Architect Heavy Canvas Workwear Overshirt",
    brand: "Nova Living",
    category: "Apparel & Fashion",
    description: "Durable 14oz brushed duck canvas chore jacket with brass hardware and reinforced utility pockets.",
    bullets: [
      "14oz heavyweight 100% cotton canvas",
      "Antiqued solid brass buttons",
      "Double-needle reinforced chain-stitch construction"
    ],
    status: "incomplete",
    price: 3299,
    mrp: 5999,
    costPrice: 1400,
    taxRatePercent: 12,
    hsnCode: "",
    stock: 0,
    reservedStock: 0,
    availableStock: 0,
    coverDays: 0,
    readinessScore: 45,
    blockers: [
      "HSN code is missing (required for GST invoice)",
      "At least 1 product variant required",
      "High-resolution back view image missing"
    ],
    media: [
      { id: "m-6", url: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=600&q=80", isPrimary: true, altText: "Tan canvas jacket" }
    ],
    variants: [],
    channels: [
      { channelId: "ch-amz", channelName: "Amazon", status: "not_listed" },
      { channelId: "ch-fk", channelName: "Flipkart", status: "blocked", errors: ["Missing mandatory attribute: Fabric Care"] },
      { channelId: "ch-shp", channelName: "Shopify", status: "not_listed" }
    ],
    attributes: {
      Fit: "Relaxed Boxy",
      Style: "Chore Jacket"
    },
    activity: [
      { id: "act-4", timestamp: "2026-10-15T09:00:00Z", user: "Abhishek Sharma", action: "Draft created", details: "Initial catalog draft created" }
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
