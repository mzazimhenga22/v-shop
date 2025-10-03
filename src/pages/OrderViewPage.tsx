import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import OnlineReceipt from "@/components/OnlineReceipt";
import { supabase } from "@/lib/supabaseClient";// optional: remove if you don't have this
import clsx from "clsx";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

// small normalizer used to shape server response into props OnlineReceipt expects
function normalizeOrderToReceipt(o: any, fallbackUser?: { name?: string; email?: string }, fallbackShippingAddr?: string) {
  if (!o) return null;
  const order = o.order ?? o;

  const id = order.id ?? order.order_id ?? order._id ?? String(Date.now());
  const date = order.created_at ?? order.createdAt ?? order.date ?? new Date().toISOString();

  const customer = {
    name: order.name ?? order.customer?.name ?? fallbackUser?.name ?? "Customer",
    email: order.email ?? order.customer?.email ?? fallbackUser?.email ?? "N/A",
    address: order.shipping_address ?? order.customer?.address ?? fallbackShippingAddr ?? "",
  };

  // items (attempt several shapes)
  let itemsRaw: any[] = [];
  try {
    if (Array.isArray(order.items)) itemsRaw = order.items;
    else if (typeof order.items === "string") itemsRaw = JSON.parse(order.items || "[]");
    else if (Array.isArray(order.order_items)) itemsRaw = order.order_items;
    else if (order.line_items && Array.isArray(order.line_items)) itemsRaw = order.line_items;
    else if (order.data?.items && Array.isArray(order.data.items)) itemsRaw = order.data.items;
    else if (order.data?.order?.items && Array.isArray(order.data.order.items)) itemsRaw = order.data.order.items;
    else if (order.cart && Array.isArray(order.cart)) itemsRaw = order.cart;
    else itemsRaw = order.items ?? order.order_items ?? [];
  } catch {
    itemsRaw = [];
  }

  const items = (itemsRaw || []).map((it: any, idx: number) => ({
    id: it.id ?? it.product_id ?? it.sku ?? String(idx),
    name: it.name ?? it.title ?? it.product_name ?? "Item",
    quantity: Number(it.quantity ?? it.qty ?? 1),
    price: Number(it.price ?? it.unit_price ?? it.amount ?? 0),
    image: it.image ?? it.image_url ?? it.product_image ?? null,
    vendor_name: it.vendor_name ?? it.vendor ?? null,
  }));

  const subtotal =
    Number(order.subtotal ?? order.sub_total ?? order.calculated_subtotal ?? items.reduce((s: number, it: any) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0)) || 0;

  const shipping = Number(order.shipping_amount ?? order.shipping ?? order.shipping_fee ?? 0) || 0;
  const tax = Number(order.tax_amount ?? order.tax ?? 0) || +(subtotal * 0.08).toFixed(2);
  const total = Number(order.total_amount ?? order.total ?? order.amount ?? (subtotal + tax + shipping)) || +(subtotal + tax + shipping).toFixed(2);

  const payment = {
    method: order.payment_method ?? order.payment?.method ?? order.payment_details?.method ?? "Unknown",
    status: (order.payment_status ?? order.status ?? order.payment?.status ?? "pending").toString(),
    total,
  };

  return {
    id,
    date,
    customer,
    payment,
    items,
    subtotal,
    tax,
    shipping,
    raw: order,
  };
}

const FINAL_STATUSES = ["paid", "confirmed", "delivered", "succeeded", "cancelled"];

const OrderViewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<any | null>(null);
  const [autoPoll, setAutoPoll] = useState(true);
  const [pollIntervalMs] = useState(5000); // 5 seconds; change if you want
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  const fetchOrder = useCallback(async () => {
    if (!id) {
      setError("No order id provided");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // attempt to include supabase session token if available
      let token: string | null = null;
      try {
        const s = await supabase.auth.getSession();
        token = (s as any)?.data?.session?.access_token ?? null;
      } catch {
        token = null;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}`, { headers });
      if (!res.ok) {
        // if 401 or 403 and we had a token, try without it (some setups allow public read)
        if ((res.status === 401 || res.status === 403) && token) {
          const res2 = await fetch(`${API_BASE}/orders/${encodeURIComponent(id)}`, { headers: { "Content-Type": "application/json" } });
          if (res2.ok) {
            const body2 = await res2.json();
            setOrderData(body2.order ?? body2);
            setLastFetchedAt(Date.now());
            return;
          }
        }
        const txt = await res.text().catch(() => "");
        throw new Error(`Fetch failed: ${res.status} ${res.statusText} ${txt ? "- " + txt : ""}`);
      }
      const body = await res.json();
      setOrderData(body.order ?? body);
      setLastFetchedAt(Date.now());
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  // initial fetch
  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // auto-poll until final state
  useEffect(() => {
    if (!autoPoll) return;
    let mounted = true;
    let timer: number | null = null;

    const needPoll = () => {
      if (!orderData) return true;
      const s = (orderData.payment_status ?? orderData.status ?? "").toString().toLowerCase();
      return !FINAL_STATUSES.some((fs) => s.includes(fs));
    };

    if (!needPoll()) return;

    const schedule = async () => {
      if (!mounted) return;
      await new Promise((r) => (timer = window.setTimeout(r, pollIntervalMs)));
      if (!mounted) return;
      await fetchOrder();
      schedule();
    };
    schedule();

    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [autoPoll, orderData, fetchOrder, pollIntervalMs]);

  const normalized = useMemo(() => normalizeOrderToReceipt(orderData ?? null), [orderData]);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/orders/view/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      // minimal feedback:
      alert("Link copied to clipboard");
    } catch {
      prompt("Copy this link:", url);
    }
  };

  const statusLabel = useMemo(() => {
    if (!orderData) return "unknown";
    return (orderData.payment_status ?? orderData.status ?? orderData?.payment?.status ?? "").toString().toLowerCase();
  }, [orderData]);

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Order view</h1>
            <p className="text-sm text-gray-500 mt-1">Viewing receipt for order <span className="font-mono">{id}</span></p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => navigate(-1)} className="px-3 py-2 rounded-md bg-[rgba(0,0,0,0.04)]">Back</button>
            <button onClick={fetchOrder} className="px-3 py-2 rounded-md bg-[rgba(16,185,129,0.06)]">Refresh</button>
            <button onClick={handleCopyLink} className="px-3 py-2 rounded-md bg-white border">Copy Link</button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center gap-3">
            <div className={clsx("px-3 py-1 rounded-full text-sm font-medium", statusLabel.includes("paid") || statusLabel.includes("confirmed") ? "bg-emerald-50 text-emerald-700" : "bg-yellow-50 text-yellow-700")}>
              {statusLabel || "unknown"}
            </div>

            <label className="ml-4 inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoPoll} onChange={(e) => setAutoPoll(e.target.checked)} />
              Auto-refresh until paid
            </label>

            {lastFetchedAt ? <div className="text-xs text-gray-400 ml-3">Last: {new Date(lastFetchedAt).toLocaleTimeString()}</div> : null}
          </div>
        </div>

        {loading ? (
          <div className="p-6 bg-white rounded-lg shadow-sm text-center">Loading order...</div>
        ) : error ? (
          <div className="p-4 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
            <div className="font-medium">Failed to load order</div>
            <div className="text-xs mt-1">{error}</div>
            <div className="mt-3">
              <button onClick={fetchOrder} className="px-3 py-2 rounded-md bg-yellow-100">Retry</button>
            </div>
          </div>
        ) : normalized ? (
          <div>
            {/* render OnlineReceipt with normalized props so it doesn't need to re-fetch itself */}
            <OnlineReceipt
              orderId={normalized.id}
              date={normalized.date}
              customer={normalized.customer}
              payment={normalized.payment}
              items={normalized.items}
              subtotal={normalized.subtotal}
              tax={normalized.tax}
              shipping={normalized.shipping}
            />
          </div>
        ) : (
          <div className="p-6 bg-white rounded-lg shadow-sm text-center">No order found</div>
        )}
      </div>
    </div>
  );
};

export default OrderViewPage;
