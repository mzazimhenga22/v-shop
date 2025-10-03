import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
  LabelList,
  Legend,
} from "recharts";
import { supabase } from "@/lib/supabaseClient";

// --------------------
// Types
// --------------------
interface SalesData {
  productId?: string | number;
  productName: string;
  totalSold?: number;
  revenue?: number;
  costPerUnit?: number;
  sellPrice?: number;
  lastSoldAt?: string | number;
  last_sale_date?: string | number;
  [k: string]: any;
}

interface StockData {
  productId?: string | number;
  productName: string;
  stock: number;
}

interface Product {
  id: string | number;
  name: string;
  stock?: number;
  costPrice?: number;
  sellPrice?: number;
  sku?: string;
  category?: string;
  created_at?: string | number;
  [k: string]: any;
}

interface PeriodMetrics {
  revenue: number;
  cogs: number;
  grossProfit: number;
  totalUnitsSold: number;
  unitsReceived?: number;
  [k: string]: any;
}

// --------------------
// Axios Setup
// --------------------
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const session = (data as any)?.session;
  if (session?.access_token) {
    config.headers = config.headers ?? {};
    (config.headers as any).Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// --------------------
// UI helpers
// --------------------
const formatCurrency = (n: number) => {
  const v = Number(n);
  const safe = isFinite(v) && !isNaN(v) ? Math.round(v) : 0;
  return `$${safe.toLocaleString()}`;
};

const formatNumber = (n: number) => (isFinite(n) ? n.toLocaleString() : "0");

const percentChange = (current: number, previous: number) =>
  previous === 0 ? (current === 0 ? 0 : 100) : ((current - previous) / Math.abs(previous)) * 100;

const ChartCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div
    className="p-4 rounded-2xl"
    style={{
      background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
      border: "1px solid rgba(255,255,255,0.03)",
      backdropFilter: "blur(6px)",
    }}
  >
    <h2 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">{title}</h2>
    {children}
  </div>
);

// --------------------
// Product normalizer (handles snake_case, alternate keys, nulls)
// --------------------
const normalizeProduct = (raw: any): Product => {
  const id = raw.id ?? raw.product_id ?? raw._id ?? raw.ID;
  const name = raw.name ?? raw.product_name ?? raw.title ?? raw.productTitle ?? "Unnamed";
  const sku = raw.sku ?? raw.sku_code ?? raw.skuId ?? raw.SKU;
  const category = raw.category ?? raw.category_name ?? raw.cat;

  const stock = Number(raw.stock ?? raw.quantity ?? raw.qty ?? raw.amount ?? 0) || 0;

  const sellPriceRaw =
    raw.sellPrice ?? raw.sell_price ?? raw.price ?? raw.retail_price ?? raw.unit_price ?? raw.selling_price;
  const costPriceRaw = raw.costPrice ?? raw.cost_price ?? raw.cost ?? raw.unit_cost ?? raw.purchase_price;

  const sellPrice = Number(sellPriceRaw ?? 0) || 0;
  const costPrice = Number(costPriceRaw ?? 0) || 0;

  return {
    ...raw,
    id,
    name,
    sku,
    category,
    stock,
    sellPrice,
    costPrice,
  };
};

// --------------------
// Fetch helper (fallback endpoints)
// --------------------
const tryEndpoints = async <T,>(urls: string[]): Promise<T | null> => {
  for (const url of urls) {
    try {
      const res = await api.get<T>(url);
      if (res?.data) return res.data;
    } catch (e) {
      // ignore and try next
    }
  }
  return null;
};

// --------------------
// Main component
// --------------------
const BusinessAnalyticsTab: React.FC = () => {
  const [sales, setSales] = useState<SalesData[]>([]);
  const [stock, setStock] = useState<StockData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [metricsThis, setMetricsThis] = useState<PeriodMetrics | null>(null);
  const [metricsPrev, setMetricsPrev] = useState<PeriodMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deadDays, setDeadDays] = useState<number>(90);
  const [unitsReceivedOverride, setUnitsReceivedOverride] = useState<number | undefined>(undefined);
  const [avgInventoryOverride, setAvgInventoryOverride] = useState<number | undefined>(undefined);

  const [cashOnHand, setCashOnHand] = useState<number>(0);
  const [otherAssets, setOtherAssets] = useState<number>(0);
  const [liabilities, setLiabilities] = useState<number>(0);

  const [searchTerm, setSearchTerm] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);

  const fetchProducts = async (): Promise<Product[]> => {
    const { data, error } = await supabase.from<"products", any>("products").select("*");
    if (error) {
      console.error("Error fetching products from Supabase:", error);
      setError(error.message ?? "Failed to fetch products");
      return [];
    }

    const normalized = (data || []).map(normalizeProduct);
    setProducts(normalized);
    console.log("normalized products:", normalized.slice(0, 10));
    return normalized;
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);

      try {
        const analytics = await tryEndpoints<any>(["/analytics", "/analytics/current", "/analytics/sales"]);
        const salesFromAnalytics: SalesData[] = (analytics && (analytics.sales || analytics.data || analytics)) || [];

        const productsRes = await fetchProducts();

        const stockRes = await tryEndpoints<StockData[]>(["/analytics/stock", "/stock", "/inventory/stock"]);

        const metricsThisRes = await tryEndpoints<any>([
          "/analytics?period=current_month",
          "/analytics?period=this_month",
          "/analytics/month/current",
          "/analytics/monthly/current",
          "/analytics/current_month",
        ]);
        const metricsPrevRes = await tryEndpoints<any>([
          "/analytics?period=previous_month",
          "/analytics?period=last_month",
          "/analytics/month/previous",
          "/analytics/monthly/previous",
          "/analytics/previous_month",
        ]);

        if (Array.isArray(salesFromAnalytics) && salesFromAnalytics.length > 0) {
          setSales(salesFromAnalytics);
        } else {
          const candidateSales = (analytics && (analytics.topSelling || analytics.sales || analytics.items || [])) || [];
          setSales(Array.isArray(candidateSales) ? candidateSales : []);
        }

        if (stockRes && Array.isArray(stockRes)) {
          setStock(stockRes);
        } else {
          const derivedStock: StockData[] = (productsRes || [])
            .filter((p: Product) => typeof p.stock === "number")
            .map((p: Product) => ({ productId: p.id, productName: p.name, stock: p.stock || 0 }));
          if (derivedStock.length > 0) setStock(derivedStock);
        }

        const parsePeriod = (obj: any): PeriodMetrics => {
          if (!obj) return { revenue: 0, cogs: 0, grossProfit: 0, totalUnitsSold: 0 };
          const revenue = Number(obj.revenue ?? obj.totalRevenue ?? 0) || 0;
          const cogs = Number(obj.cogs ?? obj.costOfGoodsSold ?? 0) || 0;
          const totalUnitsSold = Number(obj.totalUnits ?? obj.unitsSold ?? 0) || 0;
          const unitsReceived = Number(obj.unitsReceived ?? obj.units_received ?? 0) || undefined;
          const grossProfit = revenue - cogs;
          return { revenue, cogs, grossProfit, totalUnitsSold, unitsReceived } as PeriodMetrics;
        };

        let thisMetrics = parsePeriod(metricsThisRes);
        let prevMetrics = parsePeriod(metricsPrevRes);

        const computeFromSales = (arr: SalesData[], productsLookup: Product[] = []): PeriodMetrics => {
          if (!arr || arr.length === 0)
            return { revenue: 0, cogs: 0, grossProfit: 0, totalUnitsSold: 0 };
          const revenue = arr.reduce((s, it) => s + (Number(it.revenue) || 0), 0);
          const cogs = arr.reduce((s, it) => {
            const cPerUnit = Number(it.costPerUnit ?? it["costPerUnit"] ?? 0);
            if (cPerUnit && it.totalSold) return s + cPerUnit * Number(it.totalSold);

            const prod = (productsLookup || []).find(
              (p) =>
                String(p.id) === String(it.productId) ||
                (p.name ?? "").toString().toLowerCase().trim() === String(it.productName ?? "").toLowerCase().trim()
            );
            const prodCost = prod ? Number(prod.costPrice ?? 0) : 0;
            return s + (Number(it.totalSold || 0) * prodCost);
          }, 0);
          const totalUnitsSold = arr.reduce((s, it) => s + (Number(it.totalSold) || 0), 0);
          return { revenue, cogs, grossProfit: revenue - cogs, totalUnitsSold };
        };

        if (
          (!thisMetrics || thisMetrics.revenue === 0) &&
          Array.isArray(salesFromAnalytics) &&
          salesFromAnalytics.length > 0
        ) {
          thisMetrics = computeFromSales(salesFromAnalytics, productsRes);
        }
        if (
          (!prevMetrics || prevMetrics.revenue === 0) &&
          metricsPrevRes &&
          Array.isArray(metricsPrevRes?.sales)
        ) {
          prevMetrics = computeFromSales(metricsPrevRes.sales, productsRes);
        }

        if (mounted) {
          setMetricsThis(thisMetrics);
          setMetricsPrev(prevMetrics);
        }
      } catch (err: any) {
        console.error("Fetch analytics error", err);
        setError(err?.message || "Failed to fetch analytics");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const sub = supabase
      .channel("products_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        fetchProducts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, []);

  const { stockValueAtCost, stockValueAtRetail } = useMemo(() => {
    const cost = products.reduce((sum, p) => {
      const qty = Number(p.stock ?? 0);
      const unitCost = Number(p.costPrice ?? 0);
      return sum + qty * unitCost;
    }, 0);
    const retail = products.reduce((sum, p) => {
      const qty = Number(p.stock ?? 0);
      const unitSell = Number(p.sellPrice ?? 0);
      return sum + qty * unitSell;
    }, 0);
    return { stockValueAtCost: cost, stockValueAtRetail: retail };
  }, [products]);

  const lowStockItems = useMemo(() => {
    const list: { id?: any; name: string; stock: number; sellPrice?: number }[] = [];
    if (products && products.length > 0) {
      products.forEach((p) => {
        const s = Number(p.stock ?? 0);
        if (s <= 5) list.push({ id: p.id, name: p.name, stock: s, sellPrice: p.sellPrice });
      });
    } else {
      stock.forEach((s) => {
        if ((s.stock ?? 0) <= 5) list.push({ id: s.productId, name: s.productName, stock: s.stock });
      });
    }
    return list.sort((a, b) => a.stock - b.stock);
  }, [products, stock]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        (p.name ?? "").toString().toLowerCase().includes(q) ||
        (p.sku ?? "").toString().toLowerCase().includes(q)
    );
  }, [products, searchTerm]);

  const getMax = (arr: any[], key: string) =>
    arr && arr.length > 0 ? Math.max(...arr.map((i) => Number(i[key] ?? 0))) : 0;
  const getMin = (arr: any[], key: string) =>
    arr && arr.length > 0 ? Math.min(...arr.map((i) => Number(i[key] ?? 0))) : 0;

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const [_hasMore, setHasMore] = useState<boolean>(filteredProducts.length > visibleCount);

  useEffect(() => {
    const more = filteredProducts.length > visibleCount;
    setHasMore((prev) => (prev === more ? prev : more));
  }, [filteredProducts.length, visibleCount]);

  const resetPagination = () => {
    setVisibleCount(10);
    setHasMore(filteredProducts.length > 10);
  };

  useEffect(() => {
    resetPagination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredProducts.length]);

  const loadMore = () => {
    setVisibleCount((prev) => {
      const next = Math.min(filteredProducts.length, prev + 10);
      setHasMore(filteredProducts.length > next);
      return next;
    });
  };

  useEffect(() => {
    (window as any).__businessAnalyticsLoadMore = loadMore;
    return () => {
      try {
        delete (window as any).__businessAnalyticsLoadMore;
      } catch {
        /* noop */
      }
    };
  }, [loadMore, filteredProducts.length]);

  const getLastSaleDateForProduct = (p: Product | { id?: any; name?: string }) => {
    const matches = sales.filter(
      (s) =>
        (s.productId !== undefined && String(s.productId) === String(p.id)) ||
        (s.productName !== undefined &&
          String((s.productName ?? "").toString().toLowerCase()).trim() ===
            String((p.name ?? "").toString().toLowerCase()).trim())
    );
    const dateFields = ["lastSoldAt", "last_sold_at", "lastSaleDate", "last_sale_date", "lastSoldDate", "date", "last_order_date"];
    let last: Date | null = null;
    for (const m of matches) {
      for (const f of dateFields) {
        if (m[f]) {
          const d = new Date(m[f]);
          if (!isNaN(d.getTime())) {
            if (!last || d.getTime() > last.getTime()) last = d;
          }
        }
      }
      if (Array.isArray((m as any).salesHistory)) {
        (m as any).salesHistory.forEach((h: any) => {
          if (h.date) {
            const d = new Date(h.date);
            if (!isNaN(d.getTime())) {
              if (!last || d.getTime() > last.getTime()) last = d;
            }
          }
        });
      }
    }
    return last;
  };

  const unitsSoldLookup = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach((s) => {
      const key =
        s.productId !== undefined ? String(s.productId) : (s.productName ?? "").toString().toLowerCase();
      const qty = Number(s.totalSold ?? s.units ?? s.quantity ?? 0);
      map.set(key, (map.get(key) || 0) + (isNaN(qty) ? 0 : qty));
    });
    return map;
  }, [sales]);

  const deadStockList = useMemo(() => {
    const thresholdMs = deadDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list: Array<{ product: Product; lastSaleDate?: Date | null; unitsSold: number }> = [];

    products.forEach((p) => {
      const last = getLastSaleDateForProduct(p);
      const unitsSold =
        Number(unitsSoldLookup.get(String(p.id))) ||
        Number(unitsSoldLookup.get((p.name ?? "").toString().toLowerCase())) ||
        0;

      const olderThanThreshold = last ? now - last.getTime() > thresholdMs : false;
      if (unitsSold === 0 && !last) {
        list.push({ product: p, lastSaleDate: last, unitsSold });
      } else if (last && olderThanThreshold) {
        list.push({ product: p, lastSaleDate: last, unitsSold });
      }
    });

    return list.sort((a, b) => a.unitsSold - b.unitsSold);
  }, [products, sales, deadDays, unitsSoldLookup]);

  const profitability = useMemo(() => {
    const rows = products.map((p) => {
      const sell = Number(p.sellPrice ?? 0);
      const cost = Number(p.costPrice ?? 0);
      const margin = sell - cost;
      const marginPct = sell > 0 ? (margin / sell) * 100 : 0;
      const unitsSold =
        Number(unitsSoldLookup.get(String(p.id))) ||
        Number(unitsSoldLookup.get((p.name ?? "").toString().toLowerCase())) ||
        0;
      const totalProfit = margin * unitsSold;
      return { product: p, sell, cost, margin, marginPct, unitsSold, totalProfit };
    });

    const topProfitable = [...rows].sort((a, b) => b.totalProfit - a.totalProfit).slice(0, 5);
    const negativeMargin = rows.filter((r) => r.margin < 0 && r.unitsSold > 0);
    return { rows, topProfitable, negativeMargin };
  }, [products, unitsSoldLookup]);

  const firstTenProducts = useMemo(() => {
    return products.slice(0, 10);
  }, [products]);

  const overallKPIs = useMemo(() => {
    const totalUnitsSold = Number(metricsThis?.totalUnitsSold ?? 0);
    const endingInventoryUnits = products.reduce((s, p) => s + Number(p.stock ?? 0), 0);

    const approxAvgInventoryUnits = avgInventoryOverride ?? (endingInventoryUnits + totalUnitsSold / 2);
    const avgInv = Number(approxAvgInventoryUnits || 0);
    const stockTurnoverRate = avgInv > 0 ? (totalUnitsSold / avgInv) * 365 : NaN;

    const unitsReceived = metricsThis?.unitsReceived ?? unitsReceivedOverride;
    const sellThroughRate = unitsReceived && unitsReceived > 0 ? (totalUnitsSold / unitsReceived) * 100 : NaN;

    return {
      totalUnitsSold,
      endingInventoryUnits,
      avgInventoryUnits: avgInv,
      stockTurnoverRate,
      unitsReceived,
      sellThroughRate,
    };
  }, [metricsThis, products, avgInventoryOverride, unitsReceivedOverride]);

  const estimatedBusinessWorth = useMemo(() => {
    const v = Number(stockValueAtRetail ?? 0) + Number(cashOnHand ?? 0) + Number(otherAssets ?? 0) - Number(liabilities ?? 0);
    return v;
  }, [stockValueAtRetail, cashOnHand, otherAssets, liabilities]);

  if (loading) return <p>Loading analytics...</p>;
  if (error) return <p className="text-red-500">Error: {error}</p>;

  const revenueChangePct = percentChange(metricsThis?.revenue ?? 0, metricsPrev?.revenue ?? 0);
  const profitChangePct = percentChange(metricsThis?.grossProfit ?? 0, metricsPrev?.grossProfit ?? 0);

  return (
    <div className="space-y-6 min-h-[80vh] px-4 py-6">
      <div className="max-w-7xl mx-auto">
        {/* Top summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          <div
            className="p-4 rounded-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)",
            }}
          >
            <h3 className="text-sm text-gray-500">Estimated Business Worth</h3>
            <p className="text-2xl font-bold">{formatCurrency(estimatedBusinessWorth)}</p>
            <p className="text-xs text-gray-500 mt-1">Calculated: retail stock + cash + other assets - liabilities</p>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <label className="w-24">Cash:</label>
                <input
                  type="number"
                  value={cashOnHand}
                  onChange={(e) => setCashOnHand(Number(e.target.value || 0))}
                  className="px-2 py-1 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-24">Other assets:</label>
                <input
                  type="number"
                  value={otherAssets}
                  onChange={(e) => setOtherAssets(Number(e.target.value || 0))}
                  className="px-2 py-1 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="w-24">Liabilities:</label>
                <input
                  type="number"
                  value={liabilities}
                  onChange={(e) => setLiabilities(Number(e.target.value || 0))}
                  className="px-2 py-1 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
                />
              </div>
              <div className="text-xs text-gray-400">
                Hint: If you have receivables, subscriptions value, or cash in bank, add to other assets.
              </div>
            </div>
          </div>

          <div
            className="p-4 rounded-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)",
            }}
          >
            <h3 className="text-sm text-gray-500">Stock value (cost price)</h3>
            <p className="text-2xl font-bold">{formatCurrency(stockValueAtCost)}</p>
            <p className="text-xs text-gray-400 mt-1">
              Retail value: <span className="font-medium">{formatCurrency(stockValueAtRetail)}</span>
            </p>
          </div>

          <div
            className="p-4 rounded-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)",
            }}
          >
            <h3 className="text-sm text-gray-500">Revenue (This Month)</h3>
            <p className="text-2xl font-bold">{formatCurrency(metricsThis?.revenue ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-1">
              Change vs last month:{" "}
              <span className={revenueChangePct >= 0 ? "text-green-600" : "text-red-600"}>
                {revenueChangePct >= 0 ? "+" : ""}
                {Math.round(revenueChangePct)}%
              </span>
            </p>
          </div>

          <div
            className="p-4 rounded-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)",
            }}
          >
            <h3 className="text-sm text-gray-500">Gross Profit (This Month)</h3>
            <p className="text-2xl font-bold">{formatCurrency(metricsThis?.grossProfit ?? 0)}</p>
            <p className="text-xs text-gray-500 mt-1">
              Change vs last month:{" "}
              <span className={profitChangePct >= 0 ? "text-green-600" : "text-red-600"}>
                {profitChangePct >= 0 ? "+" : ""}
                {Math.round(profitChangePct)}%
              </span>
            </p>
          </div>

          <div
            className="p-4 rounded-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
              border: "1px solid rgba(255,255,255,0.03)",
              backdropFilter: "blur(6px)",
            }}
          >
            <h3 className="text-sm text-gray-500">Total Products</h3>
            <p className="text-2xl font-bold">{products?.length ?? 0}</p>
            <p className="text-xs text-gray-500 mt-1">Products tracked in catalog</p>
          </div>
        </div>

        {/* Charts & KPIs */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
          <ChartCard title="Revenue by Product">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={[...sales].sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))}>
                <XAxis dataKey="productName" />
                <YAxis />
                <Tooltip formatter={(val: any) => (typeof val === "number" ? `$${val.toLocaleString()}` : val)} />
                <Legend />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {sales.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={
                        Number(entry.revenue) === getMax(sales, "revenue")
                          ? "#16A34A"
                          : Number(entry.revenue) === getMin(sales, "revenue")
                          ? "#DC2626"
                          : "#3B82F6"
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    formatter={(label) => {
                      const value = Number(label);
                      return isNaN(value) ? "" : `$${value.toLocaleString()}`;
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Units Sold Trend">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={sales}>
                <XAxis dataKey="productName" />
                <YAxis />
                <Tooltip formatter={(val: any) => (typeof val === "number" ? `${val} units` : val)} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalSold"
                  stroke="#16A34A"
                  strokeWidth={2}
                  dot={(props: any) => {
                    const maxVal = getMax(sales, "totalSold");
                    const minVal = getMin(sales, "totalSold");
                    const value = Number(props.value ?? 0);
                    return (
                      <circle
                        cx={props.cx}
                        cy={props.cy}
                        r={value === maxVal || value === minVal ? 6 : 4}
                        fill={value === maxVal ? "#16A34A" : value === minVal ? "#DC2626" : "#3B82F6"}
                      />
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Stock (first 10 products) & Quick KPIs">
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 max-h-40 overflow-auto">
                {firstTenProducts.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-white dark:bg-gray-800 flex items-center justify-center font-semibold">
                        {String(p.name ?? "").charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.sku ?? ""} • {p.category ?? "Uncategorized"}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${Number(p.stock ?? 0) <= 5 ? "text-red-600" : ""}`}>{p.stock ?? 0}</div>
                      <div className="text-xs text-gray-400">{formatCurrency(Number(p.sellPrice ?? 0))}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <label className="w-36">Dead stock threshold (days)</label>
                  <input
                    type="number"
                    value={deadDays}
                    min={1}
                    onChange={(e) => setDeadDays(Number(e.target.value || 0))}
                    className="px-2 py-1 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-36">Units received (override)</label>
                  <input
                    type="number"
                    placeholder={metricsThis?.unitsReceived ? String(metricsThis.unitsReceived) : ""}
                    value={unitsReceivedOverride ?? ""}
                    onChange={(e) => setUnitsReceivedOverride(e.target.value === "" ? undefined : Number(e.target.value))}
                    className="px-2 py-1 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label className="w-36">Avg inventory override</label>
                  <input
                    type="number"
                    value={avgInventoryOverride ?? ""}
                    onChange={(e) => setAvgInventoryOverride(e.target.value === "" ? undefined : Number(e.target.value))}
                    className="px-2 py-1 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
                  />
                </div>

                <div className="pt-2">
                  <div className="text-xs text-gray-500">Total units sold (this period): <span className="font-medium">{overallKPIs.totalUnitsSold}</span></div>
                  <div className="text-xs text-gray-500">Ending inventory units: <span className="font-medium">{overallKPIs.endingInventoryUnits}</span></div>
                  <div className="text-xs text-gray-500">Avg inventory (used): <span className="font-medium">{formatNumber(Math.round(overallKPIs.avgInventoryUnits || 0))}</span></div>
                  <div className="text-xs text-gray-500">Stock turnover rate (annualized): <span className="font-medium">{isFinite(overallKPIs.stockTurnoverRate) ? Math.round(overallKPIs.stockTurnoverRate) : "N/A"}</span></div>
                  <div className="text-xs text-gray-500">Sell-through rate: <span className="font-medium">{isFinite(overallKPIs.sellThroughRate) ? `${Math.round(overallKPIs.sellThroughRate)}%` : "N/A"}</span></div>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Dead stock, Profitability insights, Low stock & product snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.03)", backdropFilter: "blur(6px)" }}>
            <h3 className="text-md font-semibold mb-3">Dead stock (no sales in last {deadDays} days)</h3>
            {deadStockList.length === 0 ? (
              <p className="text-sm text-gray-500">No dead stock found for the selected threshold.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-auto">
                {deadStockList.map((it) => {
                  const name = it.product.name;
                  const sku = it.product.sku ?? "";
                  const stockCount = Number(it.product.stock ?? 0);
                  const last = it.lastSaleDate ? it.lastSaleDate.toISOString().split("T")[0] : "Never";
                  return (
                    <div key={String(it.product.id)} className="flex items-center justify-between p-2 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div>
                        <div className="font-medium text-sm">{name}</div>
                        <div className="text-xs text-gray-400">{sku} • last sale: {last}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold">{stockCount}</div>
                        <div className="text-xs text-gray-400">in stock</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.03)", backdropFilter: "blur(6px)" }}>
            <h3 className="text-md font-semibold mb-3">Profitability insights</h3>

            <div className="text-sm mb-2">Top 5 most profitable (by estimated profit)</div>
            <div className="space-y-2 mb-3 max-h-36 overflow-auto">
              {profitability.topProfitable.map((r) => (
                <div key={String(r.product.id)} className="flex items-center justify-between p-2 rounded-md" style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div>
                    <div className="font-medium">{r.product.name}</div>
                    <div className="text-xs text-gray-400">{r.unitsSold} units • margin {formatCurrency(r.margin)} ({Math.round(r.marginPct)}%)</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(r.totalProfit)}</div>
                    <div className="text-xs text-gray-400">estimated profit</div>
                  </div>
                </div>
              ))}
              {profitability.topProfitable.length === 0 && <div className="text-xs text-gray-500">No profitability data available.</div>}
            </div>

            <div className="text-sm mb-2">Products with negative margin (investigate pricing)</div>
            <div className="space-y-2 max-h-36 overflow-auto">
              {profitability.negativeMargin.map((r) => (
                <div key={String(r.product.id)} className="flex items-center justify-between p-2 rounded-md" style={{ background: "rgba(255,0,0,0.02)" }}>
                  <div>
                    <div className="font-medium">{r.product.name}</div>
                    <div className="text-xs text-gray-400">margin {formatCurrency(r.margin)} • {r.unitsSold} units sold</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-red-600">{formatCurrency(r.totalProfit)}</div>
                    <div className="text-xs text-gray-400">loss</div>
                  </div>
                </div>
              ))}
              {profitability.negativeMargin.length === 0 && <div className="text-xs text-gray-500">No negative-margin products detected.</div>}
            </div>
          </div>

          <div className="p-4 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", border: "1px solid rgba(255,255,255,0.03)", backdropFilter: "blur(6px)" }}>
            <h3 className="text-md font-semibold mb-3">Low stock (≤ 5) & Product snapshot</h3>

            {lowStockItems.length === 0 ? (
              <p className="text-sm text-gray-500">No critical low-stock items</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 mb-3">
                {lowStockItems.map((it) => {
                  const prod = products.find((p) => String(p.id) === String(it.id));
                  const name = prod?.name ?? it.name;
                  const sku = prod?.sku ?? "";
                  const category = prod?.category ?? "";
                  const sell = prod?.sellPrice ?? it.sellPrice ?? 0;
                  const cost = prod?.costPrice ?? 0;
                  const stockCount = prod ? Number(prod.stock ?? 0) : it.stock;

                  return (
                    <div key={it.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.03)" }}>
                      <div className="w-12 h-12 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {name?.charAt(0)?.toUpperCase() ?? "?"}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-sm">{name}</div>
                            <div className="text-xs text-gray-500">{sku} • {category}</div>
                          </div>
                          <div className="text-right">
                            <div className={`text-sm font-semibold ${stockCount <= 2 ? "text-red-600" : "text-gray-800 dark:text-white"}`}>
                              {stockCount}
                            </div>
                            <div className="text-xs text-gray-500">in stock</div>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-3">
                          <div className="text-sm">{formatCurrency(sell)}</div>
                          <div className="text-xs text-gray-400">cost: {formatCurrency(cost)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <input
                type="text"
                placeholder="Search product or SKU..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setVisibleCount(10);
                }}
                className="px-3 py-2 border rounded-md text-sm w-full bg-[rgba(0,0,0,0.02)]"
              />
            </div>

            <div className="grid grid-cols-1 gap-2">
              {visibleProducts.slice(0, 4).map((p) => {
                const s = Number(p.stock ?? 0);
                return (
                  <div key={p.id} className="rounded-xl p-2" style={{ border: "1px solid rgba(255,255,255,0.03)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-gray-400">{p.sku ?? ""} • {p.category ?? "Uncategorized"}</div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${s <= 5 ? "text-red-600" : ""}`}>{s}</div>
                        <div className="text-xs text-gray-400">{formatCurrency(Number(p.sellPrice ?? 0))}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessAnalyticsTab;
