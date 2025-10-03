import express from "express";
import { supabase } from "../supabaseClient.js";
import { authMiddleware } from "../authMiddleware.js";

const router = express.Router();

// Health check
router.get("/ping", (req, res) => res.json({ ok: true, route: req.originalUrl }));

// Helper: month range (start inclusive, end exclusive)
const getMonthRange = (year: number, monthIndex: number) => {
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
};

// Helper: build product map from products table
const fetchProductsMap = async () => {
  const { data: productsData, error } = await supabase
    .from("products")
    .select("id, name, stock, cost_price, sell_price, sku");
  if (error) throw error;
  const map: Record<string, any> = {};
  (productsData || []).forEach((p: any) => {
    map[String(p.id)] = p;
    map[String(p.name)] = p; // allow lookup by name as fallback
  });
  return map;
};

// Core processor: given orders array and product map, compute metrics and per-product breakdown
const computeMetricsFromOrders = (orders: any[], productsMap: Record<string, any>) => {
  const salesMap: Record<string, any> = {};
  let revenue = 0;
  let cogs = 0;
  let totalUnits = 0;

  (orders || []).forEach((order: any) => {
    const items = order.items || [];
    items.forEach((item: any) => {
      const name = item.productName ?? item.name ?? String(item.product_id ?? "Unknown");
      const qty = Number(item.quantity ?? item.qty ?? 0);
      const price = Number(item.price ?? item.unitPrice ?? 0);
      const costPerUnit = Number(item.costPerUnit ?? item.cost_price ?? 0);

      // fallback to product lookup if cost missing
    const initialCostPerUnit = Number(item.costPerUnit ?? item.cost_price ?? 0);
const costPerUnitFinal =
  (!initialCostPerUnit || initialCostPerUnit === 0) && productsMap
    ? Number(
        (productsMap[String(item.product_id ?? name)] || productsMap[String(name)])?.cost_price ??
        (productsMap[String(item.product_id ?? name)] || productsMap[String(name)])?.costPrice ??
        0
      )
    : initialCostPerUnit;


      revenue += qty * price;
      cogs += qty * (costPerUnit || 0);
      totalUnits += qty;

      if (!salesMap[name]) salesMap[name] = { productName: name, totalSold: 0, revenue: 0 };
      salesMap[name].totalSold += qty;
      salesMap[name].revenue += qty * price;
    });
  });

  const grossProfit = revenue - cogs;
  const sales = Object.values(salesMap);
  return { revenue, cogs, grossProfit, totalUnitsSold: totalUnits, sales };
};

// Combined endpoint returning both sales + stock
// Supports optional query param: ?period=current_month|previous_month (or this_month|last_month)
router.get("/", authMiddleware, async (req: any, res) => {
  try {
    const period = String(req.query.period || "").toLowerCase();

    // if period is provided and matches month keywords, compute metrics for that month
    if (period === "current_month" || period === "this_month" || period === "current") {
      const now = new Date();
      const { start, end } = getMonthRange(now.getUTCFullYear(), now.getUTCMonth());

      const productsMap = await fetchProductsMap();
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("items, created_at")
        .gte("created_at", start)
        .lt("created_at", end);
      if (ordersErr) throw ordersErr;

      const metrics = computeMetricsFromOrders(ordersData || [], productsMap);
      const stockRes = await supabase.from("products").select("name, stock");

      return res.json({ ...metrics, stock: (stockRes.data || []).map((p: any) => ({ productName: p.name, stock: p.stock })) });
    }

    if (period === "previous_month" || period === "last_month" || period === "previous") {
      const now = new Date();
      const prevMonthIndex = now.getUTCMonth() - 1;
      const year = prevMonthIndex < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
      const monthIndex = (prevMonthIndex + 12) % 12;
      const { start, end } = getMonthRange(year, monthIndex);

      const productsMap = await fetchProductsMap();
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("items, created_at")
        .gte("created_at", start)
        .lt("created_at", end);
      if (ordersErr) throw ordersErr;

      const metrics = computeMetricsFromOrders(ordersData || [], productsMap);
      const stockRes = await supabase.from("products").select("name, stock");

      return res.json({ ...metrics, stock: (stockRes.data || []).map((p: any) => ({ productName: p.name, stock: p.stock })) });
    }

    // Default: return combined totals across all orders
    const ordersResult = await supabase.from("orders").select("items");
    if (ordersResult.error) throw ordersResult.error;
    const orders = ordersResult.data || [];

    const productsResult = await supabase.from("products").select("name, stock");
    if (productsResult.error) throw productsResult.error;

    const salesMap: Record<string, { productName: string; totalSold: number; revenue: number }> = {};
    orders.forEach((order: any) => {
      const items = order.items || [];
      items.forEach((item: any) => {
        const name = item.productName ?? item.name ?? "Unknown";
        const qty = Number(item.quantity || item.qty || 0);
        const price = Number(item.price || item.unitPrice || 0);
        if (!salesMap[name]) {
          salesMap[name] = { productName: name, totalSold: 0, revenue: 0 };
        }
        salesMap[name].totalSold += qty;
        salesMap[name].revenue += qty * price;
      });
    });

    const stock = (productsResult.data || []).map((p: any) => ({ productName: p.name, stock: p.stock }));

    return res.json({ sales: Object.values(salesMap), stock });
  } catch (err: any) {
    console.error("Error in GET /analytics:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Individual sales route for backwards compatibility
router.get("/sales", authMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from("orders").select("items");
    if (error) throw error;
    const salesMap: Record<string, { productName: string; totalSold: number; revenue: number }> = {};
    (data || []).forEach((order: any) => {
      (order.items || []).forEach((item: any) => {
        const name = item.productName ?? item.name ?? "Unknown";
        const qty = Number(item.quantity || item.qty || 0);
        const price = Number(item.price || item.unitPrice || 0);
        if (!salesMap[name]) salesMap[name] = { productName: name, totalSold: 0, revenue: 0 };
        salesMap[name].totalSold += qty;
        salesMap[name].revenue += qty * price;
      });
    });
    res.json({ sales: Object.values(salesMap) });
  } catch (err: any) {
    console.error("Error in GET /analytics/sales:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Individual stock route
router.get("/stock", authMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase.from("products").select("id, name, stock");
    if (error) throw error;
    res.json({ stock: (data || []).map((p: any) => ({ productId: p.id, productName: p.name, stock: p.stock })) });
  } catch (err: any) {
    console.error("Error in GET /analytics/stock:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Products listing (inventory) endpoint with optional fields
router.get("/products", authMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, stock, cost_price, sell_price, sku");
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error("Error in GET /analytics/products:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Alias for products inventory endpoints
router.get(["/inventory", "/products/inventory"], authMiddleware, async (req: any, res) => {
  try {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, stock, cost_price, sell_price, sku");
    if (error) throw error;
    res.json(data || []);
  } catch (err: any) {
    console.error("Error in GET inventory endpoints:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Monthly metric endpoints (explicit)
router.get(["/month/current", "/monthly/current"], authMiddleware, async (req: any, res) => {
  try {
    const now = new Date();
    const { start, end } = getMonthRange(now.getUTCFullYear(), now.getUTCMonth());
    const productsMap = await fetchProductsMap();
    const { data: ordersData, error } = await supabase
      .from("orders")
      .select("items, created_at")
      .gte("created_at", start)
      .lt("created_at", end);
    if (error) throw error;
    const metrics = computeMetricsFromOrders(ordersData || [], productsMap);
    return res.json(metrics);
  } catch (err: any) {
    console.error("Error in GET /month/current:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

router.get(["/month/previous", "/monthly/previous"], authMiddleware, async (req: any, res) => {
  try {
    const now = new Date();
    const prevMonthIndex = now.getUTCMonth() - 1;
    const year = prevMonthIndex < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const monthIndex = (prevMonthIndex + 12) % 12;
    const { start, end } = getMonthRange(year, monthIndex);

    const productsMap = await fetchProductsMap();
    const { data: ordersData, error } = await supabase
      .from("orders")
      .select("items, created_at")
      .gte("created_at", start)
      .lt("created_at", end);
    if (error) throw error;
    const metrics = computeMetricsFromOrders(ordersData || [], productsMap);
    return res.json(metrics);
  } catch (err: any) {
    console.error("Error in GET /month/previous:", err);
    res.status(500).json({ error: err?.message || "Server error" });
  }
});

export default router;
