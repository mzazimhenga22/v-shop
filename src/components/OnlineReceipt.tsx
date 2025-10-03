import React, { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  ReceiptText,
  CalendarDays,
  CreditCard,
  MapPin,
  Check,
  ShoppingBag,
  Scissors,
} from "lucide-react";
import Barcode from "react-barcode";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import type { Product } from "@/types";

interface ReceiptProps {
  orderId: string | number;
  date?: string;
  customer?: { name: string; email: string; address: string };
  payment?: { method: string; status: string; total: number };
  items?: (Product & { quantity: number })[] | any;
  subtotal?: number;
  tax?: number;
  shipping?: number;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

const OnlineReceipt: React.FC<ReceiptProps> = ({
  orderId,
  date: dateProp,
  customer: customerProp,
  payment: paymentProp,
  items: itemsProp,
  subtotal: providedSubtotal,
  tax: providedTax,
  shipping: providedShipping,
}) => {
  const receiptRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedOrder, setFetchedOrder] = useState<any | null>(null);

  // Try to fetch authoritative order from backend
  const fetchOrderFromServer = async () => {
    if (!orderId) return;
    setLoading(true);
    setFetchError(null);

    const asStr = String(orderId);

    try {
      // get session token if present
      let token: string | null = null;
      try {
        const s = await supabase.auth.getSession();
        const session = (s as any)?.data?.session;
        token = session?.access_token ?? null;
      } catch {
        token = null;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      // first attempt: GET /orders/:id (canonical)
      let res = await fetch(`${API_BASE}/orders/${encodeURIComponent(asStr)}`, { headers });

      // If unauthorized and we had token, try without token (some deployments may allow public)
      if (!res.ok && res.status === 401 && token) {
        try {
          res = await fetch(`${API_BASE}/orders/${encodeURIComponent(asStr)}`, { headers: { "Content-Type": "application/json" } });
        } catch {
          // ignore
        }
      }

      // If initial request failed with a 500 pointing to UUID parsing -> fallback to search
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const lower = txt.toLowerCase();
        const isUuidParseError = lower.includes("invalid input syntax for type uuid") || lower.includes("22p02");

        if (isUuidParseError) {
          // fallback: try to find the order in recent orders by matching meta or id fields
          try {
            // Fetch a reasonably large page of recent orders (server requires auth; try both)
            const listHeaders: Record<string, string> = { "Content-Type": "application/json" };
            if (token) listHeaders.Authorization = `Bearer ${token}`;
            const listRes = await fetch(`${API_BASE}/orders?per_page=50`, { headers: listHeaders });
            if (!listRes.ok && token) {
              // try again without token if initial list failed
              try {
                const listRes2 = await fetch(`${API_BASE}/orders?per_page=50`, { headers: { "Content-Type": "application/json" } });
                if (listRes2.ok) {
                  const body2 = await listRes2.json();
                  const orders2 = body2?.orders ?? body2;
                  const found2 = findMatchingOrderInList(orders2, asStr);
                  if (found2) {
                    setFetchedOrder(found2);
                    setLoading(false);
                    return;
                  }
                }
              } catch {}
            } else if (listRes.ok) {
              const body = await listRes.json();
              const orders = body?.orders ?? body;
              const found = findMatchingOrderInList(orders, asStr);
              if (found) {
                setFetchedOrder(found);
                setLoading(false);
                return;
              }
            }
          } catch (listErr) {
            // ignore and fallthrough to show original error
          }

          setFetchError(`Failed to fetch order: ${res.status} ${res.statusText} - ${txt}`);
          setLoading(false);
          return;
        }

        // Not a UUID parse error -> show the error text
        setFetchError(`Failed to fetch order: ${res.status} ${res.statusText}${txt ? " - " + txt : ""}`);
        setLoading(false);
        return;
      }

      // success path
      const body = await res.json();
      const o = body?.order ?? body;
      if (!o) {
        setFetchError("Server returned empty order payload");
        setLoading(false);
        return;
      }
      setFetchedOrder(o);
    } catch (err: any) {
      setFetchError(String(err?.message ?? err) || "Network error fetching order");
    } finally {
      setLoading(false);
    }
  };

  // helper: scan a list of orders for a candidate matching by multiple heuristics
  const findMatchingOrderInList = (orders: any[] | undefined, needle: string) => {
    if (!Array.isArray(orders)) return null;
    for (const ord of orders) {
      if (!ord) continue;
      try {
        // direct id match
        if (String(ord.id) === needle) return ord;
        // nested order object
        if (ord.order && String(ord.order.id) === needle) return ord.order;
        // meta.idempotency_key or meta.client_ts
        if (ord.meta) {
          const metaKey = (ord.meta.idempotency_key ?? ord.meta.idempotencyKey ?? ord.meta?.idempotency) as any;
          const clientTs = ord.meta.client_ts ?? ord.meta.clientTs ?? ord.meta.client_ts;
          if (metaKey && String(metaKey) === needle) return ord;
          if (clientTs && String(clientTs) === needle) return ord;
        }
        // also try server-level fields that might contain the timestamp or string
        if (String(ord.order_id) === needle) return ord;
        if (String(ord._id) === needle) return ord;
      } catch {
        // ignore
      }
    }
    return null;
  };

  useEffect(() => {
    fetchOrderFromServer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // normalize items: accept arrays or JSON strings or null
  const normalizedItems = React.useMemo(() => {
    const src = fetchedOrder?.items ?? itemsProp ?? [];
    try {
      if (!src) return [];
      if (typeof src === "string") {
        const parsed = JSON.parse(src);
        if (Array.isArray(parsed)) return parsed as any[];
        if (typeof parsed === "object" && parsed !== null) {
          const vals = Object.values(parsed).filter(Boolean);
          if (vals.length && vals.every((v) => typeof v === "object")) return vals as any[];
        }
        return [];
      }
      if (Array.isArray(src)) return src;
      if (typeof src === "object" && src !== null) {
        const vals = Object.values(src).filter(Boolean);
        if (vals.length && vals.every((v) => typeof v === "object")) return vals as any[];
      }
      return [];
    } catch {
      return [];
    }
  }, [fetchedOrder, itemsProp]);

  // compute fields preferring fetchedOrder over props
  const customer = fetchedOrder?.customer ?? customerProp ?? { name: "Guest", email: "N/A", address: "N/A" };
  const payment = fetchedOrder?.payment ?? paymentProp ?? { method: "Unknown", status: "Pending", total: 0 };
  const date = fetchedOrder?.date ?? dateProp ?? new Date().toISOString();

  const subtotal = providedSubtotal ?? fetchedOrder?.subtotal ?? normalizedItems.reduce((sum, i) => sum + (Number((i as any).price ?? 0) * Number((i as any).quantity ?? 0)), 0);
  const tax = providedTax ?? fetchedOrder?.tax ?? +(subtotal * 0.08).toFixed(2);
  const shipping = providedShipping ?? fetchedOrder?.shipping ?? 0;
  const total = (payment?.total && Number(payment.total) > 0) ? Number(payment.total) : +(subtotal + tax + shipping).toFixed(2);

  const fmt = (v: number) =>
    v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const html2canvasOptions = {
    scale: 3,
    useCORS: true,
    logging: false,
    backgroundColor: "#f6fbff",
    windowWidth: receiptRef.current ? receiptRef.current.scrollWidth : undefined,
  };

  const downloadPNG = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, html2canvasOptions as any);
      const imgData = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = imgData;
      link.download = `receipt-${orderId}.png`;
      link.click();
    } catch (err) {
      console.error("Failed to generate PNG:", err);
      alert("Could not generate image. See console for details.");
    }
  };

  const downloadPDF = async () => {
    if (!receiptRef.current) return;
    try {
      const canvas = await html2canvas(receiptRef.current, html2canvasOptions as any);
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;
      const img = new Image();
      img.src = imgData;
      img.onload = () => {
        let imgWidth = img.width;
        let imgHeight = img.height;
        const widthRatio = maxWidth / imgWidth;
        const heightRatio = maxHeight / imgHeight;
        const ratio = Math.min(widthRatio, heightRatio, 1);
        const renderWidth = imgWidth * ratio;
        const renderHeight = imgHeight * ratio;
        const x = (pageWidth - renderWidth) / 2;
        const y = (pageHeight - renderHeight) / 2;
        pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight, undefined, "FAST");
        pdf.save(`receipt-${orderId}.pdf`);
      };
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Could not generate PDF. See console for details.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex justify-end gap-3 mb-6">
        <button onClick={downloadPNG} className="px-4 py-2 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 hover:translate-y-[-1px] shadow-sm text-sm">
          Download PNG
        </button>
        <button onClick={downloadPDF} className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white font-medium shadow-md hover:opacity-95 text-sm">
          Download PDF
        </button>
      </div>

      <div style={{ background: "radial-gradient(1200px 400px at -10% 10%, rgba(72,187,120,0.08), transparent 10%), radial-gradient(900px 300px at 110% 90%, rgba(59,130,246,0.05), transparent 10%)", padding: 24, borderRadius: 18 }}>
        <div ref={receiptRef} className="mx-auto rounded-2xl overflow-hidden shadow-[0_20px_45px_rgba(13,29,50,0.12)]" style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(248,252,255,0.96))",
          border: "1px solid rgba(255,255,255,0.6)",
          boxShadow: "0 6px 18px rgba(31,41,55,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
          borderRadius: 18,
          WebkitBackdropFilter: "blur(6px)",
          backdropFilter: "blur(6px)",
          WebkitPrintColorAdjust: "exact",
          printColorAdjust: "exact",
        }}>
          <div style={{ background: "linear-gradient(90deg, rgba(34,197,94,1) 0%, rgba(16,185,129,0.95) 50%, rgba(16,185,129,0.85) 100%)" }} className="p-6 flex items-center justify-between text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))" }}>
                <ShoppingBag className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Vshop</h1>
                <p className="text-xs opacity-90 mt-0.5">Receipt • Thank you for your purchase</p>
              </div>
            </div>

            <div className="text-right text-sm">
              <div className="opacity-90">Order</div>
              <div className="font-mono font-semibold">{String(orderId)}</div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid sm:grid-cols-2 gap-6 text-sm">
              <div className="space-y-1">
                <p className="font-semibold text-gray-800 flex items-center gap-2"><ReceiptText className="w-4 h-4 text-emerald-500" /> Customer</p>
                <p className="text-gray-800 font-medium">{customer?.name ?? "Guest"}</p>
                <p className="text-gray-500">{customer?.email ?? "N/A"}</p>
                <div className="flex items-center gap-2 text-gray-500"><MapPin className="w-4 h-4" /> <span>{customer?.address ?? "N/A"}</span></div>
              </div>

              <div className="text-right space-y-1">
                <p className="font-semibold text-gray-800 flex items-center gap-2 justify-end"><CreditCard className="w-4 h-4 text-emerald-500" /> Payment</p>
                <p className="text-gray-700 capitalize">{(payment?.status ?? "pending")} • {payment?.method ?? "Unknown"}</p>
                <p className="text-2xl font-bold text-emerald-600">${fmt(total)}</p>
                <div className="flex justify-end items-center gap-2 text-gray-400 text-sm"><CalendarDays className="w-4 h-4" /> <span>{new Date(date).toLocaleString()}</span></div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-emerald-500" /> Items</h3>

              {loading ? (
                <div className="p-4 text-center text-sm text-gray-500">Loading order details from server...</div>
              ) : fetchError ? (
                <div className="p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">Could not load live order data</div>
                      <div className="text-xs mt-1 text-yellow-700 whitespace-pre-wrap">{fetchError}</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => fetchOrderFromServer()} className="text-sm px-2 py-1 rounded bg-yellow-100 hover:bg-yellow-200">Retry</button>
                    </div>
                  </div>
                </div>
              ) : normalizedItems.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {normalizedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-4">
                        <img src={(item as any).image ?? "/images/placeholder.png"} alt={(item as any).name} crossOrigin="anonymous" className="w-14 h-14 rounded-lg object-cover bg-gray-50" style={{ boxShadow: "0 6px 18px rgba(16,24,40,0.04)" }} />
                        <div>
                          <p className="text-sm font-medium text-gray-800">{(item as any).name}</p>
                          <p className="text-xs text-gray-500">Qty: {(item as any).quantity} • ${fmt(Number((item as any).price ?? 0))}</p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-gray-800">${fmt((Number((item as any).price ?? 0) * Number((item as any).quantity ?? 0)))}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm italic">No items in this order.</p>
              )}

              <div className="pt-4 space-y-1 text-sm text-gray-700">
                <div className="flex justify-between"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax (8%)</span><span>${fmt(tax)}</span></div>
                <div className="flex justify-between"><span>Shipping</span><span>${fmt(shipping)}</span></div>
                <div className="flex justify-between font-semibold text-emerald-600 text-lg"><span>Total</span><span>${fmt(total)}</span></div>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 pt-6 text-center space-y-4">
              <div className="flex flex-col sm:flex-row justify-center items-center gap-6">
                <div className="min-w-[180px]">
                  <p className="text-xs mb-2 text-gray-500">Scan Order Barcode</p>
                  <div style={{ display: "inline-block", padding: 8, background: "rgba(255,255,255,0.6)", borderRadius: 8 }}>
                    <Barcode value={String(orderId)} height={64} displayValue={false} />
                  </div>
                </div>

                <div>
                  <p className="text-xs mb-2 text-gray-500">Verify Order (QR)</p>
                  <div style={{ display: "inline-block", padding: 6, background: "rgba(255,255,255,0.6)", borderRadius: 8 }}>
                    <QRCodeCanvas value={`${window.location.origin}/orders/${orderId}`} size={96} />
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-dashed border-gray-200 text-center relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-2 flex items-center rounded-full shadow-sm"><Scissors className="w-4 h-4 text-gray-400" /></div>
              <div className="inline-flex items-center gap-2 text-emerald-600 font-medium bg-emerald-50 px-3 py-1 rounded-full"><Check className="w-4 h-4" /> Payment Confirmed</div>
              <p className="text-xs text-gray-500 mt-3">Thank you for shopping with <span className="font-semibold">Vshop</span>!<br />Need help? <a href="/support" className="underline">Contact Support</a></p>
            </div>
          </div>
        </div>

        {fetchedOrder && (
          <div className="mt-3 text-xs text-gray-500 text-right">Live order data loaded from server.</div>
        )}
      </div>
    </div>
  );
};

export default OnlineReceipt;