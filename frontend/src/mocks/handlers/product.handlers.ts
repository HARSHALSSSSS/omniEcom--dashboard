import { http, HttpResponse, delay } from "msw";
import { initialMockProducts, mockKpis } from "../data/products.data";
import { Product, CreateProductInput } from "@/types/product";

let productsDb: Product[] = [...initialMockProducts];

export const productHandlers = [
  // List products with filtering, search, pagination, and sorting
  http.get("/api/v1/products", async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.toLowerCase();
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const channel = url.searchParams.get("channel");
    const stockFilter = url.searchParams.get("stockFilter");
    const readiness = url.searchParams.get("readiness");
    const sortBy = url.searchParams.get("sortBy") || "updatedAt";
    const sortOrder = url.searchParams.get("sortOrder") || "desc";

    let filtered = [...productsDb];

    if (search) {
      filtered = filtered.filter(
        (p) =>
          p.title.toLowerCase().includes(search) ||
          p.sku.toLowerCase().includes(search) ||
          p.category.toLowerCase().includes(search)
      );
    }

    if (status && status !== "all") {
      filtered = filtered.filter((p) => p.status === status);
    }

    if (category && category !== "all") {
      filtered = filtered.filter((p) => p.category === category);
    }

    if (channel && channel !== "all") {
      filtered = filtered.filter((p) =>
        p.channels.some((c) => c.channelName.toLowerCase() === channel.toLowerCase() && c.status === "live")
      );
    }

    if (stockFilter && stockFilter !== "all") {
      if (stockFilter === "low_stock") {
        filtered = filtered.filter((p) => p.stock > 0 && p.stock <= 15);
      } else if (stockFilter === "out_of_stock") {
        filtered = filtered.filter((p) => p.stock === 0);
      } else if (stockFilter === "in_stock") {
        filtered = filtered.filter((p) => p.stock > 15);
      }
    }

    if (readiness && readiness !== "all") {
      if (readiness === "ready") {
        filtered = filtered.filter((p) => p.readinessScore >= 90);
      } else if (readiness === "incomplete") {
        filtered = filtered.filter((p) => p.readinessScore < 90);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy as keyof Product] ?? "";
      const bVal = b[sortBy as keyof Product] ?? "";
      if (typeof aVal === "string") {
        return sortOrder === "asc"
          ? (aVal as string).localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return HttpResponse.json({
      data: filtered,
      meta: {
        total: filtered.length,
        kpis: mockKpis,
        categories: Array.from(new Set(productsDb.map((p) => p.category))),
      },
    });
  }),

  // Get single product
  http.get("/api/v1/products/:id", async ({ params }) => {
    await delay(150);
    const { id } = params;
    const product = productsDb.find((p) => p.id === id);

    if (!product) {
      return HttpResponse.json({ message: "Product not found" }, { status: 404 });
    }

    return HttpResponse.json({ data: product });
  }),

  // Create product
  http.post("/api/v1/products", async ({ request }) => {
    await delay(350);
    const body = (await request.json()) as CreateProductInput;

    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      sku: body.sku,
      title: body.title,
      brand: body.brand,
      category: body.category,
      description: body.description,
      bullets: body.bullets || [],
      status: body.stock > 0 ? "active" : "draft",
      price: body.price,
      mrp: body.mrp,
      costPrice: body.costPrice || 0,
      taxRatePercent: body.taxRatePercent || 18,
      hsnCode: body.hsnCode,
      stock: body.stock || 0,
      reservedStock: 0,
      availableStock: body.stock || 0,
      coverDays: Math.floor((body.stock || 0) / 2.5),
      readinessScore: 92,
      blockers: [],
      media: [
        {
          id: `m-${Date.now()}`,
          url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80",
          isPrimary: true,
          altText: body.title,
        },
      ],
      variants: [],
      channels: [
        { channelId: "ch-amz", channelName: "Amazon", status: "not_listed" },
        { channelId: "ch-fk", channelName: "Flipkart", status: "not_listed" },
        { channelId: "ch-shp", channelName: "Shopify", status: "not_listed" },
      ],
      attributes: body.attributes || {},
      activity: [
        {
          id: `act-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: "Current User",
          action: "Product created",
          details: `Master catalog item created with SKU ${body.sku}`,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    productsDb.unshift(newProduct);
    return HttpResponse.json({ data: newProduct }, { status: 201 });
  }),

  // Update product
  http.put("/api/v1/products/:id", async ({ params, request }) => {
    await delay(300);
    const { id } = params;
    const body = (await request.json()) as Partial<Product>;
    const index = productsDb.findIndex((p) => p.id === id);

    if (index === -1) {
      return HttpResponse.json({ message: "Product not found" }, { status: 404 });
    }

    const updated: Product = {
      ...productsDb[index],
      ...body,
      updatedAt: new Date().toISOString(),
      activity: [
        {
          id: `act-${Date.now()}`,
          timestamp: new Date().toISOString(),
          user: "Current User",
          action: "Product updated",
          details: "Catalog details modified via studio editor",
        },
        ...productsDb[index].activity,
      ],
    };

    productsDb[index] = updated;
    return HttpResponse.json({ data: updated });
  }),

  // Bulk update or action (e.g. archive, activate, delete)
  http.post("/api/v1/products/bulk", async ({ request }) => {
    await delay(350);
    const { productIds, action, payload } = (await request.json()) as {
      productIds: string[];
      action: "archive" | "activate" | "adjust_price" | "delete";
      payload?: { percentDelta?: number; price?: number };
    };

    productsDb = productsDb.map((prod) => {
      if (!productIds.includes(prod.id)) return prod;

      if (action === "archive") return { ...prod, status: "archived" };
      if (action === "activate") return { ...prod, status: "active" };
      if (action === "adjust_price" && payload?.percentDelta) {
        const newPrice = Math.round(prod.price * (1 + payload.percentDelta / 100));
        return { ...prod, price: newPrice };
      }
      return prod;
    });

    if (action === "delete") {
      productsDb = productsDb.filter((p) => !productIds.includes(p.id));
    }

    return HttpResponse.json({ success: true, count: productIds.length });
  }),

  // AI improve content endpoint
  http.post("/api/v1/products/ai-suggest", async ({ request }) => {
    await delay(600);
    const { title, description } = (await request.json()) as { title: string; description: string };

    return HttpResponse.json({
      suggestedTitle: title.length > 5 ? `${title} · High-Grade Architectural Edition` : "Premium Ergonomic Edition",
      suggestedDescription: `Engineered for modern high-intensity workflows. ${description} Optimized with military-grade resilience, ergonomic balance, and certified sustainable manufacturing. Built to withstand continuous daily use across diverse environmental demands.`,
      suggestedBullets: [
        "Constructed with premium weather-sealed composite reinforcements",
        "Tested for 10,000+ duty cycles under rigorous compliance standards",
        "Includes manufacturer lifetime warranty against structural defects",
        "Compatible with all Indian regional statutory labeling requirements"
      ],
      seoKeywords: ["durable", "high performance", "premium edition", "ergonomic", "made in India"]
    });
  }),
];
