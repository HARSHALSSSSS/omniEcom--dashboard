import type { ProductProfitItem, ChannelContributionItem, MarginPressureMetrics } from "@/types/profitability";

export const FIGMA_FINANCIAL_PULSE = {
  revenue: "₹18.4L",
  revenueMinor: 1_840_000_00,
  productCost: "₹6.2L",
  productCostMinor: 620_000_00,
  marketplaceAndPaymentFees: "₹2.1L",
  marketplaceAndPaymentFeesMinor: 210_000_00,
  shipping: "₹1.4L",
  shippingMinor: 140_000_00,
  returnsRefunds: "₹0.8L",
  returnsRefundsMinor: 80_000_00,
  contribution: "₹7.9L",
  contributionMinor: 790_000_00,
  contributionMarginPercent: 42.8,
  periodLabel: "Reported figures · Last 30 days",
};

export const FIGMA_WATERFALL_STEPS = [
  { key: "revenue", label: "Revenue", amount: "₹18.4L", signedMinor: 1_840_000_00, type: "positive" as const, heightPercent: 100 },
  { key: "product_cost", label: "Product Cost", amount: "-₹6.2L", signedMinor: -620_000_00, type: "negative" as const, heightPercent: 33.7 },
  { key: "marketplace_fees", label: "Marketplace Fees", amount: "-₹1.6L", signedMinor: -160_000_00, type: "negative" as const, heightPercent: 8.7 },
  { key: "payment_fees", label: "Payment Fees", amount: "-₹0.5L", signedMinor: -50_000_00, type: "negative" as const, heightPercent: 2.7 },
  { key: "shipping", label: "Shipping", amount: "-₹1.4L", signedMinor: -140_000_00, type: "negative" as const, heightPercent: 7.6 },
  { key: "discounts", label: "Discounts / Promotions", amount: "-₹0.4L", signedMinor: -40_000_00, type: "negative" as const, heightPercent: 2.2 },
  { key: "returns", label: "Returns / Refunds", amount: "-₹0.8L", signedMinor: -80_000_00, type: "negative" as const, heightPercent: 4.3 },
  { key: "calc_contrib", label: "Calculated contribution", amount: "₹7.5L", signedMinor: 750_000_00, type: "subtotal" as const, heightPercent: 40.8, isCalculated: true },
  { key: "reported_contrib", label: "Reported contribution", amount: "₹7.9L", signedMinor: 790_000_00, type: "subtotal" as const, heightPercent: 42.9, difference: "₹40K difference" },
];

export const FIGMA_PRODUCTS: ProductProfitItem[] = [
  {
    id: "prod-1",
    name: "Black T-Shirt",
    sku: "TS-BLK-042",
    revenueMinor: 120_000_00,
    units: 204,
    productCostMinor: 62_000_00,
    feesMinor: 21_000_00,
    shippingMinor: 12_000_00,
    returnsMinor: 6_000_00,
    contributionMinor: 21_000_00,
    marginPercent: 17,
    status: "Review",
    calculatedContributionMinor: 18_000_00,
    differenceMinor: -3_000_00,
    reconciles: false,
    costBreakdown: {
      productCostMinor: 62_000_00,
      marketplaceCommissionMinor: 14_000_00,
      paymentFeesMinor: 7_000_00,
      shippingMinor: 12_000_00,
      discountsMinor: 3_000_00,
      returnsMinor: 1_000_00,
    },
    channelComparison: [
      { marketplace: "Amazon", sellingPriceMinor: 999_00, marginPercent: 32 },
      { marketplace: "Flipkart", sellingPriceMinor: 979_00, marginPercent: 27 },
      { marketplace: "Meesho", sellingPriceMinor: 849_00, marginPercent: 18 },
      { marketplace: "Shopify", sellingPriceMinor: 1099_00, marginPercent: 35, isBest: true },
    ],
    signal: {
      summary: "Meesho contributes less for Black T-Shirt despite strong unit volume.",
      bullets: [
        "High marketplace fees",
        "Lower selling price",
        "Higher return cost",
      ],
      recommendation: "Review Meesho pricing and promotion strategy.",
    },
    quadrant: {
      demand: "high",
      margin: "low",
      category: "optimize",
      x: 65,
      y: 72,
    },
  },
  {
    id: "prod-2",
    name: "Running Shoes",
    sku: "RS-BLU-201",
    revenueMinor: 240_000_00,
    units: 152,
    productCostMinor: 105_000_00,
    feesMinor: 34_000_00,
    shippingMinor: 19_000_00,
    returnsMinor: 5_000_00,
    contributionMinor: 76_000_00,
    marginPercent: 31,
    status: "Healthy",
    calculatedContributionMinor: 74_000_00,
    differenceMinor: -2_000_00,
    reconciles: false,
    costBreakdown: {
      productCostMinor: 105_000_00,
      marketplaceCommissionMinor: 22_000_00,
      paymentFeesMinor: 12_000_00,
      shippingMinor: 19_000_00,
      discountsMinor: 4_000_00,
      returnsMinor: 2_000_00,
    },
    channelComparison: [
      { marketplace: "Amazon", sellingPriceMinor: 2499_00, marginPercent: 34 },
      { marketplace: "Flipkart", sellingPriceMinor: 2399_00, marginPercent: 29 },
      { marketplace: "Shopify", sellingPriceMinor: 2699_00, marginPercent: 38, isBest: true },
    ],
    signal: {
      summary: "High demand with healthy margins across all major channels.",
      bullets: [
        "Consistently low return rate (2.1%)",
        "Favorable courier rates in Tier 1 cities",
      ],
      recommendation: "Consider increasing ad budget to scale volume.",
    },
    quadrant: {
      demand: "high",
      margin: "high",
      category: "scale",
      x: 58,
      y: 35,
    },
  },
  {
    id: "prod-3",
    name: "Travel Duffel",
    sku: "TD-GRY-091",
    revenueMinor: 40_000_00,
    units: 61,
    productCostMinor: 12_000_00,
    feesMinor: 17_000_00,
    shippingMinor: 5_000_00,
    returnsMinor: 1_000_00,
    contributionMinor: 12_000_00,
    marginPercent: 14,
    status: "Review",
    calculatedContributionMinor: 12_000_00,
    differenceMinor: 0,
    reconciles: true,
    costBreakdown: {
      productCostMinor: 12_000_00,
      marketplaceCommissionMinor: 11_000_00,
      paymentFeesMinor: 6_000_00,
      shippingMinor: 5_000_00,
      discountsMinor: 1_000_00,
      returnsMinor: 1_000_00,
    },
    channelComparison: [
      { marketplace: "Amazon", sellingPriceMinor: 899_00, marginPercent: 15 },
      { marketplace: "Flipkart", sellingPriceMinor: 849_00, marginPercent: 12 },
    ],
    signal: {
      summary: "Low volume and thin contribution margin.",
      bullets: [
        "High packaging cost relative to sales price",
        "Marketplace take rate exceeds 20%",
      ],
      recommendation: "Explore supplier renegotiation or bundle promotions.",
    },
    quadrant: {
      demand: "low",
      margin: "low",
      category: "review",
      x: 32,
      y: 82,
    },
  },
];

export const FIGMA_CHANNELS: ChannelContributionItem[] = [
  { marketplace: "Amazon.in", revenueMinor: 720_000_00, contributionMinor: 340_000_00, marginPercent: 47 },
  { marketplace: "Flipkart", revenueMinor: 480_000_00, contributionMinor: 190_000_00, marginPercent: 40 },
  { marketplace: "Meesho", revenueMinor: 320_000_00, contributionMinor: 90_000_00, marginPercent: 28 },
  { marketplace: "Shopify", revenueMinor: 320_000_00, contributionMinor: 170_000_00, marginPercent: 53, isBest: true },
];

export const FIGMA_MARGIN_PRESSURE: MarginPressureMetrics = {
  healthyCount: 842,
  belowTargetCount: 116,
  lowContributionCount: 34,
};

export const FIGMA_MARGIN_PRESSURE_PRODUCTS = [
  { name: "Black T-Shirt", revenue: "₹1.2L", contribution: "₹21K", margin: "17%", status: "Below target" as const },
  { name: "Travel Duffel", revenue: "₹0.4L", contribution: "₹12K", margin: "14%", status: "Review" as const },
  { name: "Running Shoes", revenue: "₹2.4L", contribution: "₹76K", margin: "31%", status: "Healthy" as const },
];
