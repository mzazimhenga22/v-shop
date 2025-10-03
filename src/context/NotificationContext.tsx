// src/context/NotificationContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  status?: string | null;
  user_id?: string | null;
  total_amount?: number | null;
  items?: any;
  shipping_address?: string | null;
  [k: string]: any;
}

interface NotificationContextValue {
  notifications: OrderRow[];
  notificationCount: number;
  loading: boolean;
  confirmDelivery: (orderId: string | number) => Promise<void>;
  raiseIssue: (orderId: string | number, description: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export const useNotification = (): NotificationContextValue => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotification must be used within NotificationProvider");
  return ctx;
}

/** Copied/adapted canonicalStatus (case insensitive) */
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

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [channel, setChannel] = useState<any>(null);

  // fetch delivered-but-not-confirmed orders for current user
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setNotifications([]);
        setLoading(false);
        return;
      }

      // Fetch orders where status contains 'deliver' but not 'confirm' (case-insensitive)
      // Note: ilike is case-insensitive pattern matching in Postgres/Supabase
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .ilike("status", "%deliver%")
        .not("status", "ilike", "%confirm%")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("fetchNotifications error:", error);
        setNotifications([]);
      } else {
        // filter once more defensively with canonicalStatus
        const filtered: OrderRow[] = (data ?? []).filter((o) => canonicalStatus(o.status) === "Delivered");
        setNotifications(filtered);
      }
    } catch (err) {
      console.error("fetchNotifications unexpected error:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // setup realtime subscription to keep notifications in sync
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // create a channel scoped to this user
      // channel name can be anything unique
      const ch = supabase
        .channel(`notifications-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
          async (payload) => {
            if (!mounted) return;
            try {
              const newRow = (payload as any).new as OrderRow | undefined;
              const oldRow = (payload as any).old as OrderRow | undefined;

              // If an order becomes 'Delivered' (or includes "deliver"), ensure it's in notifications
              if (newRow) {
                const newIsDelivered = canonicalStatus(newRow.status) === "Delivered";

                setNotifications((prev) => {
                  const exists = prev.some((o) => String(o.id) === String(newRow.id));
                  if (newIsDelivered && !exists) {
                    // add to top
                    return [newRow, ...prev];
                  } else if (!newIsDelivered && exists) {
                    // remove it (it might be Confirmed or changed)
                    return prev.filter((o) => String(o.id) !== String(newRow.id));
                  } else if (newIsDelivered && exists) {
                    // update the existing entry
                    return prev.map((o) => (String(o.id) === String(newRow.id) ? { ...o, ...newRow } : o));
                  }
                  return prev;
                });
              }

              // handle deletes explicitly (if a row was deleted remove it)
              if (payload.eventType === "DELETE" && oldRow) {
                setNotifications((prev) => prev.filter((o) => String(o.id) !== String(oldRow.id)));
              }
            } catch (err) {
              console.error("Realtime notifications handler error:", err);
              // fallback: fetch fresh notifications
              fetchNotifications();
            }
          }
        )
        .subscribe();

      setChannel(ch);
    })();

    return () => {
      mounted = false;
      try {
        if (channel) {
          if (typeof channel.unsubscribe === "function") channel.unsubscribe();
          else (supabase as any).removeChannel?.(channel);
        }
      } catch {
        // no-op
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // confirmDelivery: mark order as Confirmed (removes it from notifications)
  const confirmDelivery = async (orderId: string | number) => {
    setLoading(true);
    try {
      // use supabase update to mark confirmed
      const { error } = await supabase
        .from("orders")
        .update({ status: "Confirmed" })
        .eq("id", orderId);

      if (error) {
        console.error("confirmDelivery supabase error:", error);
        throw error;
      }

      // optimistically remove from local notifications
      setNotifications((prev) => prev.filter((o) => String(o.id) !== String(orderId)));
    } catch (err) {
      console.error("confirmDelivery error:", err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // raiseIssue: create an order_issues row; keeps notification as-is
  const raiseIssue = async (orderId: string | number, description: string) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("order_issues").insert({
        order_id: orderId,
        user_id: user.id,
        description,
        created_at: new Date().toISOString(),
        status: "open",
      });

      if (error) {
        console.error("raiseIssue error:", error);
        throw error;
      }
    } finally {
      setLoading(false);
    }
  };

  const refresh = async () => {
    await fetchNotifications();
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        notificationCount: notifications.length,
        loading,
        confirmDelivery,
        raiseIssue,
        refresh,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
