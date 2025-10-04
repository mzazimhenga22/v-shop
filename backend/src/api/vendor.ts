// src/routes/vendor.ts
import express, { Request, Response } from "express";
import mergedProducts, { authMiddleware } from "./mergedProducts.js"; // make sure mergedProducts exports authMiddleware
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/**
 * Helpers & constants (kept small & consistent with mergedProducts)
 */
const VENDOR_TABLE_CANDIDATES = ["vendor", "vendors", "vendor_profiles", "vendor_profiles_with_user"];
const PRODUCT_TABLES_COMBINED = ["vendor_product", "products"];
const VENDOR_PRODUCT_BUCKET = "vendor-product-bucket";
const PRODUCTS_BUCKET = "products";
const VENDOR_PROFILES_TABLE = "vendor_profiles";

const stripQuotes = (s: any) => {
  if (s === null || s === undefined) return s;
  return String(s).replace(/^['"]+|['"]+$/g, "");
};

function extractStoragePathFromPublicUrl(url: string | null | undefined, bucket = PRODUCTS_BUCKET) {
  if (!url) return null;
  try {
    const marker1 = `/object/public/${bucket}/`;
    const idx = url.indexOf(marker1);
    if (idx !== -1) return decodeURIComponent(url.substring(idx + marker1.length));
    const marker2 = `/${bucket}/`;
    const idx2 = url.indexOf(marker2);
    if (idx2 !== -1) return decodeURIComponent(url.substring(idx2 + marker2.length));
    const parts = url.split(`${bucket}/`);
    return parts.length > 1 ? decodeURIComponent(parts.pop() || "") : null;
  } catch (err) {
    console.warn("extractStoragePathFromPublicUrl failed for", url, err);
    return null;
  }
}

/**
 * findProductsByVendorId: small version to match what mergedProducts used.
 * returns { products, tableResults }
 */
async function findProductsByVendorId(rawId: string, candidateTables = PRODUCT_TABLES_COMBINED as string[]) {
  const candidateColumns = [
    { column: "vendor_id", asNumber: true },
    { column: "vendor_id", asNumber: false },
    { column: "vendor", asNumber: false },
  ];

  const merged = new Map<string, any>();
  const tableResults: Array<{ table: string; rowsFound: number; triedColumns: string[] }> = [];

  for (const table of candidateTables) {
    let rowsFound = 0;
    const triedColumns: string[] = [];
    for (const cand of candidateColumns) {
      const value = cand.asNumber && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
      triedColumns.push(cand.column + (cand.asNumber ? " (num?)" : ""));
      try {
        const { data, error } = await supabase.from(table).select("*").eq(cand.column, value);
        if (error) {
          console.warn(`Query error for ${table}.${cand.column}=${String(value)}:`, String(error));
          continue;
        }
        if (Array.isArray(data) && data.length > 0) {
          rowsFound += data.length;
          for (const r of data) merged.set(String(r.id ?? `${table}-${Math.random()}`), r);
        }
      } catch (err) {
        console.warn(`Unexpected error querying ${table}.${cand.column}:`, err);
      }
    }
    tableResults.push({ table, rowsFound, triedColumns });
    if (rowsFound > 0) break; // prioritize first table that returns rows
  }

  const products = Array.from(merged.values()).sort((a: any, b: any) => {
    const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return { products, tableResults };
}

/**
 * findVendorTableContainingId - tries candidate vendor tables
 */
async function findVendorTableContainingId(rawId: string) {
  for (const tbl of VENDOR_TABLE_CANDIDATES) {
    try {
      const { data, error } = await supabase.from(tbl).select("id").eq("id", rawId).maybeSingle();
      if (!error && data) return { table: tbl, row: data };
    } catch (err) {
      console.warn(`Error checking vendor table ${tbl}:`, err);
    }
  }
  return { table: null, row: null };
}

/**
 * DELETE /api/vendors/:id
 * - deletes vendor row(s), their products, and associated storage files (both buckets)
 * - only allowed for admins (authMiddleware ensures user on req)
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawId = String(req.params.id || "");
    if (!rawId) return res.status(400).json({ error: "Missing vendor id" });

    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // restrict to admins
    const isAdmin = Boolean(user.user_metadata?.is_admin || user.user_metadata?.isAdmin);
    if (!isAdmin) return res.status(403).json({ error: "Only admins may delete vendors" });

    const vendorKey = stripQuotes(rawId);

    // find vendor row location (optional)
    const vendorLookup = await findVendorTableContainingId(vendorKey);

    // 1) find products belonging to vendor
    const { products: productRows, tableResults } = await findProductsByVendorId(vendorKey, PRODUCT_TABLES_COMBINED);

    const productIds = Array.isArray(productRows) ? productRows.map((p: any) => String(p.id)) : [];

    // 2) collect storage paths from both buckets and remove
    const removedFiles: Record<string, string[]> = { vendor_bucket: [], products_bucket: [] };
    try {
      const vendorBucketPaths = new Set<string>();
      const productsBucketPaths = new Set<string>();

      for (const p of productRows) {
        const mainV = extractStoragePathFromPublicUrl(p.image, VENDOR_PRODUCT_BUCKET);
        const mainP = extractStoragePathFromPublicUrl(p.image, PRODUCTS_BUCKET);

        if (mainV) vendorBucketPaths.add(mainV);
        if (mainP) productsBucketPaths.add(mainP);

        const thumbs = Array.isArray(p.thumbnails)
          ? p.thumbnails
          : typeof p.thumbnails === "string" && p.thumbnails
          ? [p.thumbnails]
          : [];

        for (const t of thumbs) {
          const tv = extractStoragePathFromPublicUrl(t, VENDOR_PRODUCT_BUCKET);
          const tp = extractStoragePathFromPublicUrl(t, PRODUCTS_BUCKET);
          if (tv) vendorBucketPaths.add(tv);
          if (tp) productsBucketPaths.add(tp);
        }
      }

      const vbPaths = Array.from(vendorBucketPaths).filter(Boolean);
      const pbPaths = Array.from(productsBucketPaths).filter(Boolean);

      if (vbPaths.length > 0) {
        try {
          const { error: rmErr } = await supabase.storage.from(VENDOR_PRODUCT_BUCKET).remove(vbPaths);
          if (!rmErr) removedFiles.vendor_bucket.push(...vbPaths);
          else console.warn("Failed to remove some vendor bucket files:", rmErr);
        } catch (err) {
          console.warn("Error removing vendor bucket files:", err);
        }
      }

      if (pbPaths.length > 0) {
        try {
          const { error: rmErr } = await supabase.storage.from(PRODUCTS_BUCKET).remove(pbPaths);
          if (!rmErr) removedFiles.products_bucket.push(...pbPaths);
          else console.warn("Failed to remove some products bucket files:", rmErr);
        } catch (err) {
          console.warn("Error removing products bucket files:", err);
        }
      }
    } catch (err) {
      console.warn("Error while removing product files for vendor deletion:", err);
    }

    // 3) delete product rows by id across both product tables
    const deletedProductsSummary: Record<string, any> = { vendor_product_deleted: 0, products_deleted: 0 };
    try {
      if (productIds.length > 0) {
        try {
          const { error: errVP } = await supabase.from("vendor_product").delete().in("id", productIds) as any;
          if (!errVP) deletedProductsSummary.vendor_product_deleted = productIds.length;
          else console.warn("vendor_product delete error:", errVP);
        } catch (err) {
          console.warn("Error deleting from vendor_product:", err);
        }

        try {
          const { error: errP } = await supabase.from("products").delete().in("id", productIds) as any;
          if (!errP) deletedProductsSummary.products_deleted = productIds.length;
          else console.warn("products delete error:", errP);
        } catch (err) {
          console.warn("Error deleting from products:", err);
        }
      }
    } catch (err) {
      console.warn("Error deleting products for vendor:", err);
    }

    // 4) delete vendor row(s) from candidate vendor tables (try both id and user_id)
    const deletedVendors: string[] = [];
    for (const tbl of VENDOR_TABLE_CANDIDATES) {
      try {
        const { error: delErrById, data: dataById } = await supabase.from(tbl).delete().eq("id", vendorKey).select();
        if (!delErrById && Array.isArray(dataById) && dataById.length > 0) deletedVendors.push(`${tbl}:id`);
      } catch (err) {
        console.warn(`Delete by id on ${tbl} failed (ignored):`, err);
      }
      try {
        const { error: delErrByUser, data: dataByUser } = await supabase.from(tbl).delete().eq("user_id", vendorKey).select();
        if (!delErrByUser && Array.isArray(dataByUser) && dataByUser.length > 0) deletedVendors.push(`${tbl}:user_id`);
      } catch (err) {
        console.warn(`Delete by user_id on ${tbl} failed (ignored):`, err);
      }
    }

    // 5) delete vendor_profiles entry if present
    try {
      const { error: vpErr, data: vpData } = await supabase.from(VENDOR_PROFILES_TABLE).delete().eq("id", vendorKey).select();
      if (!vpErr && Array.isArray(vpData) && vpData.length > 0) deletedVendors.push(`${VENDOR_PROFILES_TABLE}:id`);
      const { error: vpErr2, data: vpData2 } = await supabase.from(VENDOR_PROFILES_TABLE).delete().eq("user_id", vendorKey).select();
      if (!vpErr2 && Array.isArray(vpData2) && vpData2.length > 0) deletedVendors.push(`${VENDOR_PROFILES_TABLE}:user_id`);
    } catch (err) {
      console.warn("Error deleting vendor_profiles entry (ignored):", err);
    }

    return res.status(200).json({
      ok: true,
      vendorCheckedIn: vendorLookup.table,
      tableResults,
      deletedVendorRows: deletedVendors,
      deletedProductsSummary,
      removedFiles,
      productCount: productIds.length,
    });
  } catch (err: any) {
    console.error("Error in DELETE /vendors/:id:", err);
    return res.status(500).json({ error: err?.message || "Server error", details: err });
  }
});

/**
 * PATCH /api/vendors/:id/demote
 * - Admins may demote; a vendor may demote themselves (self-service)
 * - We attempt to update candidate vendor tables, ignoring missing columns
 */
router.patch("/:id/demote", authMiddleware, async (req: Request, res: Response) => {
  try {
    const rawId = String(req.params.id || "");
    if (!rawId) return res.status(400).json({ error: "Missing vendor id" });

    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const vendorKey = stripQuotes(rawId);
    const isAdmin = Boolean(user.user_metadata?.is_admin || user.user_metadata?.isAdmin);
    const isSelf = String(user.id) === vendorKey;

    if (!isAdmin && !isSelf) return res.status(403).json({ error: "Only admins or the vendor themselves may demote the vendor" });

    const updatePayload: any = { demoted_at: new Date().toISOString() };
    const candidateUpdates = {
      vendor_name: null,
      is_vendor: false,
      vendor_active: false,
      isVendor: false,
      vendor_status: "demoted",
      demoted_at: updatePayload.demoted_at,
    };

    const updatedTables: string[] = [];
    for (const tbl of VENDOR_TABLE_CANDIDATES) {
      try {
        const { error: upErr, data: upData } = await supabase.from(tbl).update(candidateUpdates).eq("id", vendorKey).select();
        if (!upErr && Array.isArray(upData) && upData.length > 0) {
          updatedTables.push(`${tbl}:id`);
        }
      } catch (err) {
        console.warn(`Update vendor demote failed on ${tbl} by id (ignored):`, err);
      }
      try {
        const { error: upErr2, data: upData2 } = await supabase.from(tbl).update(candidateUpdates).eq("user_id", vendorKey).select();
        if (!upErr2 && Array.isArray(upData2) && upData2.length > 0) {
          updatedTables.push(`${tbl}:user_id`);
        }
      } catch (err) {
        console.warn(`Update vendor demote failed on ${tbl} by user_id (ignored):`, err);
      }
    }

    // Also try the vendor_profiles table specifically
    try {
      const vpUpdates: any = { demoted_at: updatePayload.demoted_at, is_vendor: false };
      const { error: vpErr, data: vpData } = await supabase.from(VENDOR_PROFILES_TABLE).update(vpUpdates).eq("id", vendorKey).select();
      if (!vpErr && Array.isArray(vpData) && vpData.length > 0) updatedTables.push(`${VENDOR_PROFILES_TABLE}:id`);
      const { error: vpErr2, data: vpData2 } = await supabase.from(VENDOR_PROFILES_TABLE).update(vpUpdates).eq("user_id", vendorKey).select();
      if (!vpErr2 && Array.isArray(vpData2) && vpData2.length > 0) updatedTables.push(`${VENDOR_PROFILES_TABLE}:user_id`);
    } catch (err) {
      console.warn("vendor_profiles demote attempt failed (ignored):", err);
    }

    return res.status(200).json({ ok: true, demoted: true, updatedTables });
  } catch (err: any) {
    console.error("Error in PATCH /vendors/:id/demote:", err);
    return res.status(500).json({ error: err?.message || "Server error", details: err });
  }
});

/**
 * Forward to mergedProducts WITHOUT rewriting req.url.
 * mergedProducts already registers both the public plural routes and protected vendor routes.
 */
router.use(mergedProducts);

export default router;
