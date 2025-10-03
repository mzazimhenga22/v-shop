// src/components/OrdersTab.tsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import {
  CalendarDays,
  MapPin,
  CreditCard,
  Truck,
  Package,
  Bike,
  Loader2,
  Check,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface OrderItem {
  id: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  status?: string;
  vendor?: boolean;
  vendor_id?: string | null;
  vendor_name?: string | null;
  product_image?: string;
  product_title?: string;
  cost?: number;
  title?: string;
}

interface Order {
  id: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  user_id?: string | null;
  name?: string;
  email?: string;
  status?: string;
  total_amount?: number;
  payment_method?: string;
  payment_status?: string;
  shipping_address?: string;
  items?: any;
  created_at?: string;
  delivered_at?: string | null;
  [k: string]: any;
}

type Notification = {
  id: number;
  type: "error" | "success" | "info";
  message: string;
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// attach Supabase session token automatically for every request
api.interceptors.request.use(async (config) => {
  try {
    const sessionResp = await supabase.auth.getSession();
    const token = (sessionResp as any)?.data?.session?.access_token;
    if (token) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      } as any;
    }
  } catch (err) {
    console.warn("Could not attach supabase token to request:", err);
  }
  return config;
});

const deliverySteps = [
  { label: "Order Placed", icon: <Package className="w-5 h-5" />, status: "Order Placed" },
  { label: "Processing", icon: <Loader2 className="w-5 h-5 animate-spin" />, status: "Processing" },
  { label: "In Transit", icon: <Truck className="w-5 h-5" />, status: "In Transit" },
  { label: "Out for Delivery", icon: <Bike className="w-5 h-5" />, status: "Out for Delivery" },
  { label: "Delivered", icon: <Check className="w-5 h-5" />, status: "Delivered" },
];

const OrdersTab: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // tab: "all" | "paid" | "unpaid"
  const [activeTab, setActiveTab] = useState<"all" | "paid" | "unpaid">("all");

  // local user info
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);

  // admin detection
  const [isAdminLocal, setIsAdminLocal] = useState<boolean>(false);
  const [isAdminServer, setIsAdminServer] = useState<boolean | null>(null);

  // vendor name cache to avoid repeat lookups
  const vendorNameCache = useRef<Map<string, string | null>>(new Map());

  // guard to avoid double-fetch in React StrictMode during development
  const initialFetchDone = useRef<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await supabase.auth.getSession();
        const session = (resp as any)?.data?.session ?? null;
        const user = session?.user ?? null;
        if (user) {
          setCurrentUserId(String(user.id));
          const appRole = (user as any)?.app_metadata?.role ?? null;
          const userRole = (user as any)?.user_metadata?.role ?? null;
          setCurrentUserRole((appRole || userRole || null) as string | null);

          const md = (user as any)?.user_metadata ?? {};
          const adminFlag = md?.isAdmin ?? null;
          const localIsAdmin =
            adminFlag === true ||
            String(adminFlag).toLowerCase() === "true" ||
            String(appRole).toLowerCase() === "admin";
          setIsAdminLocal(Boolean(localIsAdmin));
        } else {
          setIsAdminLocal(false);
        }
      } catch (err) {
        console.warn("Error reading supabase session user:", err);
      }

      try {
        const probe = await api.get("/admin/users?limit=1");
        setIsAdminServer(Boolean(probe.status >= 200 && probe.status < 300));
      } catch {
        setIsAdminServer(false);
      }
    })();
  }, []);

  const pushNotification = (type: Notification["type"], message: string, ttl = 6000) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotifications((prev) => [...prev, { id, type, message }]);
    if (ttl > 0) {
      setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), ttl);
    }
  };
  const dismissNotification = (id: number) =>
    setNotifications((prev) => prev.filter((n) => n.id !== id));

  // normalize items from order -> always return array
  const normalizeItems = (raw: any): OrderItem[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.items)) return parsed.items;
        return [];
      } catch {
        return [];
      }
    }
    if (typeof raw === "object" && Array.isArray((raw as any).items))
      return (raw as any).items;
    return [];
  };

  // derive vendor info from items when top-level vendor_name is missing
  function deriveVendorFromItemsForOrders(inputOrders: Order[]) {
    for (const o of inputOrders) {
      if (o.vendor_name && o.vendor_id) continue; // already set

      const items = normalizeItems(o.items);
      if (items.length === 0) continue;

      const vendorIds = Array.from(new Set(items.map((it: any) => it.vendor_id).filter(Boolean).map(String)));
      const vendorNames = Array.from(new Set(items.map((it: any) => it.vendor_name).filter(Boolean).map(String)));

      // if all items belong to same vendor_id, set it
      if (vendorIds.length === 1) {
        o.vendor_id = vendorIds[0];
      }

      // if all items report same vendor_name, set it
      if (vendorNames.length === 1) {
        o.vendor_name = vendorNames[0];
      }
    }
  }

  // Helper: batch-resolve vendor names for a list of orders (uses supabase, caches results)
  async function enrichVendorNames(currentOrders: Order[]) {
    // gather vendor ids that are missing a name and not already in cache
    const vendorIds = Array.from(
      new Set(
        currentOrders
          .map((o) => o.vendor_id)
          .filter(Boolean)
          .map((v) => String(v))
          .filter((v) => !vendorNameCache.current.has(v))
      )
    );

    if (vendorIds.length === 0) return;

    try {
      const { data: vpwRows, error: vpwErr } = await supabase
        .from("vendor_profiles_with_user")
        .select("id, vendor_name, display_name, company_name, user_id")
        .in("id", vendorIds);

      if (!vpwErr && Array.isArray(vpwRows)) {
        for (const r of vpwRows) {
          const id = String((r as any).id);
          const name =
            (r as any).vendor_name ?? (r as any).display_name ?? (r as any).company_name ?? null;
          vendorNameCache.current.set(id, name);
        }
      }
    } catch (err) {
      console.warn("vendor_profiles_with_user lookup failed:", err);
    }

    const unresolved1 = vendorIds.filter((id) => !vendorNameCache.current.has(id));

    if (unresolved1.length > 0) {
      try {
        const { data: vpRows, error: vpErr } = await supabase
          .from("vendor_profiles")
          .select("id, vendor_name, display_name, company_name, name")
          .in("id", unresolved1);

        if (!vpErr && Array.isArray(vpRows)) {
          for (const r of vpRows) {
            const id = String((r as any).id);
            const name =
              (r as any).vendor_name ??
              (r as any).display_name ??
              (r as any).company_name ??
              (r as any).name ??
              null;
            vendorNameCache.current.set(id, name);
          }
        }
      } catch (err) {
        console.warn("vendor_profiles lookup failed:", err);
      }
    }

    const unresolved2 = vendorIds.filter((id) => !vendorNameCache.current.has(id));
    if (unresolved2.length > 0) {
      try {
        const { data: vRows, error: vErr } = await supabase
          .from("vendors")
          .select("id, name, vendor_name, display_name, company_name")
          .in("id", unresolved2);

        if (!vErr && Array.isArray(vRows)) {
          for (const r of vRows) {
            const id = String((r as any).id);
            const name =
              (r as any).vendor_name ??
              (r as any).display_name ??
              (r as any).company_name ??
              (r as any).name ??
              null;
            vendorNameCache.current.set(id, name);
          }
        }
      } catch (err) {
        console.warn("vendors lookup failed:", err);
      }
    }

    const unresolvedFinal = vendorIds.filter((id) => !vendorNameCache.current.has(id));
    for (const id of unresolvedFinal) vendorNameCache.current.set(id, null);

    // apply cached names to orders that are missing vendor_name
    setOrders((prevOrders) =>
      prevOrders.map((o) => {
        if (!o.vendor_id) return o;
        const id = String(o.vendor_id);
        const cached = vendorNameCache.current.get(id);
        // only override if vendor_name is missing/falsey
        if (o.vendor_name) return o;
        return { ...o, vendor_name: cached ?? null };
      })
    );
  }

  const fetchOrders = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await api.get("/orders");
      const fetched: Order[] = res.data.orders ?? res.data ?? [];

      // dedupe by id (keep first occurrence)
      const dedupMap = new Map<string, Order>();
      for (const o of fetched) {
        if (!o || !o.id) continue;
        const key = String(o.id);
        if (!dedupMap.has(key)) dedupMap.set(key, o);
      }
      const deduped = Array.from(dedupMap.values());

      // derive vendor info from per-item vendor fields when top-level missing
      deriveVendorFromItemsForOrders(deduped);

      // optimistically set orders (so UI reacts quickly)
      setOrders(deduped);

      // attempt to enrich vendor_name for any remaining orders missing it
      enrichVendorNames(deduped).catch((e) => {
        console.warn("Vendor name enrichment failed:", e);
      });
    } catch (err: any) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Unknown error fetching orders";
      setFetchError(message);
      pushNotification("error", `Failed to load orders: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  // only run fetchOrders once on mount (avoid StrictMode double-run)
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update order status
  async function updateOrderStatus(orderId: string | number, newStatus: string) {
    setBusy(true);
    try {
      const res = await api.put(`/orders/${encodeURIComponent(String(orderId))}/status`, { status: newStatus });

      if (res.status >= 200 && res.status < 300) {
        pushNotification("success", `Order updated to "${newStatus}"`);
        await fetchOrders();
        if (selectedOrder && String(selectedOrder.id) === String(orderId)) {
          try {
            const q = await api.get(`/orders/${encodeURIComponent(String(orderId))}`);
            setSelectedOrder(q.data.order ?? q.data);
          } catch {
            setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : prev));
          }
        }
      } else {
        const msg = (res.data && (res.data.error || res.data.message)) || res.statusText;
        throw new Error(msg);
      }
    } catch (err: any) {
      if (err?.response?.status === 403) {
        const serverMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Forbidden";
        pushNotification("error", `Forbidden: ${serverMsg}. (Client allows admin via auth metadata but server denied the action.)`);
        console.warn("Permission denied updating order status:", {
          orderId,
          serverMsg,
          currentUserId,
          currentUserRole,
          isAdminLocal,
          isAdminServer,
          orderVendorId: orders.find((o) => String(o.id) === String(orderId))?.vendor_id,
        });
      } else {
        const message = err?.response?.data?.error || err?.message || String(err);
        pushNotification("error", `Failed to update status: ${message}`);
        console.error("updateOrderStatus error:", err);
      }
    } finally {
      setBusy(false);
    }
  }

  // Search + Tab filter
  const filtered = useMemo(() => {
    let base = orders;
    if (activeTab === "paid") {
      base = base.filter(
        (o) => String(o.payment_status).toLowerCase() === "paid"
      );
    } else if (activeTab === "unpaid") {
      base = base.filter(
        (o) =>
          String(o.payment_status).toLowerCase() === "unpaid" ||
          String(o.payment_status).toLowerCase() === "pending"
      );
    }
    if (!searchQuery) return base;
    const q = searchQuery.toLowerCase();
    return base.filter((o) => {
      const hay = `${o.id} ${o.name} ${o.email} ${o.status} ${o.payment_status} ${o.vendor_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [orders, searchQuery, activeTab]);

  const NotificationsBar = () => (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`max-w-sm w-full shadow-lg rounded-md px-4 py-2 flex items-start gap-3 ${
            n.type === "error"
              ? "bg-red-50 text-red-800"
              : n.type === "success"
              ? "bg-green-50 text-green-800"
              : "bg-blue-50 text-blue-800"
          }`}
        >
          <div className="flex-1 text-sm">{n.message}</div>
          <button
            onClick={() => dismissNotification(n.id)}
            className="opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );

  if (loading)
    return (
      <div className="text-center py-12">
        <Loader2 className="mx-auto animate-spin" />
        <p className="mt-3">Loading orders...</p>
      </div>
    );

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <NotificationsBar />
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold">Could not load orders</p>
              <p className="text-sm text-yellow-700 mt-1">{fetchError}</p>
            </div>
            <button
              onClick={() => fetchOrders()}
              className="px-3 py-1 bg-yellow-600 text-white rounded text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (orders.length === 0)
    return <p className="text-center text-gray-500">No orders found.</p>;

  // Selected-order detail panel
  if (selectedOrder) {
    const items = normalizeItems(selectedOrder.items);
    const orderVendorId = selectedOrder.vendor_id ? String(selectedOrder.vendor_id) : null;
    const allowedToManage = (() => {
      if (!selectedOrder) return false;
      if (isAdminLocal) return true;
      if (currentUserRole && String(currentUserRole).toLowerCase() === "admin")
        return true;
      if (
        currentUserId &&
        selectedOrder.vendor_id &&
        String(currentUserId) === String(selectedOrder.vendor_id)
      )
        return true;
      return false;
    })();

    return (
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
        <NotificationsBar />
        <button
          onClick={() => setSelectedOrder(null)}
          className="px-3 py-1 text-sm rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 transition"
        >
          ← Back to Orders
        </button>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Order #{String(selectedOrder.id).slice(0, 8)} — {selectedOrder.name ?? selectedOrder.email}
            </h2>
            <div className="text-sm text-gray-500">{renderStatusBadge(selectedOrder.status)}</div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {items.length === 0 ? (
              <p className="text-sm text-gray-500">No items data</p>
            ) : (
              items.map((it: OrderItem, i: number) => {
                const title = it.product_title ?? it.name ?? it.title ?? String(it.id ?? "");
                const image = it.product_image ?? it.image ?? null;
                const productStatus = it.status ?? selectedOrder.status;

                return (
                  <div key={i} className="flex items-center gap-4 p-3 border rounded-md bg-gray-50 dark:bg-gray-900">
                    {image ? (
                      <img src={image} alt={title} className="w-16 h-16 object-cover rounded" />
                    ) : (
                      <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-500">
                        No image
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{title}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-300">Qty: {it.quantity ?? 1}</div>
                      {it.vendor_name && <div className="text-xs text-gray-400">Seller: {it.vendor_name}</div>}
                    </div>
                    <div>{renderStatusBadge(productStatus)}</div>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-4">
            {deliverySteps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-4 relative">
                <div className="relative z-10">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${getStepClassLocal(step.status, selectedOrder.status)}`}>
                    {step.status === "In Transit" && String(selectedOrder.status ?? "").toLowerCase().includes("transit") ? (
                      <Loader2 className="w-5 h-5 animate-spin text-white" />
                    ) : (
                      step.icon
                    )}
                  </div>
                  {idx < deliverySteps.length - 1 && <div className="absolute left-1/2 -translate-x-1/2 top-10 h-8 w-1 bg-gray-300 dark:bg-gray-700 z-0" />}
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{step.label}</h3>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => updateOrderStatus(selectedOrder.id, step.status)}
                      className={`px-4 py-1 text-sm rounded-full ${step.status === selectedOrder.status ? "bg-green-600 text-white" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                      disabled={busy || !allowedToManage}
                      title={!allowedToManage ? "You don't have permission to update this order (vendor-only or admin)." : undefined}
                    >
                      {busy && <Loader2 className="inline-block mr-2 animate-spin" />} Mark as {step.label}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="text-sm">
              <div>
                <strong>Customer:</strong> {selectedOrder.name ?? selectedOrder.email ?? selectedOrder.user_id ?? "Anonymous"}
              </div>
              <div className="flex items-center gap-2 mt-2 text-gray-500">
                <MapPin className="w-4 h-4" /> {selectedOrder.shipping_address ?? "N/A"}
              </div>
            </div>

            <div className="text-sm text-right">
              <div>
                <strong>Total:</strong> ${Number(selectedOrder.total_amount ?? 0).toFixed(2)}
              </div>
              <div className="mt-2 text-gray-500">
                <CreditCard className="w-4 h-4 inline-block mr-1" /> {selectedOrder.payment_status ?? "unknown"} ({selectedOrder.payment_method ?? "N/A"})
              </div>
              <div className="mt-2 text-gray-500">
                <CalendarDays className="w-4 h-4 inline-block mr-1" /> {selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* debug info for troubleshooting */}
        <div className="text-xs text-gray-400 mt-2">
          <strong>Debug:</strong> currentUserId: {currentUserId ?? "—"} | role: {currentUserRole ?? "—"} | isAdminLocal:{" "}
          {String(isAdminLocal)} | isAdminServer: {String(isAdminServer)} | orderVendorId: {orderVendorId ?? "—"}
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      <NotificationsBar />

      <div className="flex items-center justify-between">
        <h2 className="text-lg sm:text-xl font-semibold">Orders</h2>
        <input
          type="text"
          placeholder="Search orders..."
          className="w-64 p-2 rounded-md bg-white/50 dark:bg-gray-700 text-sm"
          onChange={(e) => setSearchQuery(e.target.value)}
          value={searchQuery}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-3 border-b pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-3 py-1 rounded-t-md ${activeTab === "all" ? "border-b-2 border-blue-600 font-semibold" : "text-gray-500"}`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab("paid")}
          className={`px-3 py-1 rounded-t-md ${activeTab === "paid" ? "border-b-2 border-blue-600 font-semibold" : "text-gray-500"}`}
        >
          Paid
        </button>
        <button
          onClick={() => setActiveTab("unpaid")}
          className={`px-3 py-1 rounded-t-md ${activeTab === "unpaid" ? "border-b-2 border-blue-600 font-semibold" : "text-gray-500"}`}
        >
          Unpaid
        </button>
      </div>

      <div className="space-y-4">
        {filtered.map((order) => (
          <div key={order.id} className="border p-3 rounded-lg bg-white/50 dark:bg-gray-800">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">#{String(order.id).slice(0, 8)} — {order.name ?? order.email}</div>
                {order.vendor_name && (
                  <div className="text-sm text-gray-500 mt-1">
                    Seller: <span className="font-medium text-gray-700 dark:text-gray-200">{order.vendor_name}</span>
                  </div>
                )}
                <div className="text-sm text-gray-500 mt-1">{renderStatusBadge(order.status)}</div>
                <div className="text-sm text-gray-500 mt-1">{order.payment_status ?? "unknown"} ({order.payment_method ?? "N/A"})</div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="text-sm text-gray-600">${Number(order.total_amount ?? 0).toFixed(2)}</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedOrder(order)}
                    className="px-3 py-1 rounded text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 transition"
                  >
                    Manage
                  </button>

                  <button
                    onClick={fetchOrders}
                    className="px-3 py-1 rounded text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 transition"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" /> {order.shipping_address ?? "N/A"}
              </div>
              <div className="mt-2 text-gray-500">
                <CalendarDays className="w-4 h-4 inline-block mr-1" /> {order.created_at ? new Date(order.created_at).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// helper to render status badge (unchanged)
function renderStatusBadge(status?: string) {
  const s = String(status ?? "").toLowerCase();
  if (s.includes("transit")) {
    return (
      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-yellow-50 text-yellow-800 text-xs font-medium">
        <Loader2 className="w-4 h-4 animate-spin text-yellow-600" /> In Transit
      </span>
    );
  }
  if (s.includes("process")) {
    return (
      <span className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-medium">
        <Loader2 className="w-4 h-4 animate-spin text-blue-600" /> Processing
      </span>
    );
  }
  if (s.includes("placed")) {
    return (
      <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
        Placed
      </span>
    );
  }
  if (s.includes("out for")) {
    return (
      <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
        Out for Delivery
      </span>
    );
  }
  if (s.includes("deliver") || s.includes("confirm")) {
    return (
      <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
        Delivered
      </span>
    );
  }
  return (
    <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-medium">
      {status}
    </span>
  );
}

function getStepClassLocal(label: string, orderStatus: string | undefined) {
  if (!orderStatus) return "bg-gray-100 text-gray-500";
  if (label === orderStatus) return "bg-green-600 text-white";
  const currentIndex = deliverySteps.findIndex((s) => s.status === orderStatus);
  const stepIndex = deliverySteps.findIndex((s) => s.status === label);
  return stepIndex < currentIndex
    ? "bg-green-100 text-green-700"
    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
}

export default OrdersTab;
