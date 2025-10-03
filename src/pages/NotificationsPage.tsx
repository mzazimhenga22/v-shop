// src/pages/NotificationsPage.tsx
import React, { useEffect, useState } from "react";
import { useNotification } from "@/context/NotificationContext";
import { CircleX, Check, MapPin, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type AnyNotification = Record<string, any>;

const NotificationsPage: React.FC = () => {
  const { notifications, loading, confirmDelivery, raiseIssue, notificationCount } = useNotification();

  // role flags + ids
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const getUserAndVendorStatus = async () => {
      try {
        // refresh and get session
        await supabase.auth.refreshSession();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted || !session?.user) return;

        setUserId(String(session.user.id));
        setIsAdmin(!!session.user.user_metadata?.isAdmin);

        // vendor detection: prefer vendor table, then try view(s) safely.
        let vendorFound = false;
        let foundVendorId: string | null = null;

        // Helper to safely coerce an unknown row to a vendor id if any key exists
        const extractVendorIdFromRow = (row: any): string | null => {
          if (!row) return null;
          const cand = row.id ?? row.vendor_id ?? row.user_id ?? row.seller_id ?? row.merchant_id ?? row.vendorid ?? null;
          return cand != null ? String(cand) : null;
        };

        try {
          // 1) Check core vendor table by user_id (most reliable)
          const { data: vendorData, error: vendorError } = await supabase
            .from("vendor")
            .select("id,user_id")
            .eq("user_id", session.user.id)
            .maybeSingle();

          // log the response so debugging is easy
          console.debug("vendor table lookup result:", { vendorData, vendorError });

          if (!vendorError && vendorData) {
            vendorFound = true;
            foundVendorId = extractVendorIdFromRow(vendorData);
          } else {
            // If vendor table didn't return a row, probe the view(s).
            // Use select('*') as the safe, non-failing probe — selecting unknown columns causes 400.
            const viewCandidates = ["vendor_profiles_with_user", "vendor_profiles_with_user_v2", "vendor_profiles", "vendor_profile_with_user"];
            for (const viewName of viewCandidates) {
              try {
                const { data: viewRow, error: viewError, status } = await supabase
                  .from(viewName)
                  .select("*")
                  .eq("user_id", session.user.id)
                  .maybeSingle();

                console.debug(`probe view ${viewName} -> status:${status}`, { viewRow, viewError });

                // If the view exists and returned a row (no error and viewRow present), extract id
                if (!viewError && viewRow) {
                  vendorFound = true;
                  foundVendorId = extractVendorIdFromRow(viewRow);
                  break;
                }

                // If the view produced an error, log it in detail and continue to next candidate.
                if (viewError) {
                  // PostgREST errors carry useful fields (message/code/hint). Log them.
                  console.warn(`view ${viewName} probe error:`, viewError);
                  // continue to next candidate — don't throw here
                }
              } catch (innerErr) {
                // Unexpected runtime error querying the view — log and continue
                console.warn(`Unexpected error querying view ${viewName}:`, innerErr);
              }
            }
          }
        } catch (err) {
          console.warn("vendor lookup error (unexpected):", err);
          vendorFound = false;
        }

        if (mounted) {
          setIsVendor(!!vendorFound);
          setVendorId(foundVendorId);
        }
      } catch (err) {
        console.warn("Error checking user/vendor status:", err);
      }
    };

    getUserAndVendorStatus();

    return () => {
      mounted = false;
    };
  }, []);

  // defensive helpers to classify notifications
  const isComplaint = (n: AnyNotification) => {
    if (!n) return false;
    const t = String((n.type ?? n.kind ?? n.notification_type ?? "")).toLowerCase();
    if (t.includes("complaint") || t.includes("issue")) return true;
    if (Boolean(n.complaint) || Boolean(n.issue) || Boolean(n.is_issue)) return true;
    if (Array.isArray(n.tags) && n.tags.some((x: string) => String(x).toLowerCase().includes("complaint"))) return true;
    const body = String(n.message ?? n.body ?? n.note ?? "").toLowerCase();
    if (body.includes("complaint") || body.includes("issue") || body.includes("not working") || body.includes("broken")) return true;
    return false;
  };

  const isMessage = (n: AnyNotification) => {
    if (!n) return false;
    const t = String((n.type ?? n.kind ?? n.notification_type ?? "")).toLowerCase();
    if (t === "message" || t === "chat" || t === "vendor_message") return true;
    if (Boolean(n.message) || Boolean(n.body) || Boolean(n.note)) return true;
    return false;
  };

  const isForThisVendor = (n: AnyNotification) => {
    if (!n) return false;
    const vid = (n.vendor_id ?? n.seller_id ?? n.merchant_id ?? n.shop_id ?? n.store_id ?? null);
    if (vid == null) return false;
    return String(vid) === String(vendorId);
  };

  if (loading) return <p className="text-center">Loading notifications...</p>;
  if (!notificationCount) return <p className="text-center text-gray-500">No pending notifications.</p>;

  // Split notifications into categories
  const complaints = notifications.filter((n: AnyNotification) => isComplaint(n));
  const messages = notifications.filter((n: AnyNotification) => isMessage(n) && !isComplaint(n));
  const orders = notifications.filter((n: AnyNotification) => !isComplaint(n) && !isMessage(n));

  const vendorComplaints = (isVendor || isAdmin) ? complaints.filter((n: AnyNotification) => isForThisVendor(n) || !complaints.some(Boolean)) : [];
  const vendorMessages = (isVendor || isAdmin) ? messages.filter((n: AnyNotification) => isForThisVendor(n) || !messages.some(Boolean)) : [];

  const markAcknowledged = async (id: string | number) => {
    try {
      const { error } = await supabase.from("notifications").update({ acknowledged: true }).eq("id", id);
      if (error) {
        console.warn("markAcknowledged supabase error:", error);
        alert("Could not update notification on the server. (See console.)");
        return;
      }
      alert("Marked acknowledged (server updated). Refreshing view may be required.");
    } catch (err) {
      console.warn("markAcknowledged error:", err);
      alert("Could not mark acknowledged (network error).");
    }
  };

  const contactCustomer = (n: AnyNotification) => {
    const email = n.customer_email ?? n.email ?? n.user_email ?? (n?.items && n.items[0]?.customer_email) ?? "";
    if (email) {
      window.location.href = `mailto:${email}?subject=Regarding order ${n.id}&body=Hi,%0D%0A%0D%0A`;
    } else {
      alert("No customer email available for this notification.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-bold text-center">
        Notifications
        <span className="inline-flex items-center gap-2 ml-3">
          {isAdmin && <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-full">Admin</span>}
          {isVendor && <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">Vendor</span>}
        </span>
      </h1>

      {(isVendor || isAdmin) && (
        <>
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Customer Complaints {vendorComplaints.length > 0 && <span className="text-sm text-gray-500">({vendorComplaints.length})</span>}</h2>
              <div className="text-sm text-gray-500">These are flagged issues — respond or acknowledge.</div>
            </div>

            {vendorComplaints.length === 0 ? (
              <div className="p-4 rounded bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">No complaints assigned to your store at this time.</div>
            ) : (
              <div className="space-y-4">
                {vendorComplaints.map((n: AnyNotification) => (
                  <div key={String(n.id)} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">Order / Ticket #{n.id}</div>
                        <div className="text-xs text-gray-500">{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                      </div>
                      <div className="text-sm text-red-600 font-semibold">Complaint</div>
                    </div>

                    <div className="text-sm text-gray-700 dark:text-gray-300">
                      {String(n.message ?? n.body ?? n.note ?? n.issue ?? "Customer reports an issue.")}
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => markAcknowledged(n.id)} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" /> Acknowledge
                      </button>
                      <button onClick={() => contactCustomer(n)} className="px-3 py-1 rounded border text-sm flex items-center gap-2">
                        <Mail className="w-4 h-4" /> Contact Customer
                      </button>
                      <button onClick={() => {
                          const desc = prompt("Add a short internal note for support/escalation (optional):") ?? "";
                          raiseIssue(n.id, desc || "Escalated by vendor/admin");
                        }} className="px-3 py-1 rounded bg-red-600 text-white text-sm">Escalate</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Messages {vendorMessages.length > 0 && <span className="text-sm text-gray-500">({vendorMessages.length})</span>}</h2>
              <div className="text-sm text-gray-500">Customer / system messages related to your store</div>
            </div>

            {vendorMessages.length === 0 ? (
              <div className="p-4 rounded bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">No messages for your store at the moment.</div>
            ) : (
              <div className="space-y-4">
                {vendorMessages.map((n: AnyNotification) => (
                  <div key={String(n.id)} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 space-y-2">
                    <div className="flex justify-between">
                      <div className="font-medium">#{n.id} — {String(n.subject ?? n.title ?? "Message")}</div>
                      <div className="text-xs text-gray-400">{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                    </div>

                    <div className="text-sm text-gray-700 dark:text-gray-300">{String(n.message ?? n.body ?? "—")}</div>

                    <div className="flex gap-2">
                      <button onClick={() => markAcknowledged(n.id)} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm flex items-center gap-2">
                        <Check className="w-4 h-4" /> Acknowledge
                      </button>
                      <button onClick={() => contactCustomer(n)} className="px-3 py-1 rounded border text-sm flex items-center gap-2">
                        <Mail className="w-4 h-4" /> Contact
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Order Notifications {orders.length > 0 && <span className="text-sm text-gray-500">({orders.length})</span>}</h2>

        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">No order-type notifications at this time.</p>
        ) : (
          orders.map((order: AnyNotification) => {
            const placedDate = order.created_at ? new Date(order.created_at).toLocaleString() : "";
            const items = Array.isArray(order.items) ? order.items : [];

            return (
              <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 space-y-6 relative">
                <div>
                  <h3 className="text-lg font-semibold">Order #{order.id}</h3>
                  <p className="text-sm">Placed: {placedDate}</p>
                  <p className="text-sm">Status: {order.status ?? "Delivered (Awaiting Confirmation)"}</p>
                  <p className="text-sm">Total: ${order.total_amount ?? order.total ?? 0}</p>
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
                  <span>Delivering to: {order.shipping_address || order.address || "—"}</span>
                </div>

                <div className="flex items-center gap-4">
                  <button onClick={() => confirmDelivery(order.id)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2">
                    <Check className="w-5 h-5" /> Confirm Delivery
                  </button>
                  <button onClick={() => {
                    const description = prompt("Please describe the issue with your order:");
                    if (description) raiseIssue(order.id, description);
                  }} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md flex items-center gap-2" title="Raise an Issue">
                    <CircleX className="w-5 h-5" /> Raise Issue
                  </button>
                </div>

                <Link to="/order-tracking" className="text-sm text-blue-600 hover:underline">View Full Order Details</Link>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
};

export default NotificationsPage;
