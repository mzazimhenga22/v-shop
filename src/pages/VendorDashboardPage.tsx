// src/pages/VendorDashboardPage.tsx
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag,
  Box,
  BarChart2,
  DollarSign,
  LogOut,
  Eye,
  EyeOff,
  Truck,
  Package,
  Bike,
  Loader2,
  Check,
} from "lucide-react";
import ProductCard from "@/components/ProductCard";
import type { Product as ProductType, Vendor as VendorType } from "@/types";

// Local types (augment if your types differ)
interface Vendor extends VendorType {
  lowStock?: number;
}

interface Order {
  id: number | string;
  item?: string;
  amount?: number;
  total_amount?: number;
  date?: string;
  created_at?: string;
  status?: string;
  vendor_id?: string | null;
  user_id?: string | null;
  items?: any; // optional order.items JSON (may contain product-level info)
  email?: string | null;
  delivered_at?: string | null;
  [k: string]: any;
}

interface SalesData {
  date: string;
  Sales: number;
}

interface DeliveryStep {
  label: string;
  icon: ReactNode;
  status: string;
}

const tabs = [
  { name: "Overview", icon: <BarChart2 className="w-5 h-5" /> },
  { name: "Orders", icon: <ShoppingBag className="w-5 h-5" /> },
  { name: "Products", icon: <Box className="w-5 h-5" /> },
  { name: "Analytics", icon: <DollarSign className="w-5 h-5" /> },
  { name: "Deliveries", icon: <Truck className="w-5 h-5" /> },
];

const deliverySteps: DeliveryStep[] = [
  { label: "Order Placed", icon: <Package className="w-5 h-5" />, status: "Order Placed" },
  { label: "Processing", icon: <Loader2 className="w-5 h-5 animate-spin" />, status: "Processing" },
  { label: "In Transit", icon: <Truck className="w-5 h-5" />, status: "In Transit" },
  { label: "Out for Delivery", icon: <Bike className="w-5 h-5" />, status: "Out for Delivery" },
  { label: "Delivered", icon: <Check className="w-5 h-5" />, status: "Delivered" },
];

const ASSUMED_GROSS_MARGIN = 0.25; // 25% fallback profit margin if no item cost info

const VendorDashboardPage = () => {
  const [activeTab, setActiveTab] = useState<string>("Overview");
  const [vendorInfo, setVendorInfo] = useState<Vendor | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string>("");
  const [showRevenueDialog, setShowRevenueDialog] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const navigate = useNavigate();
  const [isVendorPortal, setIsVendorPortal] = useState<boolean>(false);

  // Realtime & data state
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<ProductType[]>([]);
  const [salesGraph, setSalesGraph] = useState<SalesData[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(true);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);

  // New: Push-to-homepage modal state
  const [pushModalOpen, setPushModalOpen] = useState<boolean>(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [pushing, setPushing] = useState(false);

  // ---------- Normalization helpers ----------
  const normalizeItems = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) return parsed.items;
        return [];
      } catch {
        return [];
      }
    }
    if (typeof raw === "object") {
      if (Array.isArray((raw as any).items)) return (raw as any).items;
      const values = Object.values(raw);
      if (values.length && values.every((v) => typeof v === "object")) {
        return values as any[];
      }
    }
    return [];
  };

  // ---------- vendor lookup ----------
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = (userData as any)?.user;
        if (!user) return;
        if (!mounted) return;
        setCurrentUserId(user.id);

        const normalizeVendor = (raw: any): Vendor => {
          if (!raw) return null as any;
          return {
            ...raw,
            id: raw.id ?? raw.vendor_id ?? raw.user_id,
            user_id: raw.user_id ?? user.id,
            business_name:
              raw.business_name ?? raw.name ?? raw.vendor_name ?? (raw.user_email ? raw.user_email.split("@")[0] : "Vendor"),
            category: raw.category ?? raw.type ?? "General",
            lowStock: raw.low_stock ?? raw.lowStock ?? undefined,
          } as Vendor;
        };

        const viewName = "vendor_profiles_with_user";
        // Try ID columns correctly (eq BEFORE maybeSingle)
        const idCols = ["user_id", "id"];
        for (const col of idCols) {
          try {
            const { data, error } = await supabase
              .from(viewName)
              .select("*")
              .eq(col, user.id)
              .maybeSingle();
            if (!mounted) return;
            if (error) {
              const msg = (error?.message ?? "").toString().toLowerCase();
              if (msg.includes("does not exist") || msg.includes("column")) continue;
              continue;
            }
            if (data) {
              setVendorInfo(normalizeVendor(data));
              return;
            }
          } catch (e) {
            // ignore and try next column
            continue;
          }
        }

        // If not found by id, try email columns
        if (user.email) {
          const emailCols = ["user_email", "email"];
          for (const col of emailCols) {
            try {
              const { data, error } = await supabase
                .from(viewName)
                .select("*")
                .ilike(col, user.email)
                .maybeSingle();
              if (!mounted) return;
              if (error) {
                const msg = (error?.message ?? "").toString().toLowerCase();
                if (msg.includes("does not exist") || msg.includes("column")) continue;
                continue;
              }
              if (data) {
                setVendorInfo(normalizeVendor(data));
                return;
              }
            } catch {
              continue;
            }
          }
        }

        // ---- FALLBACK: set a minimal vendorInfo so product fetch doesn't bail out immediately.
        // This is safe for development/testing; remove if you prefer strict vendor rows.
      if (mounted) {
  setVendorInfo({
    id: user.id,
    user_id: user.id,
    business_name: user.email ? user.email.split("@")[0] : "Vendor",
    category: "General",
  } as unknown as Vendor);
}

      } catch (err) {
        console.error("init error:", err);
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, []);

  // ---------- compute sales graph (now includes confirmed + delivered) ----------
  const computeSalesGraph = (ordersList: Order[]) => {
    // last 6 months keys
    const totals: Record<string, number> = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      totals[key] = 0;
    }

    for (const o of ordersList) {
      const status = String(o.status ?? "").toLowerCase();
      // include confirmed as revenue-producing as requested
      if (status !== "delivered" && status !== "confirmed") continue;
      const rawDate = o.date ?? o.created_at ?? o.delivered_at ?? null;
      if (!rawDate) continue;
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in totals) totals[key] += Number(o.amount ?? o.total_amount ?? 0);
    }

    return Object.keys(totals).map((k) => {
      const [y, m] = k.split("-");
      const date = new Date(Number(y), Number(m) - 1, 1);
      const label = date.toLocaleString(undefined, { month: "short" });
      return { date: label, Sales: Math.round(totals[k]) };
    });
  };

  // ---------- orders fetch + realtime ----------
  useEffect(() => {
    if (!currentUserId) return;
    setLoadingOrders(true);
    let isMounted = true;
    let orderChannel: any = null;

    const fetchInitialOrders = async () => {
      try {
        const vendorIdCandidate = (vendorInfo as any)?.id ?? (vendorInfo as any)?.user_id ?? null;

        if (vendorIdCandidate) {
          try {
            const orFilter = `vendor_id.eq.${vendorIdCandidate},user_id.eq.${currentUserId}`;
            const { data, error } = await supabase.from("orders").select("*").or(orFilter).order("created_at", { ascending: false });
            if (error) {
              const msg = (error?.message ?? "").toString().toLowerCase();
              if (msg.includes("does not exist") || msg.includes("column")) {
                const { data: udata, error: uerr } = await supabase
                  .from("orders")
                  .select("*")
                  .eq("user_id", currentUserId)
                  .order("created_at", { ascending: false });
                if (uerr) {
                  console.error("Error fetching orders fallback:", uerr);
                } else if (isMounted) {
                  setOrders((udata || []) as Order[]);
                  setSalesGraph(computeSalesGraph((udata as Order[]) || []));
                }
                return;
              }
              console.error("Error fetching initial orders (unexpected):", error);
              return;
            }
            if (isMounted) {
              setOrders((data || []) as Order[]);
              setSalesGraph(computeSalesGraph((data as Order[]) || []));
            }
          } catch (err) {
            console.error("fetchInitialOrders OR query threw, falling back to user-only:", err);
            const { data: udata, error: uerr } = await supabase
              .from("orders")
              .select("*")
              .eq("user_id", currentUserId)
              .order("created_at", { ascending: false });
            if (uerr) console.error("Fallback user orders error:", uerr);
            else if (isMounted) {
              setOrders((udata || []) as Order[]);
              setSalesGraph(computeSalesGraph((udata as Order[]) || []));
            }
          }
        } else {
          const { data, error } = await supabase.from("orders").select("*").eq("user_id", currentUserId).order("created_at", { ascending: false });
          if (error) {
            console.error("Error fetching user orders:", error);
          } else if (isMounted) {
            setOrders((data || []) as Order[]);
            setSalesGraph(computeSalesGraph((data as Order[]) || []));
          }
        }
      } catch (err) {
        console.error("fetchInitialOrders error:", err);
      } finally {
        if (isMounted) setLoadingOrders(false);
      }
    };

    fetchInitialOrders();

    // Realtime subscription to orders table
    try {
      orderChannel = supabase
        .channel("public:orders")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (payload: any) => {
            const ev = payload.eventType ?? payload.type ?? payload.event;
            const newRow = payload.new;
            const oldRow = payload.old;
            const vendorId = (vendorInfo as any)?.id ?? (vendorInfo as any)?.user_id ?? null;

            const relevant = (row: any) => {
              if (!row) return false;
              if (vendorId && String(row.vendor_id) === String(vendorId)) return true;
              if (String(row.user_id) === String(currentUserId)) return true;
              return false;
            };

            if (ev === "INSERT" || ev === "INSERT:") {
              if (!relevant(newRow)) return;
              setOrders((prev) => {
                if (prev.find((p) => String(p.id) === String(newRow.id))) return prev;
                const next = [newRow as Order, ...prev];
                setSalesGraph(computeSalesGraph(next));
                return next;
              });
            } else if (ev === "UPDATE" || ev === "UPDATE:") {
              if (!relevant(newRow) && !relevant(oldRow)) return;
              setOrders((prev) => {
                const idx = prev.findIndex((p) => String(p.id) === String(newRow.id));
                let next = prev;
                if (idx >= 0) {
                  next = [...prev];
                  next[idx] = newRow as Order;
                } else {
                  next = [newRow as Order, ...prev];
                }
                setSalesGraph(computeSalesGraph(next));
                return next;
              });
              if (selectedOrder && String(selectedOrder.id) === String(newRow.id)) {
                setSelectedOrder(newRow as Order);
              }
            } else if (ev === "DELETE" || ev === "DELETE:") {
              if (!relevant(oldRow)) return;
              setOrders((prev) => {
                const next = prev.filter((p) => String(p.id) !== String(oldRow.id));
                setSalesGraph(computeSalesGraph(next));
                return next;
              });
              if (selectedOrder && String(selectedOrder.id) === String(oldRow.id)) {
                setSelectedOrder(null);
              }
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.error("order subscription creation failed:", err);
    }

    return () => {
      isMounted = false;
      if (orderChannel && typeof orderChannel.unsubscribe === "function") {
        try {
          orderChannel.unsubscribe();
        } catch (e) {
          console.warn("orderChannel unsubscribe err:", e);
        }
      } else if (orderChannel && typeof supabase.removeChannel === "function") {
        try {
          supabase.removeChannel(orderChannel);
        } catch (e) {
          console.warn("removeChannel error:", e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, vendorInfo]);

  // ---------- products fetch (resilient) ----------
  useEffect(() => {
    const vendorId = (vendorInfo as any)?.id ?? (vendorInfo as any)?.user_id ?? null;
    if (!vendorId) return;
    let mounted = true;
    let prodChannel: any = null;

    // resilient fetch: try vendor_product first, then products; check vendor_id (number/string) and vendor (uuid/string)
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const tables = ["vendor_product", "products"];
        let found: any[] = [];

        for (const tbl of tables) {
          // 1) try or filter (vendor_id OR vendor)
          try {
            // build naive or string - supabase or requires exact equality clauses
            const vendorIdStr = String(vendorId);
            const orFilter = `vendor_id.eq.${vendorIdStr},vendor.eq.${vendorIdStr}`;

            const { data, error } = await supabase
              .from(tbl)
              .select("*")
              .or(orFilter)
              .order("created_at", { ascending: false });

            if (!error && Array.isArray(data) && data.length > 0) {
              found = data;
              break;
            }
          } catch (e) {
            // ignore - try numeric path below
          }

          // 2) fallback: if vendorId is numeric, try numeric vendor_id equality
          if (/^\d+$/.test(String(vendorId))) {
            try {
              const { data: d2, error: e2 } = await supabase
                .from(tbl)
                .select("*")
                .eq("vendor_id", Number(vendorId))
                .order("created_at", { ascending: false });

              if (!e2 && Array.isArray(d2) && d2.length > 0) {
                found = d2;
                break;
              }
            } catch (e) {
              // continue
            }
          }

          // 3) fallback: try vendor field as string equality
          try {
            const { data: d3, error: e3 } = await supabase
              .from(tbl)
              .select("*")
              .eq("vendor", String(vendorId))
              .order("created_at", { ascending: false });

            if (!e3 && Array.isArray(d3) && d3.length > 0) {
              found = d3;
              break;
            }
          } catch (e) {
            // continue to next table
          }
        }

        // If still empty, optionally call your Express endpoint (uncomment and set correct base path)
        // try the backend route: /api/vendors/:vendorId/products
        if ((!found || found.length === 0) && typeof window !== "undefined") {
          try {
            // const base = process.env.REACT_APP_API_BASE ?? "";
            // const res = await fetch(`${base}/api/vendors/${encodeURIComponent(String(vendorId))}/products`);
            // if (res.ok) {
            //   const body = await res.json();
            //   found = body.products || [];
            //   console.log("fetched vendor products from backend", body.debug ?? {});
            // }
          } catch (e) {
            // ignore
          }
        }

        const normalized = (found || []).map((p: any) => ({ ...p, category: p.category ?? "Uncategorized" }));
        if (mounted) setProducts(normalized as ProductType[]);
      } catch (err) {
        console.error("Network error fetching vendor products:", err);
        if (mounted) setProducts([]);
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    };

    fetchProducts();

    try {
      prodChannel = supabase
        .channel("public:vendor_product")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "vendor_product" },
          (payload: any) => {
            const ev = payload.eventType ?? payload.type ?? payload.event;
            const newRow = payload.new;
            const oldRow = payload.old;

            const belongsToVendor = (row: any) => {
              if (!row) return false;
              return String(row.vendor_id) === String(vendorId) || String(row.vendor) === String(vendorId);
            };

            if (ev === "INSERT" || ev === "INSERT:") {
              if (!belongsToVendor(newRow)) return;
              setProducts((prev) => {
                if (prev.find((p) => String((p as any).id) === String(newRow.id))) return prev;
                return [{ ...newRow, category: newRow.category ?? "Uncategorized" } as ProductType, ...prev];
              });
            } else if (ev === "UPDATE" || ev === "UPDATE:") {
              if (!belongsToVendor(newRow) && !belongsToVendor(oldRow)) return;
              setProducts((prev) => {
                const idx = prev.findIndex((p) => String((p as any).id) === String(newRow.id));
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = { ...newRow, category: newRow.category ?? "Uncategorized" } as ProductType;
                  return next;
                } else {
                  return [{ ...newRow, category: newRow.category ?? "Uncategorized" } as ProductType, ...prev];
                }
              });
            } else if (ev === "DELETE" || ev === "DELETE:") {
              if (!belongsToVendor(oldRow)) return;
              setProducts((prev) => prev.filter((p) => String((p as any).id) !== String(oldRow.id)));
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.error("product subscription creation failed:", err);
    }

    return () => {
      mounted = false;
      if (prodChannel && typeof prodChannel.unsubscribe === "function") {
        try {
          prodChannel.unsubscribe();
        } catch (e) {
          console.warn("prodChannel unsubscribe err:", e);
        }
      } else if (prodChannel && typeof supabase.removeChannel === "function") {
        try {
          supabase.removeChannel(prodChannel);
        } catch (e) {
          console.warn("removeChannel error:", e);
        }
      }
    };
  }, [vendorInfo]);

  // --- remaining UI helpers and rendering (unchanged) ---
  const openPasswordModal = () => {
    setShowPasswordModal(true);
    setPasswordError("");
    setPasswordInput("");
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === "vendor2025") {
      setShowPasswordModal(false);
      if (isVendorPortal) {
        setIsVendorPortal(false);
        navigate("/vendor-portal");
      } else {
        setShowRevenueDialog(true);
      }
    } else {
      setPasswordError("Incorrect password.");
    }
  };

  // --- status badge helper (shows spinner for specific statuses) ---
  const renderStatusBadge = (status: string | undefined) => {
    const s = String(status ?? "").toLowerCase();
    if (s.includes("transit") || s.includes("in transit")) {
      return (
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-[rgba(250,240,205,0.15)] text-yellow-600 text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" /> In Transit
        </span>
      );
    }
    if (s.includes("process") || s.includes("processing")) {
      return (
        <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-[rgba(210,235,255,0.08)] text-blue-500 text-xs font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Processing
        </span>
      );
    }
    if (s.includes("placed")) {
      return <span className="px-2 py-1 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-xs font-medium">Placed</span>;
    }
    if (s.includes("out for")) {
      return <span className="px-2 py-1 rounded-full bg-[rgba(235,235,255,0.06)] text-indigo-600 text-xs font-medium">Out for Delivery</span>;
    }
    if (s.includes("deliver") || s.includes("delivered") || s.includes("confirm")) {
      // include confirmed as delivered-like badge
      return <span className="px-2 py-1 rounded-full bg-[rgba(16,185,129,0.12)] text-[rgba(16,185,129,0.95)] text-xs font-medium">Delivered</span>;
    }
    return <span className="px-2 py-1 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-xs font-medium">{status}</span>;
  };

  // ------------------------------------------------------------------
  // updateOrderStatus: call your Express backend /api/orders/:id/status
  // - optimistic UI update
  // - attach Supabase JWT
  // - merge response or refresh on error
  // ------------------------------------------------------------------
  async function updateOrderStatus(orderId: string | number, newStatus: string) {
    const idStr = String(orderId);

    // optimistic UI update
    setOrders((prev) => prev.map((o) => (String(o.id) === idStr ? { ...o, status: newStatus } : o)));
    if (selectedOrder && String(selectedOrder.id) === idStr) {
      setSelectedOrder({ ...selectedOrder, status: newStatus });
    }

    try {
      const sessionResp = await supabase.auth.getSession();
      const token = (sessionResp as any)?.data?.session?.access_token;

      const res = await fetch(`http://localhost:4000/orders/${encodeURIComponent(idStr)}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ message: res.statusText }));
        console.error("Error updating order status:", errBody);

        // refresh the single order from Supabase to avoid leaving stale optimistic state
        try {
          const { data } = await supabase.from("orders").select("*").eq("id", orderId).single();
          if (data) {
            setOrders((prev) => prev.map((o) => (String(o.id) === String(orderId) ? (data as Order) : o)));
            if (selectedOrder && String(selectedOrder.id) === String(orderId)) setSelectedOrder(data as Order);
          }
        } catch (refreshErr) {
          console.error("Failed to refresh order after update error:", refreshErr);
        }

        return;
      }

      // success — backend expected to return { order: ... } (or the updated row)
      const payload = await res.json().catch(() => null);
      const updated = payload?.order ?? payload ?? null;

      if (updated) {
        setOrders((prev) => prev.map((o) => (String(o.id) === String(updated.id) ? (updated as Order) : o)));
        if (selectedOrder && String(selectedOrder.id) === String(updated.id)) setSelectedOrder(updated as Order);
      }

      console.log("✅ Status updated:", updated);
    } catch (err) {
      console.error("💥 updateOrderStatus crash:", err);

      // attempt a refresh to avoid leaving stale optimistic UI
      try {
        const { data } = await supabase.from("orders").select("*").eq("id", orderId).single();
        if (data) {
          setOrders((prev) => prev.map((o) => (String(o.id) === String(orderId) ? (data as Order) : o)));
          if (selectedOrder && String(selectedOrder.id) === String(orderId)) setSelectedOrder(data as Order);
        }
      } catch (refreshErr) {
        console.error("Failed to refresh order after crash:", refreshErr);
      }
    }
  }

  const getStepClassLocal = (label: string, orderStatus: string) => {
    if (label === orderStatus) return "bg-green-600 text-white";
    const currentIndex = deliverySteps.findIndex((s) => s.status === orderStatus);
    const stepIndex = deliverySteps.findIndex((s) => s.status === label);
    return stepIndex < currentIndex
      ? "bg-green-100 text-green-700"
      : "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-gray-400";
  };

  const productsListed = products.length;

  // ------------------------
  // BUSINESS MATHS & METRICS
  // ------------------------
  // Helper: sum order items' true cost if available
  const orderTrueCost = (o: Order): number | null => {
    const items = normalizeItems(o.items);
    if (!items || items.length === 0) return null;
    let sum = 0;
    let anyCost = false;
    for (const it of items) {
      const qty = Number(it.quantity ?? it.qty ?? 1);
      const cost = it.cost ?? it.unit_cost ?? it.purchase_price ?? it.buy_price ?? null;
      if (cost != null && !isNaN(Number(cost))) {
        sum += Number(cost) * qty;
        anyCost = true;
      } else if (it.price != null && !isNaN(Number(it.price))) {
        // if only price is available but not cost, we can't derive cost — skip
      }
    }
    return anyCost ? sum : null;
  };

  const overviewMetrics = useMemo(() => {
    // We will compute:
    // totalRevenue (delivered + confirmed), totalOrdersRevenue (count), estimatedProfit, losses (cancelled/refunded), avgOrderValue,
    // ordersThisMonth, ordersPreviousMonth, percentChangeOrders, revenueThisMonth, revenuePrevMonth, revenuePercentChange
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;

    let totalRevenue = 0;
    let revenueThisMonth = 0;
    let revenuePrevMonth = 0;
    let revenueCountThisMonth = 0;
    let revenueCountPrevMonth = 0;
    let cancelledLosses = 0;
    let revenueOrdersCount = 0;
    let sumOrderValue = 0;

    // for profit calculation
    let totalActualCosts = 0;
    let anyActualCost = false;

    for (const o of orders) {
      const status = String(o.status ?? "").toLowerCase();
      const amount = Number(o.amount ?? o.total_amount ?? 0);
      const rawDate = o.date ?? o.created_at ?? o.delivered_at ?? null;
      const d = rawDate ? new Date(rawDate) : null;
      const monthKey = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : null;

      // Losses: cancelled or refunded (try to support 'cancel' and 'refund' keywords)
      if (status.includes("cancel") || status.includes("refund")) {
        cancelledLosses += amount;
      }

      // Revenue-producing statuses: delivered or confirmed
      if (status === "delivered" || status === "confirmed") {
        totalRevenue += amount;
        revenueOrdersCount += 1;
        sumOrderValue += amount;

        if (monthKey === currentMonthKey) {
          revenueThisMonth += amount;
          revenueCountThisMonth += 1;
        }
        if (monthKey === prevMonthKey) {
          revenuePrevMonth += amount;
          revenueCountPrevMonth += 1;
        }

        // try to compute real cost
        const trueCost = orderTrueCost(o);
        if (trueCost != null) {
          totalActualCosts += trueCost;
          anyActualCost = true;
        } else {
          // nothing to add — we'll use fallback later
        }
      }
    }

    // estimated profit:
    // if we have any actual costs, use them:
    let estimatedProfit = 0;
    if (anyActualCost) {
      estimatedProfit = totalRevenue - totalActualCosts;
    } else {
      // fallback: assume a gross margin
      estimatedProfit = totalRevenue * ASSUMED_GROSS_MARGIN;
    }

    const avgOrderValue = revenueOrdersCount > 0 ? sumOrderValue / revenueOrdersCount : 0;

    // order counts this vs previous month
    const ordersThisMonth = orders.filter((o) => {
      const d = new Date(o.date ?? o.created_at ?? o.delivered_at ?? "");
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const ordersPrevMonth = orders.filter((o) => {
      const d = new Date(o.date ?? o.created_at ?? o.delivered_at ?? "");
      if (isNaN(d.getTime())) return false;
      const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === pm.getFullYear() && d.getMonth() === pm.getMonth();
    }).length;

    const ordersPercentChange = ordersPrevMonth === 0 ? (ordersThisMonth === 0 ? 0 : 100) : ((ordersThisMonth - ordersPrevMonth) / ordersPrevMonth) * 100;
    const revenuePercentChange = revenuePrevMonth === 0 ? (revenueThisMonth === 0 ? 0 : 100) : ((revenueThisMonth - revenuePrevMonth) / revenuePrevMonth) * 100;

    return {
      totalRevenue,
      estimatedProfit,
      cancelledLosses,
      avgOrderValue,
      ordersThisMonth,
      ordersPrevMonth,
      ordersPercentChange,
      revenueThisMonth,
      revenuePrevMonth,
      revenuePercentChange,
      revenueOrdersCount,
    };
  }, [orders]);

  useEffect(() => {
    setSalesGraph(computeSalesGraph(orders));
  }, [orders]);

  // ------------------------
  // Push products to homepage functions (use featured_at & featured_until)
  // ------------------------
  const toggleSelectProduct = (id: any) => {
    const sid = String(id);
    setSelectedProductIds((prev) => {
      if (prev.includes(sid)) return prev.filter((p) => p !== sid);
      return [...prev, sid];
    });
  };

  const refetchVendorProducts = async () => {
    const vendorId = (vendorInfo as any)?.id ?? (vendorInfo as any)?.user_id ?? null;
    if (!vendorId) return;
    try {
      const { data, error } = await supabase.from("vendor_product").select("*").eq("vendor_id", vendorId).order("created_at", { ascending: false });
      if (!error) {
        setProducts((data || []) as ProductType[]);
      } else {
        console.warn("refetch vendor products error:", error);
      }
    } catch (err) {
      console.error("refetch vendor products failed:", err);
    }
  };

  const pushSelectedToHomepage = async () => {
    if (selectedProductIds.length === 0) {
      alert("Select products to push to homepage.");
      return;
    }
    setPushing(true);
    try {
      const nowIso = new Date().toISOString();
      const untilIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

      // Optimistic local update: set featured_at/featured_until locally
      setProducts((prev) =>
        prev.map((p) =>
          selectedProductIds.includes(String((p as any).id))
            ? { ...(p as any), featured_at: nowIso, featured_until: untilIso }
            : p
        )
      );

      // Update Supabase: set featured_at and featured_until only
      const { error } = await supabase
        .from("vendor_product")
        .update({ featured_at: nowIso, featured_until: untilIso })
        .in("id", selectedProductIds);

      if (error) {
        console.error("Failed to mark featured:", error);
        alert("Failed to push products to homepage. See console.");
        // rollback by refetching vendor products
        await refetchVendorProducts();
        return;
      }

      alert("Products pushed to homepage for 24 hours.");
      setPushModalOpen(false);
      setSelectedProductIds([]);
    } catch (err) {
      console.error("pushSelectedToHomepage error:", err);
      alert("Failed to push products to homepage.");
      await refetchVendorProducts();
    } finally {
      setPushing(false);
    }
  };

  // helper to determine if product is still featured now
  const isProductFeaturedNow = (p: any) => {
    try {
      const until = p?.featured_until ? new Date(p.featured_until) : null;
      return until && until.getTime() > Date.now();
    } catch {
      return false;
    }
  };

  // --- remaining UI and rendering (unchanged) ---
  return (
    <div className="min-h-screen px-6 py-8 bg-[linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.01))]">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-gray-100">Vendor Dashboard</h1>
            {vendorInfo && (
              <>
                <p className="text-sm text-gray-500 mt-1">
                  Welcome, <span className="font-medium text-gray-900 dark:text-gray-100">{vendorInfo.business_name}</span> — <span className="text-gray-500">{vendorInfo.category}</span>
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowPasswordModal(true);
                      setPasswordError("");
                      setPasswordInput("");
                      setIsVendorPortal(true);
                    }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(16,185,129,0.95)] text-black text-sm hover:brightness-95"
                  >
                    Go to Vendor Portal
                  </button>
                  <button
                    onClick={() => setShowRevenueDialog(true)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(16,185,129,0.12)] text-[rgba(16,185,129,0.95)] text-sm hover:bg-[rgba(16,185,129,0.16)]"
                  >
                    View Revenue
                  </button>
                </div>
              </>
            )}
          </div>
          <Link to="/" className="flex items-center gap-2 px-4 py-2 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-sm hover:shadow-sm">
            <LogOut className="w-5 h-5 text-gray-700 dark:text-gray-200" /> <span className="text-gray-700 dark:text-gray-200">Logout</span>
          </Link>
        </header>

        {vendorInfo?.lowStock && (
          <div className="mb-6 p-4 rounded-xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <div className="text-sm text-yellow-600 font-medium">Low stock alert</div>
            <div className="text-sm text-gray-500 mt-1">Only {vendorInfo.lowStock} items left — consider restocking soon.</div>
          </div>
        )}

        {/* NEW: Push products to homepage button (before tabs) */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <button
              onClick={() => setPushModalOpen(true)}
              className="px-3 py-2 rounded-md bg-[rgba(16,185,129,0.95)] text-black text-sm hover:brightness-95"
            >
              Push Products to Homepage
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-500">Revenue: <span className="font-medium text-gray-900 dark:text-gray-100">${overviewMetrics.totalRevenue.toFixed(2)}</span></div>
            <div className="text-sm text-gray-500">Estimated Profit: <span className="font-medium text-gray-900 dark:text-gray-100">${overviewMetrics.estimatedProfit.toFixed(2)}</span></div>
          </div>
        </div>

        <nav className="flex flex-wrap gap-2 sm:space-x-4 border-b border-[rgba(255,255,255,0.03)] mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`flex items-center gap-2 px-3 py-2 -mb-px font-medium text-sm sm:text-base rounded-t-lg ${
                activeTab === tab.name
                  ? "border-b-2 border-[rgba(16,185,129,0.95)] text-[rgba(16,185,129,0.95)]"
                  : "text-gray-600 dark:text-gray-300"
              }`}
            >
              {tab.icon}
              {tab.name}
            </button>
          ))}
        </nav>

        {showPasswordModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="rounded-2xl p-5 w-full max-w-sm" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Enter Password</h2>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter vendor password"
                  className="w-full p-3 rounded-xl bg-[rgba(0,0,0,0.02)] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-900 dark:text-gray-100"
                />
                <button
                  className="absolute right-3 top-3 text-gray-500"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordError && <p className="text-red-500 text-sm mt-2">{passwordError}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  onClick={handlePasswordSubmit}
                  className="flex-1 px-4 py-2 rounded-full bg-[rgba(16,185,129,0.95)] text-black text-sm"
                >
                  Submit
                </button>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 px-4 py-2 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Push products modal */}
        {pushModalOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
            <div className="rounded-2xl w-full max-w-2xl p-5" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Push Products to Homepage</h3>
                <div className="flex gap-2">
                  <button onClick={() => { setPushModalOpen(false); setSelectedProductIds([]); }} className="px-3 py-1 text-sm rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">Close</button>
                  <button disabled={pushing} onClick={pushSelectedToHomepage} className="px-3 py-1 rounded-full bg-[rgba(16,185,129,0.95)] text-black text-sm">
                    {pushing ? "Pushing..." : "Push Selected"}
                  </button>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => {
                  const pid = String((p as any).id);
                  const checked = selectedProductIds.includes(pid);
                  const featuredLabel = isProductFeaturedNow(p) ? "Featured" : "";
                  return (
                    <label key={pid} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleSelectProduct(pid)} className="mt-1" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{(p as any).name ?? (p as any).title}</div>
                        <div className="text-xs text-gray-500 mt-1">{(p as any).category ?? "Uncategorized"}</div>
                      </div>
                      <div className="text-sm text-[rgba(16,185,129,0.95)]">{featuredLabel}</div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {showRevenueDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="rounded-2xl p-5 w-full max-w-sm" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Revenue Details</h3>
              <p className="text-sm text-gray-600">Revenue (Delivered or Confirmed): <span className="font-medium text-gray-900 dark:text-gray-100">${overviewMetrics.totalRevenue.toFixed(2)}</span></p>
              <p className="text-sm text-gray-600 mt-1">Estimated Profit: <span className="font-medium text-gray-900 dark:text-gray-100">${overviewMetrics.estimatedProfit.toFixed(2)}</span></p>
              <p className="text-sm text-gray-600 mt-1">Losses (cancelled/refunded): <span className="font-medium text-gray-900 dark:text-gray-100">${overviewMetrics.cancelledLosses.toFixed(2)}</span></p>
              <p className="text-sm text-gray-600 mt-1">Orders this month: <span className="font-medium text-gray-900 dark:text-gray-100">{overviewMetrics.ordersThisMonth}</span></p>
              <p className="text-sm text-gray-600 mt-1">Orders previous month: <span className="font-medium text-gray-900 dark:text-gray-100">{overviewMetrics.ordersPrevMonth}</span></p>
              <p className="text-sm text-gray-600 mt-1">Avg order value: <span className="font-medium text-gray-900 dark:text-gray-100">${overviewMetrics.avgOrderValue.toFixed(2)}</span></p>
              <button
                onClick={() => setShowRevenueDialog(false)}
                className="mt-4 px-4 py-2 rounded-full bg-[rgba(16,185,129,0.95)] text-black text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {activeTab === "Overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6 mb-6">
            <div className="p-4 sm:p-6 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm uppercase text-gray-500">Total Revenue</h3>
                <button onClick={openPasswordModal} title="Reveal" className="text-gray-500">
                  <Eye className="w-4 h-4" />
                </button>
              </div>
              <p className="text-2xl font-semibold mt-3 text-gray-900 dark:text-gray-100">${overviewMetrics.totalRevenue.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Delivered + Confirmed</p>
            </div>
            <div className="p-4 sm:p-6 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <h3 className="text-sm uppercase text-gray-500">Estimated Profit</h3>
              <p className="text-2xl font-semibold mt-3 text-gray-900 dark:text-gray-100">${overviewMetrics.estimatedProfit.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Using item costs when available, otherwise {Math.round(ASSUMED_GROSS_MARGIN * 100)}% margin</p>
            </div>
            <div className="p-4 sm:p-6 rounded-2xl" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
              <h3 className="text-sm uppercase text-gray-500">Orders (this vs prev)</h3>
              <p className="text-2xl font-semibold mt-3 text-gray-900 dark:text-gray-100">{overviewMetrics.ordersThisMonth} / {overviewMetrics.ordersPrevMonth}</p>
              <p className="text-xs text-gray-500 mt-1">Change: {overviewMetrics.ordersPercentChange.toFixed(1)}%</p>
            </div>
          </div>
        )}

        {activeTab === "Orders" && (
          <div className="rounded-2xl p-4 sm:p-6" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Recent Orders</h2>
            <input
              type="text"
              placeholder="Search orders..."
              className="w-full p-3 mb-4 rounded-xl bg-[rgba(0,0,0,0.02)] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 text-gray-900 dark:text-gray-100 text-sm"
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="border-b border-[rgba(255,255,255,0.03)]">
                  <tr>
                    <th className="py-3 px-2 sm:px-4 text-gray-500">ID</th>
                    <th className="py-3 px-2 sm:px-4 text-gray-500">Item</th>
                    <th className="py-3 px-2 sm:px-4 text-gray-500 hidden sm:table-cell">Date</th>
                    <th className="py-3 px-2 sm:px-4 text-gray-500">Status</th>
                    <th className="py-3 px-2 sm:px-4 text-gray-500">Amount</th>
                    <th className="py-3 px-2 sm:px-4 text-gray-500">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOrders ? (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-center text-sm text-gray-500">Loading orders…</td>
                    </tr>
                  ) : orders
                      .filter((o) =>
                        !searchQuery
                          ? true
                          : ((o.item ?? "") + (o.id ?? "")).toString().toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map((o) => (
                        <tr key={String(o.id)} className="border-b border-[rgba(255,255,255,0.03)]">
                          <td className="py-3 px-2 sm:px-4 align-top text-gray-900 dark:text-gray-100">{o.id}</td>
                          <td className="py-3 px-2 sm:px-4 align-top">
                            <div className="flex items-center gap-3">
                              {Array.isArray(normalizeItems(o.items)) && normalizeItems(o.items)[0]?.product_image ? (
                                <img src={normalizeItems(o.items)[0].product_image} alt={normalizeItems(o.items)[0].product_title || o.item} className="w-10 h-10 object-cover rounded-md" />
                              ) : null}
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">{o.item}</div>
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {normalizeItems(o.items).length ? (normalizeItems(o.items).length + " item(s)") : ""}
                                  {o.vendor_id ? <span className="ml-2 px-1 py-0.5 rounded bg-[rgba(255,255,255,0.02)] text-xs">Vendor</span> : null}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 sm:px-4 hidden sm:table-cell align-top text-gray-500">{(o.date ?? o.created_at ?? "").substring(0, 10)}</td>
                          <td className="py-3 px-2 sm:px-4 align-top">{renderStatusBadge(o.status)}</td>
                          <td className="py-3 px-2 sm:px-4 align-top text-gray-900 dark:text-gray-100">${Number(o.amount ?? o.total_amount ?? 0).toFixed(2)}</td>
                          <td className="py-3 px-2 sm:px-4 align-top">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setSelectedOrder(o)}
                                className="text-[rgba(16,185,129,0.95)] hover:underline text-sm"
                              >
                                Track
                              </button>
                              <button
                                onClick={() => {
                                  const currentIdx = deliverySteps.findIndex((s) => s.status === o.status);
                                  const next = currentIdx >= 0 && currentIdx < deliverySteps.length - 1 ? deliverySteps[currentIdx + 1].status : deliverySteps[0].status;
                                  updateOrderStatus(o.id, next);
                                }}
                                title="Move status forward"
                                className="px-2 py-1 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-xs"
                              >
                                Advance
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  {orders.length === 0 && !loadingOrders && (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-center text-sm text-gray-500">No orders yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "Products" && (
          <div className="rounded-2xl p-4 sm:p-6" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Products</h2>
            {loadingProducts ? (
              <p className="text-gray-500">Loading products…</p>
            ) : products.length === 0 ? (
              <p className="text-gray-500">No products listed yet.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((p) => (
                  <ProductCard key={(p as any).id} product={p} onAddToCart={() => {}} onBuyNow={() => {}} />
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "Deliveries" && (
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            <h1 className="text-2xl sm:text-3xl font-semibold text-center text-gray-900 dark:text-gray-100">Manage Deliveries</h1>
            {selectedOrder ? (
              <div className="rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Order #{selectedOrder.id}: {selectedOrder.item}</h2>

                <div className="grid grid-cols-1 gap-3 mt-4">
                  {normalizeItems(selectedOrder.items).length === 0 ? (
                    <p className="text-sm text-gray-500">No items data</p>
                  ) : (
                    normalizeItems(selectedOrder.items).map((it: any, i: number) => {
                      const title = it.product_title ?? it.name ?? it.title ?? String(it.id ?? "");
                      const image = it.product_image ?? it.image ?? null;
                      const productStatus = it.status ?? selectedOrder.status;
                      return (
                        <div key={i} className="flex items-center gap-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                          {image ? (
                            <img src={image} alt={title} className="w-16 h-16 object-cover rounded-md" />
                          ) : (
                            <div className="w-16 h-16 bg-[rgba(0,0,0,0.04)] rounded-md flex items-center justify-center text-xs text-gray-500">
                              No image
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{title}</div>
                            <div className="text-sm text-gray-500 mt-1">Qty: {it.quantity ?? it.qty ?? 1}</div>
                          </div>
                          <div>{renderStatusBadge(productStatus)}</div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="space-y-4 mt-4">
                  {deliverySteps.map((step, idx) => (
                    <div key={idx} className="flex items-start gap-4 relative">
                      <div className="relative z-10">
                        <div
                          className={`flex items-center justify-center w-10 h-10 rounded-full ${getStepClassLocal(
                            step.status,
                            selectedOrder.status ?? ""
                          )}`}
                        >
                          {step.status === "In Transit" && String(selectedOrder.status).toLowerCase().includes("transit") ? (
                            <Loader2 className="w-5 h-5 animate-spin text-white" />
                          ) : (
                            step.icon
                          )}
                        </div>
                        {idx < deliverySteps.length - 1 && (
                          <div className="absolute left-1/2 -translate-x-1/2 top-10 h-8 w-1 bg-[rgba(255,255,255,0.03)] z-0" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100">{step.label}</h3>
                        <div className="mt-2 flex gap-2">
                          <button
                            onClick={() => updateOrderStatus(selectedOrder.id, step.status)}
                            className={`px-4 py-1 text-sm rounded-full ${
                              step.status === selectedOrder.status
                                ? "bg-[rgba(16,185,129,0.95)] text-black"
                                : "bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-gray-700 hover:brightness-95"
                            }`}
                          >
                            Mark as {step.label}
                          </button>

                          {step.status === "In Transit" && String(selectedOrder.status).toLowerCase().includes("transit") && (
                            <div className="inline-flex items-center text-sm text-gray-600">
                              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Updating transit...
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setSelectedOrder(null)}
                  className="mt-4 px-4 py-2 rounded-full bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] text-sm"
                >
                  Back to Orders
                </button>
              </div>
            ) : (
              <p className="text-center text-gray-500">Select an order from the Orders tab to manage its delivery status.</p>
            )}
          </div>
        )}

        {activeTab === "Analytics" && (
          <div className="rounded-2xl p-4 sm:p-6" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.03)" }}>
            <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Sales Over Time (Delivered + Confirmed)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={salesGraph.length ? salesGraph : [{ date: "Jan", Sales: 0 }]}>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="Sales" stroke="#4ade80" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                <div className="text-xs text-gray-500">Revenue This Month</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">${overviewMetrics.revenueThisMonth.toFixed(2)}</div>
                <div className="text-xs text-gray-500 mt-1">Change: {overviewMetrics.revenuePercentChange.toFixed(1)}%</div>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                <div className="text-xs text-gray-500">Revenue Prev Month</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">${overviewMetrics.revenuePrevMonth.toFixed(2)}</div>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.03)" }}>
                <div className="text-xs text-gray-500">Losses (Cancelled/Refunded)</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">${overviewMetrics.cancelledLosses.toFixed(2)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VendorDashboardPage;
