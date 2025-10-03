// src/pages/NotificationsPage.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNotification } from "@/context/NotificationContext";
import { CircleX, Check, MapPin, Mail, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

type AnyNotification = Record<string, any>;

const makeLocalNotification = (payload: Partial<AnyNotification>) => ({
  id: `local-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
  created_at: new Date().toISOString(),
  acknowledged: false,
  ...payload,
});

const NotificationsPage: React.FC = () => {
  const { notifications, loading, confirmDelivery, raiseIssue, notificationCount } = useNotification();

  // role flags + ids
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);

  // Local, in-memory notifications produced by realtime vendor events.
  const [localNotifications, setLocalNotifications] = useState<AnyNotification[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

        // vendor detection: prefer vendor table by user_id
        let vendorFound = false;
        let foundVendorId: string | null = null;

        const extractVendorIdFromRow = (row: any): string | null => {
          if (!row) return null;
          const cand = row.id ?? row.vendor_id ?? row.user_id ?? row.seller_id ?? row.merchant_id ?? row.vendorid ?? null;
          return cand != null ? String(cand) : null;
        };

        try {
          const { data: vendorData, error: vendorError } = await supabase
            .from("vendor")
            .select("id,user_id")
            .eq("user_id", session.user.id)
            .maybeSingle();

          if (!vendorError && vendorData) {
            vendorFound = true;
            foundVendorId = extractVendorIdFromRow(vendorData);
          } else {
            const viewCandidates = ["vendor_profiles_with_user", "vendor_profiles_with_user_v2", "vendor_profiles", "vendor_profile_with_user"];
            for (const viewName of viewCandidates) {
              try {
                const { data: viewRow, error: viewError, status } = await supabase
                  .from(viewName)
                  .select("*")
                  .eq("user_id", session.user.id)
                  .maybeSingle();

                if (!viewError && viewRow) {
                  vendorFound = true;
                  foundVendorId = extractVendorIdFromRow(viewRow);
                  break;
                }
              } catch (innerErr) {
                console.warn(`probe view ${viewName} error:`, innerErr);
              }
            }
          }
        } catch (err) {
          console.warn("vendor lookup error (unexpected):", err);
        }

        if (mountedRef.current) {
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

  // combine server-provided notifications + local realtime ones (dedupe by id)
  const combinedNotifications = React.useMemo(() => {
    const map = new Map<string, AnyNotification>();
    // local first so they appear on top
    for (const n of localNotifications) {
      map.set(String(n.id), n);
    }
    for (const n of notifications || []) {
      if (!map.has(String(n.id))) map.set(String(n.id), n);
    }
    return Array.from(map.values()).sort((a: AnyNotification, b: AnyNotification) => {
      const ta = new Date(a.created_at ?? a.createdAt ?? a.createdAt ?? 0).getTime();
      const tb = new Date(b.created_at ?? b.createdAt ?? b.createdAt ?? 0).getTime();
      return tb - ta;
    });
  }, [notifications, localNotifications]);

  // Setup realtime subscriptions for vendor table (inserts and updates)
  useEffect(() => {
    if (!userId) return;

    // handlers
    const handleVendorInsert = async (newRow: any) => {
      // Create notifications for admins (site owners) when new application submitted
      const message = `New vendor application — ${newRow.name ?? "Unknown"} (${newRow.email ?? "no-email"})`;
      const notif = makeLocalNotification({
        type: "vendor_application",
        message,
        vendor_id: newRow.id,
        vendor_row: newRow,
      });

      // Add locally
      setLocalNotifications((prev) => [notif, ...prev].slice(0, 200));

      // Try to persist to notifications table (best-effort)
      try {
        await supabase.from("notifications").insert([
          {
            message,
            type: "vendor_application",
            vendor_id: newRow.id,
            created_at: new Date().toISOString(),
            // deliver it to admins (you might use a role flag or leave recipient null and let backend fan-out)
            recipient_role: "admin",
            acknowledged: false,
            data: newRow,
          },
        ]);
      } catch (err) {
        console.warn("Could not insert vendor application notification (RLS?)", err);
      }
    };

    const handleVendorUpdate = async (newRow: any, oldRow?: any) => {
      // If application got reviewed/promoted → notify the applicant (and admins)
      const becameReviewed = !oldRow?.reviewed && !!newRow?.reviewed;
      const becamePromoted = oldRow?.status !== newRow?.status && String(newRow?.status).toLowerCase() === "promoted";

      if (becameReviewed || becamePromoted) {
        const msgForAdmin = `Vendor application updated — ${newRow.name ?? "Unknown"} : ${newRow.status ?? (newRow.reviewed ? "reviewed" : "updated")}`;
        const adminNotif = makeLocalNotification({
          type: "vendor_update",
          message: msgForAdmin,
          vendor_id: newRow.id,
          vendor_row: newRow,
        });

        setLocalNotifications((prev) => [adminNotif, ...prev].slice(0, 200));
        try {
          await supabase.from("notifications").insert([
            {
              message: msgForAdmin,
              type: "vendor_update",
              vendor_id: newRow.id,
              recipient_role: "admin",
              data: newRow,
              acknowledged: false,
              created_at: new Date().toISOString(),
            },
          ]);
        } catch (err) {
          console.warn("persist admin vendor_update failed:", err);
        }

        // Notify the applicant/user who submitted (if user_id present)
        if (newRow?.user_id) {
          const applicantMsg = becamePromoted
            ? `Congratulations — your vendor application was approved and promoted.`
            : `Your vendor application status changed: ${newRow.status ?? (newRow.reviewed ? "Reviewed" : "Updated")}`;

          const applicantNotif = makeLocalNotification({
            type: "vendor_status",
            message: applicantMsg,
            vendor_id: newRow.id,
            recipient_user_id: newRow.user_id,
            vendor_row: newRow,
          });

          // If the current signed-in user is the applicant, show the notification locally
          if (String(newRow.user_id) === String(userId)) {
            setLocalNotifications((prev) => [applicantNotif, ...prev].slice(0, 200));
          }

          // Best-effort persist
          try {
            await supabase.from("notifications").insert([
              {
                message: applicantMsg,
                type: "vendor_status",
                vendor_id: newRow.id,
                recipient_user_id: newRow.user_id,
                data: newRow,
                acknowledged: false,
                created_at: new Date().toISOString(),
              },
            ]);
          } catch (err) {
            console.warn("persist vendor_status failed:", err);
          }
        }
      }
    };

    // subscribe using supabase v2 channel API if available
    let channel: any = null;
    try {
      if ((supabase as any).channel) {
        channel = (supabase as any)
          .channel("public:vendor-watch")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "vendor" },
            (payload: any) => {
              try {
                handleVendorInsert(payload.new);
              } catch (e) {
                console.warn("handleVendorInsert error:", e);
              }
            }
          )
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "vendor" },
            (payload: any) => {
              try {
                handleVendorUpdate(payload.new, payload.old);
              } catch (e) {
                console.warn("handleVendorUpdate error:", e);
              }
            }
          )
          .subscribe();
      } else {
        // fallback to older realtime API
        const subInsert: any = (supabase as any)
          .from("vendor")
          .on("INSERT", (payload: any) => handleVendorInsert(payload.new))
          .subscribe();

        const subUpdate: any = (supabase as any)
          .from("vendor")
          .on("UPDATE", (payload: any) => handleVendorUpdate(payload.new, payload.old))
          .subscribe();

        channel = { subInsert, subUpdate };
      }
    } catch (err) {
      console.warn("Could not setup vendor realtime subscription:", err);
    }

    return () => {
      // cleanup
      try {
        if (!channel) return;
        if ((supabase as any).removeChannel && typeof (supabase as any).removeChannel === "function") {
          (supabase as any).removeChannel(channel).catch(() => {});
        } else {
          // try unsubscribe on props
          if (channel.unsubscribe) channel.unsubscribe().catch(() => {});
          if (channel.subInsert && channel.subInsert.unsubscribe) channel.subInsert.unsubscribe().catch(() => {});
          if (channel.subUpdate && channel.subUpdate.unsubscribe) channel.subUpdate.unsubscribe().catch(() => {});
        }
      } catch (e) {
        console.warn("Error cleaning up vendor subscription:", e);
      }
    };
  }, [userId, isAdmin, isVendor, vendorId]);

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
  if (!combinedNotifications || combinedNotifications.length === 0) return <p className="text-center text-gray-500">No notifications.</p>;

  // Split notifications into categories
  const complaints = combinedNotifications.filter((n: AnyNotification) => isComplaint(n));
  const messages = combinedNotifications.filter((n: AnyNotification) => isMessage(n) && !isComplaint(n));
  const orders = combinedNotifications.filter((n: AnyNotification) => !isComplaint(n) && !isMessage(n));
  const vendorApps = combinedNotifications.filter((n: AnyNotification) => String(n.type).includes("vendor") || n.vendor_id);

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-bold text-center">
        Notifications
        <span className="inline-flex items-center gap-2 ml-3">
          {isAdmin && <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded-full">Admin</span>}
          {isVendor && <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">Vendor</span>}
        </span>
      </h1>

      {/* New: Vendor application events */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Vendor Events {vendorApps.length > 0 && <span className="text-sm text-gray-500">({vendorApps.length})</span>}</h2>
          <div className="text-sm text-gray-500">Application submissions and status updates.</div>
        </div>

        {vendorApps.length === 0 ? (
          <div className="p-4 rounded bg-gray-50 dark:bg-gray-800 text-sm text-gray-500">No vendor events.</div>
        ) : (
          <div className="space-y-3">
            {vendorApps.map((n: AnyNotification) => (
              <div key={String(n.id)} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 space-y-2 flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-indigo-500" />
                    <div>
                      <div className="font-medium">{String(n.message ?? n.title ?? "Vendor event")}</div>
                      <div className="text-xs text-gray-400">{n.vendor_row?.name ?? n.vendor_id ?? n.vendor_id ?? ""}</div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                </div>

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      try {
                        if (!n.id?.toString().startsWith("local-")) {
                          // try server-side ack first (if notification persisted)
                          const { error } = await supabase.from("notifications").update({ acknowledged: true }).eq("id", n.id);
                          if (error) console.warn("ack error:", error);
                        }
                        // remove local copy
                        setLocalNotifications((prev) => prev.filter((x) => String(x.id) !== String(n.id)));
                      } catch (err) {
                        console.warn("ack local vendor notif error:", err);
                      }
                    }}
                    className="px-3 py-1 rounded bg-indigo-600 text-white text-sm flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" /> Acknowledge
                  </button>

                  {n.vendor_row?.id && isAdmin && (
                    <Link to={`/admin/vendor/${n.vendor_row.id}`} className="px-3 py-1 rounded bg-gray-100 text-sm hover:bg-gray-200">
                      View Application
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* existing categories below (complaints/messages/orders) */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Other Notifications</h2>

        {/* Complaints */}
        {complaints.length > 0 && (
          <div>
            <h3 className="text-lg font-medium mb-3">Complaints ({complaints.length})</h3>
            <div className="space-y-3">
              {complaints.map((n: AnyNotification) => (
                <div key={String(n.id)} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">Ticket #{n.id}</div>
                      <div className="text-xs text-gray-500">{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                    </div>
                    <div className="text-sm text-red-600 font-semibold">Complaint</div>
                  </div>

                  <div className="text-sm text-gray-700 dark:text-gray-300">{String(n.message ?? n.body ?? n.note ?? "Customer reports an issue.")}</div>

                  <div className="flex gap-2">
                    <button onClick={() => { /* ack via supabase */ }} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm flex items-center gap-2">
                      <Check className="w-4 h-4" /> Acknowledge
                    </button>

                    <button onClick={() => {
                      const email = n.customer_email ?? n.email ?? n.user_email ?? "";
                      if (email) window.location.href = `mailto:${email}?subject=Regarding order ${n.id}`;
                      else alert("No customer email available.");
                    }} className="px-3 py-1 rounded border text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4" /> Contact Customer
                    </button>

                    <button onClick={() => {
                      const desc = prompt("Add a short internal note for support/escalation (optional):") ?? "";
                      raiseIssue(n.id, desc || "Escalated from notifications UI");
                    }} className="px-3 py-1 rounded bg-red-600 text-white text-sm">Escalate</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.length > 0 && (
          <div>
            <h3 className="text-lg font-medium mb-3">Messages</h3>
            <div className="space-y-3">
              {messages.map((n: AnyNotification) => (
                <div key={String(n.id)} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-4 space-y-2">
                  <div className="flex justify-between">
                    <div className="font-medium">#{n.id} — {String(n.subject ?? n.title ?? "Message")}</div>
                    <div className="text-xs text-gray-400">{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</div>
                  </div>

                  <div className="text-sm text-gray-700 dark:text-gray-300">{String(n.message ?? n.body ?? "—")}</div>

                  <div className="flex gap-2">
                    <button onClick={() => { /* ack action */ }} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm flex items-center gap-2">
                      <Check className="w-4 h-4" /> Acknowledge
                    </button>
                    <button onClick={() => {
                      const email = n.customer_email ?? n.email ?? "";
                      if (email) window.location.href = `mailto:${email}?subject=Reply`;
                      else alert("No email available");
                    }} className="px-3 py-1 rounded border text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4" /> Contact
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orders */}
        {orders.length > 0 && (
          <div>
            <h3 className="text-lg font-medium mb-3">Orders ({orders.length})</h3>
            <div className="space-y-4">
              {orders.map((order: AnyNotification) => {
                const placedDate = order.created_at ? new Date(order.created_at).toLocaleString() : "";
                const items = Array.isArray(order.items) ? order.items : [];

                return (
                  <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-md p-6 space-y-6 relative">
                    <div>
                      <h3 className="text-lg font-semibold">Order #{order.id}</h3>
                      <p className="text-sm">Placed: {placedDate}</p>
                      <p className="text-sm">Status: {order.status ?? "Unknown"}</p>
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
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default NotificationsPage;
