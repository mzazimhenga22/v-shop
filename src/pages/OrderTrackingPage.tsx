import React, { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Truck, Package, Bike, Loader2, MapPin, Check, CircleX, Archive, ImagePlus } from "lucide-react";

type StatusLabel =
  | "Order Placed"
  | "Processing"
  | "In Transit"
  | "Out for Delivery"
  | "Delivered"
  | "Confirmed";

interface OrderRow {
  id: number | string;
  created_at?: string | null;
  shipping_address?: string | null;
  status?: StatusLabel | string;
  total_amount?: number;
  items?: any;
  email?: string | null;
  is_archived?: boolean;
  [k: string]: any;
}

const STEPS = [
  { label: "Order Placed" as StatusLabel, icon: <Package className="w-5 h-5" /> },
  { label: "Processing" as StatusLabel, icon: <Loader2 className="w-5 h-5 animate-spin" /> },
  { label: "In Transit" as StatusLabel, icon: <Truck className="w-5 h-5" /> },
  { label: "Out for Delivery" as StatusLabel, icon: <Bike className="w-5 h-5" /> },
  { label: "Delivered" as StatusLabel, icon: <Check className="w-5 h-5" /> },
  { label: "Confirmed" as StatusLabel, icon: <Check className="w-5 h-5 text-green-600" /> },
] as const;

const STATUS_ORDER = STEPS.map((s) => s.label);

function canonicalStatus(raw: string | null | undefined): StatusLabel {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s.includes("placed")) return "Order Placed";
  if (s.includes("process")) return "Processing";
  if (s.includes("transit")) return "In Transit";
  if (s.includes("out for")) return "Out for Delivery";
  if (s.includes("deliver")) return "Delivered";
  if (s.includes("confirm")) return "Confirmed";
  return "Processing";
}

function getStepClass(stepLabel: StatusLabel, current: StatusLabel) {
  if (stepLabel === current) return "bg-green-600 text-white";
  const currentIndex = STATUS_ORDER.indexOf(current);
  const stepIndex = STATUS_ORDER.indexOf(stepLabel);
  return stepIndex < currentIndex
    ? "bg-green-100 text-green-700"
    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
}

function normalizeItems(raw: any): any[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.items)) return parsed.items;
      if (parsed && typeof parsed === "object") return [parsed];
    } catch {
      return [];
    }
  }
  if (typeof raw === "object") {
    if (Array.isArray((raw as any).items)) return (raw as any).items;
    return [raw];
  }
  return [];
}

function extractProductIdsFromOrder(order: OrderRow): (string | number)[] {
  const ids: (string | number)[] = [];
  const raw = order.items;
  if (!raw) return ids;
  let arr: any[] = [];

  if (typeof raw === "string") {
    try {
      arr = JSON.parse(raw);
    } catch {
      return ids;
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === "object") {
    if (Array.isArray((raw as any).items)) arr = (raw as any).items;
    else return ids;
  }

  for (const it of arr) {
    if (it == null) continue;
    if (typeof it === "string" || typeof it === "number") ids.push(it);
    else if (typeof it === "object") {
      if (it.id != null) ids.push(it.id);
      else if (it.product_id != null) ids.push(it.product_id);
    }
  }
  return Array.from(new Set(ids));
}

async function enrichOrdersWithProducts(orders: OrderRow[]): Promise<OrderRow[]> {
  const allIds = new Set<string>();
  for (const o of orders) {
    const ids = extractProductIdsFromOrder(o);
    ids.forEach((id) => allIds.add(String(id)));
  }
  if (allIds.size === 0) return orders;

  const idsArray = Array.from(allIds).map(String);
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, title, image, image_url, thumbnail")
    .in("id", idsArray);

  const productMap = new Map<string, any>();
  if (!error && Array.isArray(products)) {
    for (const p of products) {
      productMap.set(String(p.id), p);
    }
  }

  const enriched = orders.map((o) => {
    const raw = o.items;
    let arr: any[] = [];
    if (!raw) {
      return { ...o, items: [] };
    }
    if (typeof raw === "string") {
      try {
        arr = JSON.parse(raw);
      } catch {
        return o;
      }
    } else if (Array.isArray(raw)) {
      arr = raw;
    } else if (typeof raw === "object" && Array.isArray((raw as any).items)) {
      arr = (raw as any).items;
    } else {
      return o;
    }

    const enrichedItems = arr.map((it: any) => {
      let id: string | null = null;
      let quantity: number | undefined;
      if (typeof it === "string" || typeof it === "number") {
        id = String(it);
      } else if (typeof it === "object") {
        id = it.id != null ? String(it.id) : it.product_id != null ? String(it.product_id) : null;
        quantity = it.quantity ?? it.qty ?? it.count;
      }
      const product = id != null ? productMap.get(id) : undefined;
      const title = product ? (product.name ?? product.title ?? "") : (typeof it === "object" ? it.name ?? it.title ?? "" : "");
      const image =
        product?.image ?? product?.image_url ?? product?.thumbnail ?? (typeof it === "object" ? it.image ?? it.image_url ?? null : null);

      return {
        ...it,
        id,
        quantity,
        product_title: title || undefined,
        product_image: image || undefined,
      };
    });

    return {
      ...o,
      items: enrichedItems,
    };
  });

  return enriched;
}

/* Small UI helpers */
const Banner: React.FC<{ type: "error" | "success" | "info"; message: string; onClose?: () => void }> = ({ type, message, onClose }) => {
  const bg = type === "error" ? "bg-red-50 dark:bg-red-900/30" : type === "success" ? "bg-green-50 dark:bg-green-900/30" : "bg-blue-50 dark:bg-blue-900/30";
  const text = type === "error" ? "text-red-700" : type === "success" ? "text-green-700" : "text-blue-700";
  return (
    <div className={`${bg} border ${type === "error" ? "border-red-200 dark:border-red-800" : type === "success" ? "border-green-200 dark:border-green-800" : "border-blue-200 dark:border-blue-800"} rounded-md p-3 flex items-start gap-3`}>
      <div className={`pt-0.5 ${text} `}>{type === "error" ? <CircleX className="w-5 h-5" /> : <Check className="w-5 h-5" />}</div>
      <div className="flex-1 text-sm text-gray-800 dark:text-gray-200">{message}</div>
      {onClose && (
        <button onClick={onClose} className="text-sm font-medium text-gray-500 dark:text-gray-300 ml-2">
          Close
        </button>
      )}
    </div>
  );
};

const OrdersTrackingPage: React.FC = () => {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState<{ id: number; type: "error" | "success" | "info"; message: string } | null>(null);
  const [pendingActions, setPendingActions] = useState<Record<string, boolean>>({});
  const [markDeliveredModal, setMarkDeliveredModal] = useState<{ open: boolean; orderId?: string | number; email?: string }>({ open: false });
  const [issueModal, setIssueModal] = useState<{ open: boolean; orderId?: string | number; description: string; issueType?: string; contactEmail?: string; attachmentData?: string | null }>({ open: false, description: "" });
  const [archiveModal, setArchiveModal] = useState<{ open: boolean; orderId?: string | number }>({ open: false });
  const [autoArchive, setAutoArchive] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [issueFilePreview, setIssueFilePreview] = useState<string | null>(null);

  useEffect(() => {
// Replace your existing fetchOrders function with this version
const fetchOrders = async () => {
  setLoading(true);
  try {
    const userRes = await supabase.auth.getUser();
    const user = userRes?.data?.user;
    if (!user) {
      setOrders([]);
      setNotif({ id: Date.now(), type: "info", message: "You are not logged in. Sign in to see your orders." });
      setLoading(false);
      return;
    }

    const uid = String(user.id);

    // Attempt primary query (with is_archived filter)
    let { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("user_id", uid)
      .eq("is_archived", false)
      .order("created_at", { ascending: false });

    // If there is an error, log details and attempt a safe fallback
    if (error) {
      // Log useful fields for debugging
      console.error("Error fetching orders (primary):", {
        message: error.message,
        details: (error as any).details,
        hint: (error as any).hint,
        code: (error as any).code,
        status: (error as any).status,
      });

      // If PostgREST returned a 400 (bad request), try without the boolean filter as a fallback
      if ((error as any).status === 400) {
        console.warn("Retrying orders query without is_archived filter (fallback)");
        const retry = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });
        data = retry.data;
        error = retry.error;
        if (error) {
          console.error("Error fetching orders (fallback):", {
            message: error.message,
            details: (error as any).details,
            hint: (error as any).hint,
            code: (error as any).code,
            status: (error as any).status,
          });
        }
      }
    }

    if (error) {
      setOrders([]);
      setNotif({ id: Date.now(), type: "error", message: "Failed to load orders. See console for details." });
      return;
    }

    const rawOrders = (data as OrderRow[]) || [];
    try {
      const enriched = await enrichOrdersWithProducts(rawOrders);
      setOrders(enriched);
    } catch (err) {
      console.error("Error enriching orders:", err);
      setOrders(rawOrders);
      setNotif({ id: Date.now(), type: "error", message: "Failed to enrich product info for some orders." });
    }
  } catch (err) {
    console.error("Fetch orders error (outer):", err);
    setNotif({ id: Date.now(), type: "error", message: "Unexpected error while loading orders." });
  } finally {
    setLoading(false);
  }
};

    fetchOrders();
  }, []);

  useEffect(() => {
    let channel: any = null;
    let mounted = true;

    const subscribe = async () => {
      try {
        const userRes = await supabase.auth.getUser();
        const user = userRes?.data?.user;
        if (!user) return;

        channel = supabase
          .channel("orders-tracking-" + user.id)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
            async (payload) => {
              if (!mounted) return;
              const newRow = (payload as any).new as OrderRow | undefined;
              if (!newRow || newRow.is_archived) return;
              try {
                const enrichedArr = await enrichOrdersWithProducts([newRow]);
                const enrichedOrder = enrichedArr[0] ?? newRow;
                setOrders((prev) => {
                  const exists = prev.some((o) => String(o.id) === String(enrichedOrder.id));
                  if (exists) {
                    return prev.map((o) => (String(o.id) === String(enrichedOrder.id) ? { ...o, ...enrichedOrder } : o));
                  }
                  return [enrichedOrder, ...prev];
                });
              } catch (err) {
                console.error("Realtime enrich error:", err);
                setOrders((prev) => {
                  const exists = prev.some((o) => String(o.id) === String(newRow.id));
                  if (exists) {
                    return prev.map((o) => (String(o.id) === String(newRow.id) ? { ...o, ...newRow } : o));
                  }
                  return [newRow, ...prev];
                });
              }
            }
          )
          .subscribe();
      } catch (err) {
        console.error("Subscribe error:", err);
      }
    };

    subscribe();

    return () => {
      mounted = false;
      try {
        if (channel) {
          if (typeof channel.unsubscribe === "function") channel.unsubscribe();
          else (supabase as any).removeChannel?.(channel);
        }
      } catch {
        /* no-op */
      }
    };
  }, []);

  const pushNotif = (type: "error" | "success" | "info", message: string, autoDismiss = 5000) => {
    const id = Date.now();
    setNotif({ id, type, message });
    if (autoDismiss) {
      setTimeout(() => {
        setNotif((n) => (n && n.id === id ? null : n));
      }, autoDismiss);
    }
  };

  /* -- New: Archive after Confirm option -- */
  const toggleAutoArchiveForOrder = (orderId: string | number, value?: boolean) => {
    setAutoArchive((m) => ({ ...m, [String(orderId)]: typeof value === "boolean" ? value : !m[String(orderId)] }));
  };

  const handleConfirmDelivery = async (orderId: string | number) => {
    try {
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session;
      if (!session) {
        pushNotif("error", "You must be logged in to confirm delivery.");
        return;
      }

      setPendingActions((p) => ({ ...p, [String(orderId)]: true }));
      const res = await fetch(`http://localhost:4000/orders/${orderId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: "Confirmed" }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to confirm delivery");
      }

      // Update UI status
      setOrders((prev) => prev.map((o) => (String(o.id) === String(orderId) ? { ...o, status: "Confirmed" } : o)));
      pushNotif("success", "Thank you — delivery confirmed!");

      // If user opted to auto-archive this order, archive it in Supabase and remove from list
      const shouldAutoArchive = !!autoArchive[String(orderId)];
      if (shouldAutoArchive) {
        try {
          const { error } = await supabase.from("orders").update({ is_archived: true }).eq("id", orderId);
          if (error) throw error;
          setOrders((prev) => prev.filter((o) => String(o.id) !== String(orderId)));
          pushNotif("success", "Order archived automatically after confirmation.");
        } catch (err) {
          console.error("Auto-archive after confirm failed:", err);
          pushNotif("error", "Delivery confirmed but automatic archiving failed.");
        }
      }
    } catch (err) {
      console.error("Error confirming delivery:", err);
      pushNotif("error", "Could not confirm delivery. Please try again.");
    } finally {
      setPendingActions((p) => ({ ...p, [String(orderId)]: false }));
    }
  };

  /* Mark delivered (existing flow) - unchanged API call but UI improved */
  const handleMarkDelivered = async () => {
    const orderId = markDeliveredModal.orderId;
    if (!orderId) return;
    setMarkDeliveredModal((m) => ({ ...m, open: false }));
    setPendingActions((p) => ({ ...p, [String(orderId)]: true }));

    try {
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session;
      let emailToSend = session?.user?.email || undefined;
      if (!emailToSend && markDeliveredModal.email && markDeliveredModal.email.trim()) emailToSend = markDeliveredModal.email.trim();

      const body: any = {};
      if (emailToSend) body.email = emailToSend;

      const res = await fetch(`http://localhost:4000/orders/${orderId}/delivered`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to mark delivered");
      }

      pushNotif("success", "Order marked delivered. Thank you!");
    } catch (err) {
      console.error("Error marking delivered:", err);
      pushNotif("error", "Could not mark order as delivered. Please try again.");
    } finally {
      setPendingActions((p) => ({ ...p, [String(markDeliveredModal.orderId)]: false }));
    }
  };

  /* Archive flow: now shows confirmation modal before calling Supabase */
  const openArchiveModal = (orderId: string | number) => {
    setArchiveModal({ open: true, orderId });
  };

  const handleArchiveOrder = async (orderId: string | number) => {
    try {
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session;
      if (!session) {
        pushNotif("error", "You must be logged in to archive orders.");
        return;
      }

      setPendingActions((p) => ({ ...p, [String(orderId)]: true }));
      const { error } = await supabase
        .from("orders")
        .update({ is_archived: true })
        .eq("id", orderId);

      if (error) throw error;
      setOrders((prev) => prev.filter((o) => String(o.id) !== String(orderId)));
      pushNotif("success", "Order archived successfully.");
      setArchiveModal({ open: false, orderId: undefined });
    } catch (err) {
      console.error("Error archiving order:", err);
      pushNotif("error", "Failed to archive order. Please try again.");
    } finally {
      setPendingActions((p) => ({ ...p, [String(orderId)]: false }));
    }
  };

  /* Enhanced raise issue flow: collects issue type, optional contact email and optional screenshot (as data URL) */
  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = (e) => reject(e);
      fr.readAsDataURL(file);
    });

  const handleRaiseIssue = async (orderId: string | number) => {
    const description = (issueModal.description ?? "").trim();
    if (!description) {
      pushNotif("error", "Please provide a description of the issue.");
      return;
    }

    try {
      const sessionRes = await supabase.auth.getSession();
      const session = sessionRes?.data?.session;
      if (!session) {
        pushNotif("error", "You must be logged in to raise an issue.");
        return;
      }

      setPendingActions((p) => ({ ...p, [String(orderId)]: true }));

      // Prepare payload
      const payload: any = {
        order_id: orderId,
        user_id: session.user.id,
        description,
        created_at: new Date().toISOString(),
        status: "open",
        issue_type: issueModal.issueType ?? "general",
        contact_email: issueModal.contactEmail ?? session.user.email ?? null,
      };

      // include attachment if user selected a file
      if (issueModal.attachmentData) {
        // store as data URL in 'attachment' field; DB must accept text (adjust on DB side as needed)
        payload.attachment = issueModal.attachmentData;
      }

      const { error } = await supabase.from("order_issues").insert(payload);

      if (error) throw error;
      pushNotif("success", "Issue raised successfully. Our team will look into it.");
      setIssueModal({ open: false, description: "", issueType: undefined, contactEmail: undefined, attachmentData: null });
      setIssueFilePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      console.error("Error raising issue:", err);
      pushNotif("error", "Failed to raise issue. Please try again.");
    } finally {
      setPendingActions((p) => ({ ...p, [String(orderId)]: false }));
    }
  };

  const openMarkDeliveredModal = (orderId: string | number) => {
    setMarkDeliveredModal({ open: true, orderId, email: "" });
  };

  const handleIssueFileChange = async (file?: File) => {
    if (!file) {
      setIssueFilePreview(null);
      setIssueModal((m) => ({ ...m, attachmentData: null }));
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setIssueFilePreview(dataUrl);
      setIssueModal((m) => ({ ...m, attachmentData: dataUrl }));
    } catch (err) {
      console.error("File read error:", err);
      pushNotif("error", "Could not read selected file.");
    }
  };

  if (loading) return <p className="text-center">Loading your orders...</p>;
  if (!orders.length) return <p className="text-center text-gray-500">No orders yet.</p>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-6">
      <h1 className="text-3xl font-bold text-center">My Orders</h1>

      {notif && <Banner type={notif.type} message={notif.message} onClose={() => setNotif(null)} />}

      {issueModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-lg shadow-lg">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-semibold">Report an Issue</h3>
              <button
                onClick={() => {
                  setIssueModal({ open: false, description: "", issueType: undefined, contactEmail: undefined, attachmentData: null });
                  setIssueFilePreview(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <CircleX className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <label className="text-sm text-gray-600 dark:text-gray-300">Issue Type</label>
              <select
                value={issueModal.issueType ?? "general"}
                onChange={(e) => setIssueModal((m) => ({ ...m, issueType: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-700"
              >
                <option value="general">General</option>
                <option value="missing_item">Missing item</option>
                <option value="damaged">Damaged</option>
                <option value="wrong_item">Wrong item</option>
                <option value="delivery_problem">Delivery problem</option>
              </select>

              <label className="text-sm text-gray-600 dark:text-gray-300">Contact Email (optional)</label>
              <input
                value={issueModal.contactEmail ?? ""}
                onChange={(e) => setIssueModal((m) => ({ ...m, contactEmail: e.target.value }))}
                className="w-full border rounded-md px-3 py-2 bg-white dark:bg-gray-700"
                placeholder="email@example.com"
              />

              <label className="text-sm text-gray-600 dark:text-gray-300">Description</label>
              <textarea
                className="w-full border rounded-md px-3 py-2 mb-2 bg-white dark:bg-gray-700"
                rows={4}
                placeholder="Describe the issue..."
                value={issueModal.description}
                onChange={(e) => setIssueModal((m) => ({ ...m, description: e.target.value }))}
              />

              <div>
                <label className="text-sm text-gray-600 dark:text-gray-300 mb-1 inline-block">Optional screenshot</label>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleIssueFileChange(e.target.files?.[0])}
                    className="text-sm"
                  />
                  {issueFilePreview ? (
                    <img src={issueFilePreview} alt="preview" className="w-20 h-20 object-cover rounded-md border" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <ImagePlus className="w-4 h-4" /> <span>No preview</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => {
                    setIssueModal({ open: false, description: "", issueType: undefined, contactEmail: undefined, attachmentData: null });
                    setIssueFilePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="px-4 py-2 rounded-md border"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRaiseIssue(issueModal.orderId!)}
                  className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400"
                  disabled={!!pendingActions[String(issueModal.orderId)]}
                >
                  {pendingActions[String(issueModal.orderId)] ? <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> : null}
                  Submit Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {orders.map((order) => {
        const currentStatus: StatusLabel = canonicalStatus(order.status);
        const placedDate = order.created_at ? new Date(order.created_at).toLocaleString() : "";
        const items = normalizeItems(order.items);

        return (
          <div key={String(order.id)} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 space-y-6 relative">
            <div>
              <h2 className="text-lg font-semibold">Order #{order.id}</h2>
              <p className="text-sm">Placed: {placedDate}</p>
              <p className="text-sm">Status: {currentStatus}</p>
              <p className="text-sm">Total: ${order.total_amount ?? 0}</p>
            </div>

            <div className="space-y-3">
              {items.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No items data</p>
              ) : (
                <ul className="space-y-3">
                  {items.map((it: any, idx: number) => {
                    const title = it.product_title || it.name || it.title || String(it.id);
                    const img = it.product_image || it.image || null;
                    const qty = it.quantity ?? it.qty ?? 1;
                    return (
                      <li key={idx} className="flex items-center gap-4">
                        {img ? (
                          <img src={img} alt={title} className="w-16 h-16 object-cover rounded-md" />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-md flex items-center justify-center text-xs text-gray-500">No image</div>
                        )}
                        <div className="flex-1">
                          <div className="font-medium">{title}</div>
                          <div className="text-sm text-gray-500 dark:text-gray-300">Qty: {qty}</div>
                        </div>
                        <div className="font-semibold">${(Number(it.price ?? 0) * Number(qty)).toFixed(2)}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <MapPin className="w-5 h-5" />
              <span>Delivering to: {order.shipping_address || "—"}</span>
            </div>

            <div className="space-y-8">
              {STEPS.map((step, idx) => (
                <div key={step.label} className="flex items-start gap-4 relative">
                  <div className="relative z-10">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full ${getStepClass(step.label, currentStatus)}`}>
                      {step.icon}
                    </div>
                    {idx < STEPS.length - 1 && <div className="absolute left-1/2 -translate-x-1/2 top-10 h-8 w-1 bg-gray-300 dark:bg-gray-700 z-0" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{step.label}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{step.label === currentStatus ? "Now" : ""}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {currentStatus === "Delivered" && (
                <>
                  <button
                    onClick={() => handleConfirmDelivery(order.id)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md"
                    disabled={!!pendingActions[String(order.id)]}
                  >
                    {pendingActions[String(order.id)] ? <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> : null}
                    Confirm Delivery
                  </button>

                  <div className="flex items-center gap-2">
                    <label className="text-sm">Auto-archive after confirm</label>
                    <input
                      type="checkbox"
                      checked={!!autoArchive[String(order.id)]}
                      onChange={() => toggleAutoArchiveForOrder(order.id)}
                      className="rounded"
                    />
                  </div>

                  <button
                    onClick={() => openArchiveModal(order.id)}
                    className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md"
                    disabled={!!pendingActions[String(order.id)]}
                    title="Archive this delivered order"
                  >
                    <Archive className="w-5 h-5 inline-block mr-2" />
                    Archive
                  </button>
                </>
              )}
              {currentStatus !== "Delivered" && (
                <button
                  onClick={() => openMarkDeliveredModal(order.id)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                  disabled={!!pendingActions[String(order.id)]}
                >
                  Mark Delivered
                </button>
              )}
              <button
                onClick={() => setIssueModal({ open: true, orderId: order.id, description: "", issueType: "general", contactEmail: undefined, attachmentData: null })}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md"
                disabled={!!pendingActions[String(order.id)]}
              >
                <CircleX className="w-5 h-5 inline-block mr-2" />
                Raise Issue
              </button>
            </div>
          </div>
        );
      })}

      {markDeliveredModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-2">Mark as Delivered</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Optionally provide an email to receive confirmation.</p>
            <input
              value={markDeliveredModal.email ?? ""}
              onChange={(e) => setMarkDeliveredModal((m) => ({ ...m, email: e.target.value }))}
              className="w-full border rounded-md px-3 py-2 mb-4 bg-white dark:bg-gray-700"
              placeholder="Email (optional)"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setMarkDeliveredModal({ open: false })} className="px-4 py-2 rounded-md border">
                Cancel
              </button>
              <button onClick={handleMarkDelivered} className="px-4 py-2 rounded-md bg-blue-600 text-white">
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {archiveModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Archive Order</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Are you sure you want to archive this order? Archived orders are hidden from your active orders list.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setArchiveModal({ open: false, orderId: undefined })} className="px-4 py-2 rounded-md border">
                Cancel
              </button>
              <button
                onClick={() => handleArchiveOrder(archiveModal.orderId!)}
                className="px-4 py-2 rounded-md bg-gray-600 text-white"
                disabled={!!pendingActions[String(archiveModal.orderId)]}
              >
                {pendingActions[String(archiveModal.orderId)] ? <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" /> : null}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrdersTrackingPage;
