import express from "express";
import { supabase } from "../supabaseClient.js";
import { authMiddleware } from "../authMiddleware.js";
import Stripe from "stripe";

const router = express.Router();

// Admin vendor id fallback used by admin-created products (configurable via env)
const ADMIN_VENDOR_ID = process.env.ADMIN_VENDOR_ID || "11111111-1111-1111-1111-111111111111";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const stripe: Stripe | null = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

/** Helpers */
const isUuid = (s: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s || ""));

async function resolveProductUuid(possibleId: string | number | null | undefined): Promise<string | null> {
  if (possibleId === null || possibleId === undefined) return null;
  const asStr = String(possibleId).trim();
  if (!asStr) return null;
  if (isUuid(asStr)) return asStr;

  try {
    const { data: vpRow, error: vpErr } = await supabase
      .from("vendor_product")
      .select("product_id")
      .eq("id", asStr)
      .maybeSingle();

    if (vpErr) {
      console.error("❌ vendor_product lookup error:", vpErr);
      return null;
    }

    if (vpRow && vpRow.product_id) return vpRow.product_id;
  } catch (err: any) {
    console.error("❌ resolveProductUuid crash:", err);
    return null;
  }

  return null;
}

function brief(obj: any, len = 2000) {
  try {
    return JSON.stringify(obj).slice(0, len);
  } catch {
    return String(obj).slice(0, len);
  }
}

async function ensureVendorProfileExists(vendorId: string): Promise<boolean> {
  try {
    const payload = { id: vendorId, updated_at: new Date().toISOString() } as any;
    const { data, error } = await supabase.from("vendor_profiles").upsert(payload).select();
    if (error) {
      console.warn("Failed to upsert vendor_profiles for", vendorId, error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn("Unexpected error upserting vendor_profiles:", err);
    return false;
  }
}

async function isRequesterAdmin(requesterId: string | undefined | null, requesterRole: string | undefined | null): Promise<boolean> {
  try {
    if (!requesterId) return false;

    if (requesterRole && String(requesterRole).toLowerCase() === "admin") return true;

    try {
      // @ts-ignore
      const adminResp = await (supabase as any).auth.admin.getUserById(requesterId);
      if (adminResp && adminResp.data && adminResp.data.user) {
        const u = adminResp.data.user as any;
        const appRole = u?.app_metadata?.role ?? null;
        const userMetaIsAdmin = u?.user_metadata?.isAdmin ?? null;
        if (String(appRole).toLowerCase() === "admin") return true;
        if (userMetaIsAdmin === true || String(userMetaIsAdmin).toLowerCase() === "true") return true;
      }
    } catch (adminErr) {
      // ignore
    }

    try {
      const { data: userRow, error: userErr } = await supabase.from("users").select("id, role, is_admin, user_metadata").eq("id", requesterId).maybeSingle();
      if (!userErr && userRow) {
        if (String(userRow.role).toLowerCase() === "admin") return true;
        if (userRow.is_admin === true) return true;
        const um = (userRow as any).user_metadata ?? {};
        if (um?.isAdmin === true || String(um?.isAdmin).toLowerCase() === "true") return true;
      }
    } catch (tblErr) {
      // ignore
    }

    try {
      const { data: profRow, error: profErr } = await supabase.from("profiles").select("id, role, is_admin").eq("id", requesterId).maybeSingle();
      if (!profErr && profRow) {
        if (String(profRow.role).toLowerCase() === "admin") return true;
        if (profRow.is_admin === true) return true;
      }
    } catch (_) {
      // ignore
    }

    return false;
  } catch (err) {
    console.warn("isRequesterAdmin helper crashed:", err);
    return false;
  }
}

/**
 * Helper to fetch vendor name for a vendor id (single fetcher w/ cache)
 */
async function createVendorNameFetcher() {
  const cache = new Map<string, string | null>();

  return async function fetchVendorName(vendorId: string | null | undefined): Promise<string | null> {
    if (!vendorId) return null;
    const id = String(vendorId);
    if (cache.has(id)) return cache.get(id) ?? null;

    try {
      // try vendor_profiles_with_user (match id or user_id)
      try {
        const { data: vpw, error: vpwErr } = await supabase
          .from("vendor_profiles_with_user")
          .select("vendor_name, display_name, company_name, user_id, id")
          .or(`id.eq.${id},user_id.eq.${id}`)
          .maybeSingle();

        if (!vpwErr && vpw) {
          const name = (vpw as any).vendor_name ?? (vpw as any).display_name ?? (vpw as any).company_name ?? null;
          cache.set(id, name);
          return name;
        }
      } catch (err) {
        // ignore
      }

      // try vendor_profiles
      try {
        const { data: vp, error: vpErr } = await supabase.from("vendor_profiles").select("id, vendor_name, display_name, company_name, name").eq("id", id).maybeSingle();
        if (!vpErr && vp) {
          const name = (vp as any).vendor_name ?? (vp as any).display_name ?? (vp as any).company_name ?? (vp as any).name ?? null;
          cache.set(id, name);
          return name;
        }
      } catch (err) {
        // ignore
      }

      // last resort: vendors table
      try {
        const { data: v, error: vErr } = await supabase.from("vendors").select("id, name, vendor_name, display_name, company_name").eq("id", id).maybeSingle();
        if (!vErr && v) {
          const name = (v as any).vendor_name ?? (v as any).display_name ?? (v as any).company_name ?? (v as any).name ?? null;
          cache.set(id, name);
          return name;
        }
      } catch (err) {
        // ignore
      }
    } catch (err) {
      console.warn("fetchVendorName error:", err);
    }

    cache.set(id, null);
    return null;
  };
}

/**
 * Batch-resolve vendor names. Returns Map<vendorId, vendorName|null>
 */
async function batchResolveVendorNames(vendorIdsRaw: unknown[]) {
  const vendorIds = Array.from(new Set(((vendorIdsRaw || []) as any[]).map(String)));
  const map = new Map<string, string | null>();
  if (vendorIds.length === 0) return map;

  // 1) vendor_profiles_with_user by id
  try {
    const { data: vpwById, error: vpwIdErr } = await supabase
      .from("vendor_profiles_with_user")
      .select("id, vendor_name, display_name, company_name, user_id")
      .in("id", vendorIds);
    if (!vpwIdErr && Array.isArray(vpwById)) {
      for (const r of vpwById) {
        const id = String((r as any).id);
        const name = (r as any).vendor_name ?? (r as any).display_name ?? (r as any).company_name ?? null;
        map.set(id, name);
      }
    }
  } catch (err) {
    console.warn("vendor_profiles_with_user .in(id) lookup failed:", err);
  }

  // 2) vendor_profiles_with_user by user_id
  try {
    const { data: vpwByUser, error: vpwUserErr } = await supabase
      .from("vendor_profiles_with_user")
      .select("id, vendor_name, display_name, company_name, user_id")
      .in("user_id", vendorIds);
    if (!vpwUserErr && Array.isArray(vpwByUser)) {
      for (const r of vpwByUser) {
        const userId = String((r as any).user_id);
        const name = (r as any).vendor_name ?? (r as any).display_name ?? (r as any).company_name ?? null;
        map.set(userId, name);
      }
    }
  } catch (err) {
    console.warn("vendor_profiles_with_user .in(user_id) lookup failed:", err);
  }

  // 3) vendor_profiles
  const unresolved1 = vendorIds.filter((id) => !map.has(id));
  if (unresolved1.length > 0) {
    try {
      const { data: vpRows, error: vpErr } = await supabase
        .from("vendor_profiles")
        .select("id, vendor_name, display_name, company_name, name")
        .in("id", unresolved1);
      if (!vpErr && Array.isArray(vpRows)) {
        for (const r of vpRows) {
          const id = String((r as any).id);
          const name = (r as any).vendor_name ?? (r as any).display_name ?? (r as any).company_name ?? (r as any).name ?? null;
          map.set(id, name);
        }
      }
    } catch (err) {
      console.warn("vendor_profiles lookup failed:", err);
    }
  }

  // 4) vendors
  const unresolved2 = vendorIds.filter((id) => !map.has(id));
  if (unresolved2.length > 0) {
    try {
      const { data: vRows, error: vErr } = await supabase
        .from("vendors")
        .select("id, name, vendor_name, display_name, company_name")
        .in("id", unresolved2);
      if (!vErr && Array.isArray(vRows)) {
        for (const r of vRows) {
          const id = String((r as any).id);
          const name = (r as any).vendor_name ?? (r as any).display_name ?? (r as any).company_name ?? (r as any).name ?? null;
          map.set(id, name);
        }
      }
    } catch (err) {
      console.warn("vendors lookup failed:", err);
    }
  }

  // final: map missing => null
  for (const id of vendorIds) {
    if (!map.has(id)) map.set(id, null);
  }

  return map;
}

/**
 * Try to reconcile an order using stored Stripe PaymentIntent id (best-effort).
 * If PI is succeeded we update order payment_status/status and return the updated order object.
 */
async function reconcileOrderWithStripeIfAvailable(order: any) {
  if (!order) return order;
  try {
    const piId = order?.payment_details?.stripePaymentIntentId ?? null;
    if (!piId || !stripe) return order;

    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      const succeeded = String(pi.status).toLowerCase() === "succeeded";
      if (succeeded) {
        const updatePayload: any = {
          payment_status: "paid",
          status: "confirmed",
          payment_details: { ...(order.payment_details || {}), stripePaymentIntentId: pi.id, stripeRaw: pi },
          updated_at: new Date().toISOString(),
        };
        const { data: updated, error: updErr } = await supabase.from("orders").update(updatePayload).eq("id", order.id).select().maybeSingle();
        if (!updErr && updated) return updated;
      }
    } catch (err) {
      console.warn("reconcileOrderWithStripeIfAvailable: stripe retrieval failed:", err);
    }
  } catch (err) {
    console.warn("reconcileOrderWithStripeIfAvailable crashed:", err);
  }
  return order;
}

//
// ROUTES
//

/* GET /orders */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;

    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(req.query.per_page) || 20));
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    let base = supabase.from("orders").select("*", { count: "exact" }).order("created_at", { ascending: false });

    if (role === "user") base = base.eq("user_id", userId);
    else if (role === "vendor") base = base.eq("vendor_id", userId);
    else if (role === "admin") {
      // admins see all
    } else {
      base = base.or(`user_id.eq.${userId},vendor_id.eq.${userId}`);
    }

    const { data, error, count } = await base.range(from, to);
    if (error) {
      console.error("❌ GET /orders Supabase error:", error);
      return res.status(500).json({ orders: [], meta: { page, per_page: perPage, total: 0 }, error: error.message });
    }

    // Batch-resolve vendor names for any orders missing vendor_name
    const vendorIds = Array.from(new Set((data || []).map((o: any) => o.vendor_id).filter(Boolean).map(String)));
    const vendorNameMap = await batchResolveVendorNames(vendorIds);

    const enriched = (data || []).map((order: any) => {
      if (order.vendor_id && !order.vendor_name) {
        const key = String(order.vendor_id);
        order.vendor_name = vendorNameMap.get(key) ?? null;
      }
      return order;
    });

    res.status(200).json({ orders: enriched, meta: { page, per_page: perPage, total: count || 0 } });
  } catch (err) {
    console.error("💥 GET /orders crash:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* GET /orders/:id */
/* GET /orders/:id */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const rawId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    // flexible lookup helper — tries several strategies but never calls eq("id", ...) unless id is UUID
    async function fetchOrderFlexible(idToFind: string) {
      // 1) If it's a UUID, do the direct primary-key lookup (fastest)
      if (isUuid(idToFind)) {
        try {
          const { data: byPk, error: byPkErr } = await supabase.from("orders").select("*").eq("id", idToFind).maybeSingle();
          if (!byPkErr && byPk) return byPk;
        } catch (err) {
          // log but continue trying fallbacks
          console.warn("fetchOrderFlexible: direct UUID lookup failed:", err);
        }
      }

      // 2) Try order_id (string column used by some clients)
      try {
        const { data: byOrderId, error: byOrderErr } = await supabase.from("orders").select("*").eq("order_id", idToFind).maybeSingle();
        if (!byOrderErr && byOrderId) return byOrderId;
      } catch (err) {
        console.warn("fetchOrderFlexible: order_id lookup failed:", err);
      }

      // 3) Try _id (legacy / alternate id)
      try {
        const { data: by_Uid, error: byUErr } = await supabase.from("orders").select("*").eq("_id", idToFind).maybeSingle();
        if (!byUErr && by_Uid) return by_Uid;
      } catch (err) {
        console.warn("fetchOrderFlexible: _id lookup failed:", err);
      }

      // 4) Try meta->>idempotency_key
      try {
        const { data: byIk, error: byIkErr } = await supabase
          .from("orders")
          .select("*")
          .filter("meta->>idempotency_key", "eq", idToFind)
          .maybeSingle();
        if (!byIkErr && byIk) return byIk;
      } catch (err) {
        console.warn("fetchOrderFlexible: meta->>idempotency_key lookup failed:", err);
      }

      // 5) Try meta->>client_ts (client timestamp fallback)
      try {
        const { data: byClientTs, error: byCtErr } = await supabase
          .from("orders")
          .select("*")
          .filter("meta->>client_ts", "eq", idToFind)
          .maybeSingle();
        if (!byCtErr && byClientTs) return byClientTs;
      } catch (err) {
        console.warn("fetchOrderFlexible: meta->>client_ts lookup failed:", err);
      }

      // nothing found
      return null;
    }

    const order = await fetchOrderFlexible(String(rawId));

    if (!order) return res.status(404).json({ error: "Order not found" });

    // authorization checks (unchanged)
    if (role === "user" && String(order.user_id) !== String(userId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (role === "vendor" && order.vendor_id && String(order.vendor_id) !== String(userId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // fetch vendor_name if missing
    if (order.vendor_id && !order.vendor_name) {
      try {
        const fetchVendorName = await createVendorNameFetcher();
        order.vendor_name = await fetchVendorName(order.vendor_id);
      } catch (err) {
        // ignore
      }
    }

    res.json({ order });
  } catch (err) {
    console.error("💥 GET /orders/:id crash:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /orders */
router.post("/", authMiddleware, async (req, res) => {
  const { name, email, shipping_address, total_amount, items, payment_status, payment_method, meta } = req.body;

  const user_id = req.user.id;
  const role = req.user.role;

  if (!total_amount || !items || !shipping_address) {
    return res.status(400).json({ error: "Missing required fields (total_amount, items, shipping_address)" });
  }

  let parsedItems: any[];
  try {
    parsedItems = typeof items === "string" ? JSON.parse(items) : items;
  } catch (err) {
    console.error("❌ Invalid items JSON:", err);
    return res.status(400).json({ error: "Invalid items: must be JSON array" });
  }

  if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
    return res.status(400).json({ error: "Items must be a non-empty array" });
  }

  console.debug("POST /orders body (brief):", brief({ name, email, shipping_address, total_amount, items: parsedItems.slice(0, 5) }));

  try {
    // --- Idempotency protection (improved):
    // Extract idempotency key from header, meta, or client_ts fallback, canonicalize and use it for all checks.
    const clientTs = meta?.client_ts ?? null;
    const ikFromMetaRaw = meta?.idempotency_key ?? meta?.idempotencyKey ?? null;
    const ikFromMeta = ikFromMetaRaw ? String(ikFromMetaRaw).trim() : null;
    const idempotencyHeaderRaw = (req.headers["idempotency-key"] || req.headers["idempotency_key"] || req.headers["Idempotency-Key"] || null) as string | null;
    const idempotencyHeader = idempotencyHeaderRaw ? String(idempotencyHeaderRaw).trim() : null;

    // canonical idempotency key to check (header preferred, then meta.idempotency_key, then client_ts fallback)
    const ikToCheck = idempotencyHeader ?? ikFromMeta ?? (clientTs ? `${user_id}:${String(clientTs)}` : null);

    console.info("POST /orders - idempotency incoming", { user_id, idempotencyHeader, ikFromMeta, clientTs, ikToCheck });

    // 0) If we have an ikToCheck, do a scoped lookup by user_id + idempotency_key (top-level) with meta fallback
    if (ikToCheck) {
      try {
        let existingByIk: any = null;
        try {
          const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("user_id", user_id)
            .eq("idempotency_key", ikToCheck)
            .maybeSingle();
          if (!error && data) existingByIk = data;
        } catch (innerErr) {
          // ignore - will try fallback
        }

        if (!existingByIk) {
          try {
            const { data: fallback, error: fallbackErr } = await supabase
              .from("orders")
              .select("*")
              .eq("user_id", user_id)
              .filter("meta->>idempotency_key", "eq", ikToCheck)
              .maybeSingle();
            if (!fallbackErr && fallback) existingByIk = fallback;
          } catch (fbErr) {
            console.warn("Fallback idempotency lookup failed:", fbErr);
          }
        }

        if (existingByIk) {
          // attempt to reconcile using stripe PI (if present & configured)
          try {
            const reconciled = await reconcileOrderWithStripeIfAvailable(existingByIk);
            if (reconciled) {
              console.info("Idempotency: found existing order by ikToCheck and reconciled with Stripe:", reconciled.id);
              return res.status(200).json({ order: reconciled, idempotent: true });
            }
          } catch (reconErr) {
            console.warn("Idempotency: stripe reconciliation failed (non-fatal):", reconErr);
            // return original existing order as fallback
          }

          console.info("Idempotency: found existing order by ikToCheck (scoped to user), returning it", existingByIk.id);
          return res.status(200).json({ order: existingByIk, idempotent: true });
        }
      } catch (err) {
        console.warn("Idempotency (ikToCheck) pre-insert check failed (non-fatal):", err);
      }
    }

    // 1) Fallback: if no ikToCheck but client_ts provided, look for existing order with same user_id + meta.client_ts
    if (!ikToCheck && clientTs) {
      try {
        const { data: existing, error: existsErr } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", user_id)
          .contains("meta", { client_ts: clientTs })
          .maybeSingle();

        if (!existsErr && existing) {
          console.info("Idempotency: found existing order by meta.client_ts, returning it instead of inserting duplicate", existing.id);
          // attempt Stripe reconciliation too
          try {
            const reconciled = await reconcileOrderWithStripeIfAvailable(existing);
            if (reconciled) return res.status(200).json({ order: reconciled, idempotent: true });
          } catch {}
          return res.status(200).json({ order: existing, idempotent: true });
        }
      } catch (err) {
        console.warn("Idempotency (client_ts) check failed:", err);
      }
    }

    // If neither header/meta/client_ts matched, proceed to build & insert order.
    const fetchVendorName = await createVendorNameFetcher();

    const mappedItems: any[] = [];

    for (const it of parsedItems) {
      const candidateProductId = it.product_id ?? it.productId ?? null;
      const candidateVendorProductId = it.vendor_product_id ?? it.vendorProductId ?? it.vendorProduct ?? null;
      const candidateId = it.id ?? null;

      let resolvedProductUuid: string | null = null;
      let originalIdentifier: string | null = null;
      let resolvedItemVendorId: string | null = null;

      if (candidateProductId) {
        originalIdentifier = String(candidateProductId);
        resolvedProductUuid = await resolveProductUuid(candidateProductId);
      }

      if (!resolvedProductUuid && candidateVendorProductId) {
        originalIdentifier = String(candidateVendorProductId);
        resolvedProductUuid = await resolveProductUuid(candidateVendorProductId);
      }

      if (!resolvedProductUuid && candidateId) {
        originalIdentifier = String(candidateId);
        resolvedProductUuid = await resolveProductUuid(candidateId);
      }

      // try to resolve vendor for the item via products table
      if (resolvedProductUuid) {
        try {
          const { data: prodRow, error: prodErr } = await supabase.from("products").select("vendor_id").eq("id", resolvedProductUuid).maybeSingle();
          if (!prodErr && prodRow && prodRow.vendor_id) resolvedItemVendorId = prodRow.vendor_id;
        } catch (err: any) {
          console.warn("❗ products vendor lookup crash:", err);
        }
      }

      // fallback: vendor_product row
      if (!resolvedItemVendorId && originalIdentifier) {
        try {
          const { data: vpRow, error: vpErr } = await supabase
            .from("vendor_product")
            .select("vendor_id, product_id")
            .eq("id", originalIdentifier)
            .maybeSingle();

          if (!vpErr && vpRow) {
            if (!resolvedProductUuid && vpRow.product_id) resolvedProductUuid = vpRow.product_id;
            if (vpRow.vendor_id) resolvedItemVendorId = vpRow.vendor_id;
          }
        } catch (err: any) {
          console.warn("❗ vendor_product vendor lookup crash:", err);
        }
      }

      // Fetch vendor name (if we have a vendor id)
      let vendorNameForItem: string | null = null;
      if (resolvedItemVendorId) {
        try {
          vendorNameForItem = await fetchVendorName(resolvedItemVendorId);
        } catch (err) {
          // ignore and continue
        }
      }

      mappedItems.push({
        ...it,
        _original_id: originalIdentifier ?? null,
        product_id: resolvedProductUuid,
        vendor_id: resolvedItemVendorId ?? null,
        vendor_name: vendorNameForItem ?? null,
      });
    }

    // --- validate vendor_ids referenced by items and optionally repair admin vendor ---
    const vendorIdsInItems = Array.from(new Set(mappedItems.map((mi) => mi.vendor_id).filter(Boolean).map(String)));
    const validVendorIdSet = new Set<string>();

    if (vendorIdsInItems.length > 0) {
      // 1) vendor_profiles_with_user by id
      try {
        const { data: vpwById, error: vpwIdErr } = await supabase
          .from("vendor_profiles_with_user")
          .select("id, user_id")
          .in("id", vendorIdsInItems);

        if (!vpwIdErr && Array.isArray(vpwById)) {
          for (const r of vpwById) {
            const id = String((r as any).id);
            if (vendorIdsInItems.includes(id)) validVendorIdSet.add(id);
          }
        }
      } catch (err) {
        console.warn("Error checking vendor_profiles_with_user by id:", err);
      }

      // 2) vendor_profiles_with_user by user_id
      try {
        const { data: vpwByUser, error: vpwUserErr } = await supabase
          .from("vendor_profiles_with_user")
          .select("id, user_id")
          .in("user_id", vendorIdsInItems);

        if (!vpwUserErr && Array.isArray(vpwByUser)) {
          for (const r of vpwByUser) {
            const userId = String((r as any).user_id);
            if (vendorIdsInItems.includes(userId)) validVendorIdSet.add(userId);
          }
        }
      } catch (err) {
        console.warn("Error checking vendor_profiles_with_user by user_id:", err);
      }

      // 3) vendor_profiles table by id
      try {
        const { data: existing, error: existErr } = await supabase.from("vendor_profiles").select("id").in("id", vendorIdsInItems);
        if (!existErr && Array.isArray(existing)) {
          for (const r of existing) validVendorIdSet.add(String(r.id));
        }
      } catch (err) {
        console.warn("Error checking vendor_profiles:", err);
      }

      // 4) vendors table by id
      try {
        const { data: vendorRows, error: vendorErr } = await supabase.from("vendors").select("id").in("id", vendorIdsInItems);
        if (!vendorErr && Array.isArray(vendorRows)) {
          for (const r of vendorRows) validVendorIdSet.add(String(r.id));
        }
      } catch (err) {
        console.warn("Error checking vendors table:", err);
      }

      // 5) ADMIN_VENDOR_ID handling
      for (const v of vendorIdsInItems) {
        if (validVendorIdSet.has(v)) continue;
        if (v === ADMIN_VENDOR_ID) {
          const ok = await ensureVendorProfileExists(v);
          if (ok) validVendorIdSet.add(v);
        }
      }
    }

    // Remove invalid vendor_ids and vendor_name from items (and ensure vendor_name for valid ones)
    for (const mi of mappedItems) {
      if (mi.vendor_id && validVendorIdSet.has(String(mi.vendor_id))) {
        try {
          if (!mi.vendor_name) {
            const name = await fetchVendorName(String(mi.vendor_id));
            mi.vendor_name = name ?? null;
          }
        } catch {
          mi.vendor_name = mi.vendor_name ?? null;
        }
      } else {
        // clear invalid vendor info
        mi.vendor_id = null;
        mi.vendor = false;
        mi.vendor_name = null;
      }
    }

    // Determine order-level vendor_id and vendor_name
    let vendor_id: string | null = null;
    let vendor_name: string | null = null;

    if (role === "vendor") {
      vendor_id = user_id;
      try {
        vendor_name = await fetchVendorName(user_id);
      } catch {
        vendor_name = null;
      }
    } else {
      const remainingVendorIds = Array.from(new Set(mappedItems.map((mi) => mi.vendor_id).filter(Boolean).map(String)));
      if (remainingVendorIds.length === 1) {
        const candidate = remainingVendorIds[0];
        if (validVendorIdSet.has(candidate)) {
          vendor_id = candidate;
          try {
            vendor_name = await fetchVendorName(candidate);
          } catch {
            vendor_name = null;
          }
        } else {
          vendor_id = null;
          vendor_name = null;
        }
      } else {
        vendor_id = null;
        vendor_name = null;
      }
    }

    // Final safe items JSON
    const safeItemsJson = JSON.stringify(mappedItems);

    // Use lowercase status that matches check constraint (eg "processing")
    const safeStatus = "processing";

    // Attach idempotency_key into meta for server-side storage (so future lookups can use it)
    const metaWithServer: any = { ...(meta || {}), server_ts: new Date().toISOString() };
    if (ikToCheck) metaWithServer.idempotency_key = ikToCheck;
    else if (clientTs && !metaWithServer.idempotency_key) metaWithServer.client_ts = clientTs;

    // ensure top-level column is set so DB uniqueness/index will apply
    const baseInsertPayload: any = {
      user_id,
      vendor_id,
      vendor_name: vendor_name ?? null,
      name: name ?? null,
      email: email ?? null,
      shipping_address,
      status: safeStatus,
      total_amount,
      items: safeItemsJson,
      payment_status: payment_status ?? "unpaid",
      payment_method: payment_method ?? null,
      meta: metaWithServer,
    };

    if (ikToCheck) baseInsertPayload.idempotency_key = ikToCheck;
    else if (metaWithServer && metaWithServer.idempotency_key) baseInsertPayload.idempotency_key = metaWithServer.idempotency_key;

    // Before inserting: double-check idempotency one last time (race protection)
    if (ikToCheck) {
      try {
        let existingBeforeInsert: any = null;
        try {
          const { data, error } = await supabase
            .from("orders")
            .select("*")
            .eq("user_id", user_id)
            .eq("idempotency_key", ikToCheck)
            .maybeSingle();
          if (!error && data) existingBeforeInsert = data;
        } catch (innerErr) {
          // ignore
        }

        if (!existingBeforeInsert) {
          const { data: fallback, error: fallbackErr } = await supabase
            .from("orders")
            .select("*")
            .eq("user_id", user_id)
            .filter("meta->>idempotency_key", "eq", ikToCheck)
            .maybeSingle();
          if (!fallbackErr && fallback) existingBeforeInsert = fallback;
        }

        if (existingBeforeInsert) {
          // try reconciling before returning
          try {
            const reconciled = await reconcileOrderWithStripeIfAvailable(existingBeforeInsert);
            if (reconciled) {
              console.info("Idempotency (pre-insert): returning reconciled existing order", reconciled.id);
              return res.status(200).json({ order: reconciled, idempotent: true });
            }
          } catch {}
          console.info("Idempotency (pre-insert): found existing order, returning it", existingBeforeInsert.id);
          return res.status(200).json({ order: existingBeforeInsert, idempotent: true });
        }
      } catch (err) {
        console.warn("Idempotency pre-insert check failed (non-fatal):", err);
      }
    }

    // Insert (single insert) with robust handling for unique-violation on idempotency_key
    let inserted: any = null;
    try {
      const insertResp = await supabase.from("orders").insert([baseInsertPayload]).select().maybeSingle();
      inserted = insertResp.data ?? null;
      const insertErr = insertResp.error ?? null;

      if (insertErr) {
        // treat it below the same as a thrown error so the catch branch handles common race cases
        throw insertErr;
      }
    } catch (insertErr: any) {
      console.error("❌ POST /orders Supabase insert error:", insertErr);

      // Detect Postgres unique-violation (23505) or textual hint about idempotency_key
      const isUniqueViolation =
        insertErr?.code === "23505" ||
        String(insertErr?.message || "").toLowerCase().includes("idempotency_key") ||
        String(insertErr?.details || "").toLowerCase().includes("idempotency_key");

      // Determine which idempotency key to check (prefer ikToCheck, then payload.meta)
      const ikFromPayload = baseInsertPayload?.meta?.idempotency_key ?? null;
      const ikToLookup = ikToCheck ?? ikFromPayload ?? null;

      if (isUniqueViolation && ikToLookup) {
        try {
          console.info("Insert failed with unique-violation; attempting to find existing order by idempotency_key (scoped to user):", ikToLookup);
          let maybeExisting: any = null;
          try {
            const { data, error } = await supabase
              .from("orders")
              .select("*")
              .eq("user_id", user_id)
              .eq("idempotency_key", ikToLookup)
              .maybeSingle();
            if (!error && data) maybeExisting = data;
          } catch (innerErr) {
            // ignore
          }

          if (!maybeExisting) {
            try {
              const { data: fallback, error: fallbackErr } = await supabase
                .from("orders")
                .select("*")
                .filter("meta->>idempotency_key", "eq", ikToLookup)
                .maybeSingle();
              if (!fallbackErr && fallback) maybeExisting = fallback;
            } catch (fbErr) {
              console.warn("Global idempotency re-check failed:", fbErr);
            }
          }

          if (maybeExisting) {
            // try reconcile before returning
            try {
              const reconciled = await reconcileOrderWithStripeIfAvailable(maybeExisting);
              if (reconciled) {
                console.info("Idempotency: concurrent insert detected; returning reconciled existing order instead of error", reconciled.id);
                return res.status(200).json({ order: reconciled, idempotent: true });
              }
            } catch {}
            console.info("Idempotency: concurrent insert detected; returning existing order instead of error", maybeExisting.id);
            return res.status(200).json({ order: maybeExisting, idempotent: true });
          }

          console.info("Scoped idempotency lookup returned no result despite unique violation; will try heuristic fallback");
        } catch (recheckErr) {
          console.warn("Idempotency post-insert recheck failed (non-fatal):", recheckErr);
        }
      }

      // If the error was a unique-violation but we couldn't find the row by idempotency_key,
      // try a looser re-check by searching recent pending orders for same user + amount + items fingerprint.
      if (isUniqueViolation) {
        try {
          console.info("Unique violation but no idempotency match — attempting heuristic lookup (recent pending orders) as fallback");
          const fifteenMinutesAgo = new Date(Date.now() - 1000 * 60 * 15).toISOString();

          const { data: candidates, error: candErr } = await supabase
            .from("orders")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", fifteenMinutesAgo)
            .limit(10)
            .order("created_at", { ascending: false });

          if (!candErr && Array.isArray(candidates)) {
            // you can improve the fingerprint here; currently we just check total_amount and items length
            for (const c of candidates) {
              try {
                const cItems = typeof c.items === "string" ? JSON.parse(c.items) : c.items;
                const parsedReqItems = typeof safeItemsJson === "string" ? JSON.parse(safeItemsJson) : mappedItems;
                const sameAmount = Number(c.total_amount) === Number(total_amount);
                const sameCount = Array.isArray(cItems) && Array.isArray(parsedReqItems) && cItems.length === parsedReqItems.length;
                if (sameAmount && sameCount) {
                  // try reconcile with stripe before returning
                  try {
                    const reconciled = await reconcileOrderWithStripeIfAvailable(c);
                    if (reconciled) return res.status(200).json({ order: reconciled, idempotent: true, heuristic_matched: true });
                  } catch {}
                  console.info("Heuristic match found; returning candidate order id:", c.id);
                  return res.status(200).json({ order: c, idempotent: true, heuristic_matched: true });
                }
              } catch {
                // ignore parse/compare failures
              }
            }
          }
        } catch (heurErr) {
          console.warn("Heuristic re-check failed:", heurErr);
        }
      }

      // final fallback: return original error if we couldn't resolve a concurrent order
      return res.status(500).json({ error: insertErr.message || "Failed to insert order" });
    }

    // If we reach here, `inserted` is the successfully inserted row

    // If vendor_name still null but vendor_id exists, try best-effort update (so UI sees vendor_name)
    if (inserted && inserted.vendor_id && !inserted.vendor_name) {
      try {
        const fetchVendorNameCached = await createVendorNameFetcher();
        const vname = await fetchVendorNameCached(inserted.vendor_id);
        if (vname) {
          const { data: upd, error: updErr } = await supabase.from("orders").update({ vendor_name: vname }).eq("id", inserted.id).select().maybeSingle();
          if (!updErr && upd) {
            return res.status(201).json({ order: upd });
          }
        }
      } catch (err) {
        // ignore, fallthrough to return inserted row as-is
        console.warn("Best-effort vendor_name update failed:", err);
      }
    }

    return res.status(201).json({ order: inserted });
  } catch (err) {
    console.error("💥 POST /orders crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /orders/:id/status
 */
router.put("/:id/status", authMiddleware, async (req, res) => {
  const { id } = req.params;
  let { status, vendor_id: overrideVendorId } = req.body ?? {};
  const requesterId = req.user.id;
  const requesterRole = req.user.role;

  if (!status) return res.status(400).json({ error: "Status is required" });
  status = String(status).toLowerCase();

  try {
    const { data: orderRow, error: fetchErr } = await supabase.from("orders").select("id, vendor_id, user_id, status").eq("id", id).maybeSingle();
    if (fetchErr) {
      console.error("❌ Error fetching order for authorization:", fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }
    if (!orderRow) return res.status(404).json({ error: "Order not found" });

    const isAdmin = await isRequesterAdmin(requesterId, requesterRole);
    const isOwnerVendor = orderRow.vendor_id && String(orderRow.vendor_id) === String(requesterId);

    if (!isAdmin && !isOwnerVendor) {
      return res.status(403).json({ error: "Forbidden - only admins or the vendor who owns this order may update status" });
    }

    const updatePayload: any = { status, updated_by: requesterId, updated_by_role: requesterRole };

    if (isAdmin && overrideVendorId) {
      if (!isUuid(String(overrideVendorId))) {
        return res.status(400).json({ error: "Invalid vendor_id provided" });
      }
      if (String(overrideVendorId) === ADMIN_VENDOR_ID) {
        const ok = await ensureVendorProfileExists(overrideVendorId);
        if (!ok) {
          console.warn("Could not ensure admin vendor profile exists for", overrideVendorId);
        }
      }
      updatePayload.vendor_id = overrideVendorId;
      // optionally set vendor_name when admin reassigns vendor_id
      try {
        const fetchVendorNameCached = await createVendorNameFetcher();
        const vname = await fetchVendorNameCached(overrideVendorId);
        if (vname) updatePayload.vendor_name = vname;
      } catch {
        // ignore
      }
    }

    const { data: updated, error: updateErr } = await supabase.from("orders").update(updatePayload).eq("id", id).select().maybeSingle();
    if (updateErr) {
      console.error("❌ PUT /orders/:id/status Supabase update error:", updateErr);
      return res.status(500).json({ error: updateErr.message });
    }

    res.json({ order: updated });
  } catch (err: any) {
    console.error("💥 PUT /orders/:id/status crash:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/* GET /orders/status-summary */
router.get("/status-summary", async (req, res) => {
  try {
    const { data, error } = await supabase.from("order_status_summary").select("*");
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("💥 GET /orders/status-summary crash:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

/**
 * PATCH /orders/:id/delivered
 */
router.patch("/:id/delivered", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { email, delivery_token, require_token } = req.body ?? {};

  const requesterId = req.user?.id;
  const requesterRole = req.user?.role;

  try {
    const { data: orderRow, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status, email, delivery_token, vendor_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      console.error("❌ Error fetching order:", fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }

    if (!orderRow) return res.status(404).json({ error: "Order not found" });

    const isAdmin = await isRequesterAdmin(requesterId, requesterRole);
    const isOwnerVendor = orderRow.vendor_id && String(orderRow.vendor_id) === String(requesterId);

    if (!isAdmin && !isOwnerVendor) {
      return res.status(403).json({ error: "Forbidden - only admins or the vendor who owns this order may mark it delivered" });
    }

    const normalizedStatus = String(orderRow.status ?? "").toLowerCase();
    if (["delivered", "confirmed", "cancelled"].includes(normalizedStatus)) {
      return res.status(400).json({ error: `Order already ${normalizedStatus}, cannot mark delivered` });
    }

    if (email && !isAdmin) {
      if (String(orderRow.email ?? "").toLowerCase() !== String(email).toLowerCase()) {
        return res.status(403).json({ error: "Provided email does not match order" });
      }
    }

    if (orderRow.delivery_token) {
      if (!isAdmin || require_token) {
        if (!delivery_token || String(orderRow.delivery_token) !== String(delivery_token)) {
          return res.status(403).json({ error: "Invalid delivery token" });
        }
      }
    }

    const attemptedUpdates: any = { status: "delivered", updated_by: requesterId, updated_by_role: requesterRole };
    attemptedUpdates.delivered_at = new Date().toISOString();
    if (isAdmin) attemptedUpdates.delivered_by_admin = requesterId;

    try {
      const { data: updated, error: updateErr } = await supabase
        .from("orders")
        .update(attemptedUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (updateErr) {
        const msg = String(updateErr?.message || updateErr);
        if (updateErr?.code === "PGRST204" || msg.includes("Could not find the 'delivered_at' column")) {
          console.warn("Supabase schema cache missing 'delivered_at' column; retrying update without delivered_at");
          const { data: updated2, error: updateErr2 } = await supabase
            .from("orders")
            .update({ status: "delivered", updated_by: requesterId, updated_by_role: requesterRole })
            .eq("id", id)
            .select()
            .maybeSingle();

          if (updateErr2) {
            console.error("❌ PATCH /orders/:id/delivered retry update error:", updateErr2);
            return res.status(500).json({ error: updateErr2.message || "Failed to update order status" });
          }

          return res.json({ order: updated2 });
        }

        console.error("❌ PATCH /orders/:id/delivered update error:", updateErr);
        return res.status(500).json({ error: updateErr.message || "Failed to update order" });
      }

      return res.json({ order: updated });
    } catch (updateCatchErr) {
      console.error("❌ Unexpected error updating order delivered status:", updateCatchErr);
      return res.status(500).json({ error: "Failed to update order status" });
    }
  } catch (err) {
    console.error("💥 PATCH /orders/:id/delivered crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/* POST /orders/:id/confirm-delivery */
router.post("/:id/confirm-delivery", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { delivery_token } = req.body ?? {};
  const requesterId = req.user?.id;

  try {
    const { data: orderRow, error: fetchErr } = await supabase
      .from("orders")
      .select("id, status, email, delivery_token, vendor_id, user_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr) {
      console.error("❌ Error fetching order for confirm-delivery:", fetchErr);
      return res.status(500).json({ error: fetchErr.message });
    }

    if (!orderRow) return res.status(404).json({ error: "Order not found" });

    if (!orderRow.user_id || String(orderRow.user_id) !== String(requesterId)) {
      return res.status(403).json({ error: "Forbidden - only the purchasing user may confirm delivery" });
    }

    const normalizedStatus = String(orderRow.status ?? "").toLowerCase();
    const allowedKeywords = ["out for", "out_for", "transit", "shipped", "delivering", "out-for"];
    const isAllowedState = allowedKeywords.some((k) => normalizedStatus.includes(k));
    if (!isAllowedState) {
      return res.status(400).json({ error: `Order cannot be confirmed by customer at status: ${orderRow.status}` });
    }

    if (orderRow.delivery_token) {
      if (!delivery_token || String(orderRow.delivery_token) !== String(delivery_token)) {
        return res.status(403).json({ error: "Invalid or missing delivery token" });
      }
    }

    const attemptedUpdates: any = { status: "delivered" };
    attemptedUpdates.delivered_at = new Date().toISOString();

    try {
      const { data: updated, error: updateErr } = await supabase
        .from("orders")
        .update(attemptedUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (updateErr) {
        const msg = String(updateErr?.message || updateErr);
        if (updateErr?.code === "PGRST204" || msg.includes("Could not find the 'delivered_at' column")) {
          console.warn("Supabase schema cache missing 'delivered_at' column; retrying confirm-delivery without delivered_at");
          const { data: updated2, error: updateErr2 } = await supabase
            .from("orders")
            .update({ status: "delivered" })
            .eq("id", id)
            .select()
            .maybeSingle();

          if (updateErr2) {
            console.error("❌ POST /orders/:id/confirm-delivery retry update error:", updateErr2);
            return res.status(500).json({ error: updateErr2.message || "Failed to confirm delivery" });
          }

          return res.json({ order: updated2 });
        }

        console.error("❌ POST /orders/:id/confirm-delivery update error:", updateErr);
        return res.status(500).json({ error: updateErr.message || "Failed to confirm delivery" });
      }

      return res.json({ order: updated });
    } catch (updateCatchErr) {
      console.error("❌ Unexpected error confirming delivery:", updateCatchErr);
      return res.status(500).json({ error: "Failed to confirm delivery" });
    }
  } catch (err) {
    console.error("💥 POST /orders/:id/confirm-delivery crash:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
