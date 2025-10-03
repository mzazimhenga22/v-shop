// src/routes/mergedProducts.ts
import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";
import { supabase } from "../supabaseClient.js";// adjust path if needed

// extend Request to carry user from auth middleware
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Allow large JSON payloads where needed
router.use(express.json({ limit: "50mb" }));

// -----------------------------
// Config / constants
// -----------------------------
const VENDOR_TABLE_CANDIDATES = ["vendor", "vendors", "vendor_profiles", "vendor_profiles_with_user"];
const PRODUCT_TABLES_VENDOR = ["vendor_product", "products"];
const PRODUCT_TABLES_ADMIN = ["products", "vendor_product"];
const PRODUCT_TABLES_COMBINED = Array.from(new Set([...PRODUCT_TABLES_VENDOR, ...PRODUCT_TABLES_ADMIN]));
const VENDOR_PROFILES_TABLE = "vendor_profiles";

const VENDOR_PRODUCT_BUCKET = "vendor-product-bucket";
const PRODUCTS_BUCKET = "products";

// -----------------------------
// Helpers
// -----------------------------
const stripQuotes = (s: any) => {
  if (s === null || s === undefined) return s;
  return String(s).replace(/^['"]+|['"]+$/g, "");
};

function tryParseNumber(v: any): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parsePaymentMethods(raw: any): string[] {
  if (raw === undefined || raw === null) return [];
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === "object") return Object.values(raw).map((v) => String(v).trim()).filter(Boolean);
  try {
    const str = String(raw).trim();
    if (!str) return [];
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
      if (typeof parsed === "string") return parsed.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {}
    return str.split(",").map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizePaymentMethodsForResponse(raw: any): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "object") return Object.values(raw).map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

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
 * Parse a sale percent from various possible fields:
 * - numeric string like "30" => 30
 * - with percent "30%" => 30
 * - field may be in sale_percent, sale, discount, etc.
 * returns null if not parseable or out of range [0,100]
 */
function parseSalePercent(raw: any): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const pctMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (!pctMatch) return null;
  const val = Number(pctMatch[1]);
  if (!Number.isFinite(val) || val < 0 || val > 100) return null;
  // normalize to max 2 decimals
  return Math.round(val * 100) / 100;
}

/**
 * Given an original price and optional salePercent (0-100) and an optional discountedPrice fallback,
 * compute final price rounded to 2 decimals.
 */
function computeFinalPrice(originalPrice: number, salePercent: number | null, discountedPriceFallback?: number | undefined) {
  const base = Number.isFinite(originalPrice) ? originalPrice : 0;
  if (salePercent !== null) {
    const final = Math.round((base * (1 - salePercent / 100)) * 100) / 100;
    return final >= 0 ? final : 0;
  }
  if (discountedPriceFallback !== undefined) {
    return Math.round(Number(discountedPriceFallback) * 100) / 100;
  }
  return Math.round(base * 100) / 100;
}

// find vendor table row by id (tries candidates)
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

// try to find product across a list of candidate tables
async function findProductAcrossTables(id: string, candidateTables = PRODUCT_TABLES_COMBINED) {
  for (const tbl of candidateTables) {
    try {
      const { data, error } = await supabase.from(tbl).select("*").eq("id", id);
      if (error) {
        console.warn(`Error querying ${tbl} for id=${id}:`, (error as any).message ?? error);
        continue;
      }
      if (Array.isArray(data) && data.length > 0) return { product: data[0], table: tbl };
    } catch (err) {
      console.warn(`Unexpected error querying ${tbl} for id=${id}:`, err);
    }
  }
  return { product: null, table: null };
}

/**
 * Find products belonging to vendor id across candidate product tables.
 * returns { products, tableResults }
 */
async function findProductsByVendorId(rawId: string, candidateTables = PRODUCT_TABLES_VENDOR) {
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

// Ensure vendor profile exists (to avoid FK errors)
async function ensureVendorProfileExists(userId: string) {
  try {
    const payload = { id: userId, created_at: new Date().toISOString() } as any;
    const { data, error } = await supabase.from(VENDOR_PROFILES_TABLE).upsert(payload).select();
    if (error) {
      console.warn("Failed to upsert vendor_profile:", error);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn("Unexpected error upserting vendor_profile:", err);
    return false;
  }
}

// Try resolve a vendor key (string) to a numeric vendor_id by searching common vendor tables.
// Returns numeric vendor_id or null.
async function resolveVendorKeyToNumericId(vendorKey: string): Promise<number | null> {
  if (!vendorKey) return null;
  for (const tbl of VENDOR_TABLE_CANDIDATES) {
    try {
      const { data: byId, error: idErr } = await supabase.from(tbl).select("*").eq("id", vendorKey).limit(1).maybeSingle();
      const candidate = !idErr && byId ? byId : null;
      let candidate2 = null;
      if (!candidate) {
        const { data: byUser, error: userErr } = await supabase.from(tbl).select("*").eq("user_id", vendorKey).limit(1).maybeSingle();
        candidate2 = !userErr && byUser ? byUser : null;
      }
      const vrow = candidate || candidate2;
      if (vrow) {
        if (vrow.vendor_id !== undefined && /^\d+$/.test(String(vrow.vendor_id))) return Number(vrow.vendor_id);
        if (vrow.id !== undefined && /^\d+$/.test(String(vrow.id))) return Number(vrow.id);
      }
    } catch (err) {
      console.warn(`Error resolving vendor key on ${tbl}:`, err);
      continue;
    }
  }
  return null;
}

// -----------------------------
// Auth middleware (deduplicated: single exported declaration appears below)
// -----------------------------

export const authMiddleware = async (req: Request & { user?: any }, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization as string | undefined;
    const token = authHeader?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    const { data, error } = await supabase.auth.getUser(token);
    const user = (data as any)?.user;
    if (error || !user) return res.status(401).json({ error: "Invalid or expired token" });

    req.user = user;
    next();
  } catch (err: any) {
    console.error("Auth middleware error:", err);
    return res.status(500).json({ error: "Auth middleware failed", details: err });
  }
};
// -----------------------------
// VENDOR: GET /vendor/products (auth-protected)
// -----------------------------
router.get("/vendor/products", authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const rawId = stripQuotes(user.id);
    const { products, tableResults } = await findProductsByVendorId(rawId);

    if (!products || products.length === 0) {
      return res.status(200).json({
        products: [],
        debug: {
          message: `No products found in any of: ${PRODUCT_TABLES_VENDOR.join(", ")}`,
          tableResults,
        },
      });
    }

    const normalized = products.map((row: any) => ({ ...row, payment_methods: normalizePaymentMethodsForResponse(row.payment_methods) }));
    return res.status(200).json({ products: normalized, debug: { tableResults } });
  } catch (err: any) {
    console.error("Error in GET /vendor/products:", err);
    return res.status(500).json({ error: err?.message || "Unknown server error" });
  }
});

// -----------------------------
// VENDOR: POST /vendor/products (create)
// -----------------------------
router.post(
  "/vendor/products",
  authMiddleware,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnails", maxCount: 5 },
  ]),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const body = req.body || {};
      const {
        name,
        price,
        rating,
        // discount kept for backward compat but percent preferred via sale_percent or sale
        discount,
        hot,
        new: isNew,
        lowStock,
        category,
        stock,
        description,
        specifications,
        shippingInfo,
        returnInfo,
        faqs,
        variants,
        title,
        highlight,
      } = body;

      const payment_methods = parsePaymentMethods(body.payment_methods ?? body["payment_methods[]"] ?? body.paymentMethods);

      const files = req.files as {
        image?: Express.Multer.File[];
        thumbnails?: Express.Multer.File[];
      };

      if (!name || price === undefined || rating === undefined || stock === undefined) {
        return res.status(400).json({ error: "Missing required fields: name, price, rating, stock" });
      }

      // Upload main image
      let imageUrl: string | null = null;
      if (files?.image?.[0]) {
        const mainImage = files.image[0];
        const ext = mainImage.originalname.split(".").pop() || "jpg";
        const mainFileName = `products/${uuid()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(VENDOR_PRODUCT_BUCKET).upload(mainFileName, mainImage.buffer, {
          contentType: mainImage.mimetype,
        });
        if (uploadError) {
          console.error("Upload error:", uploadError);
          return res.status(500).json({ error: "Failed to upload main image", details: uploadError });
        }
        const { data } = supabase.storage.from(VENDOR_PRODUCT_BUCKET).getPublicUrl(mainFileName);
        imageUrl = data?.publicUrl ?? null;
      }

      // Upload thumbnails
      const thumbnailUrls: string[] = [];
      if (files?.thumbnails) {
        for (const thumb of files.thumbnails) {
          const ext = thumb.originalname.split(".").pop() || "jpg";
          const thumbFileName = `thumbnails/${uuid()}.${ext}`;
          const { error: thumbErr } = await supabase.storage.from(VENDOR_PRODUCT_BUCKET).upload(thumbFileName, thumb.buffer, {
            contentType: thumb.mimetype,
          });
          if (!thumbErr) {
            const { data } = supabase.storage.from(VENDOR_PRODUCT_BUCKET).getPublicUrl(thumbFileName);
            const url = data?.publicUrl ?? null;
            if (url) thumbnailUrls.push(url);
          } else {
            console.warn("Thumbnail upload error (skipping):", thumbErr);
          }
        }
      }

      // compute pricing using percentage
      const parsedOriginalPrice = isNaN(Number(price)) ? 0 : parseFloat(price);
      // priority: sale_percent field, then sale string, then fallback to discounted price / discount field
      const salePercentCandidate = body.sale_percent ?? body.sale ?? body.discount ?? body.discounted_price ?? body.discountedPrice ?? null;
      const salePercent = parseSalePercent(salePercentCandidate);
      const discountedFallback = tryParseNumber(body.discounted_price ?? body.discountedPrice ?? body.discount);
      const computedPrice = computeFinalPrice(parsedOriginalPrice, salePercent, discountedFallback);

      const sanitizedUserId = stripQuotes(user.id);
      const payload: any = {
        name,
        price: computedPrice,
        original_price: parsedOriginalPrice,
        rating: isNaN(Number(rating)) ? 0 : parseFloat(rating),
        image: imageUrl,
        thumbnails: thumbnailUrls.length ? thumbnailUrls : null,
        sale_percent: salePercent !== null ? salePercent : null,
        sale: (() => {
          const s = body.sale ?? null;
          if (s === null || s === undefined) return null;
          const str = String(s).trim();
          if (!str) return null;
          if (/%$/.test(str)) return null;
          if (str === "true") return true;
          if (str === "false") return false;
          return str;
        })(),
        hot: hot === "true" || hot === true,
        new: isNew === "true" || isNew === true,
        lowstock: lowStock === "true" || lowStock === true,
        category: category || null,
        stock: !isNaN(Number(stock)) ? parseInt(stock, 10) : 0,
        description: description || null,
        specifications: specifications || null,
        shipping_info: shippingInfo || null,
        return_info: returnInfo || null,
        faqs: faqs ?? null,
        variants: variants ?? null,
        title: title ?? null,
        highlight: highlight ?? null,
      };

      if (/^\d+$/.test(sanitizedUserId)) payload.vendor_id = Number(sanitizedUserId);
      else payload.vendor = sanitizedUserId;

      if (payment_methods !== undefined) payload.payment_methods = payment_methods;

      await ensureVendorProfileExists(sanitizedUserId);

      let insertResult: { table: string; data: any } | null = null;
      let lastError: any = null;

      // helper to safely remove a key in both camelCase and snake_case forms
      const removeKeyVariants = (obj: any, key: string) => {
        if (!obj || typeof obj !== "object") return;
        if (key in obj) delete obj[key];
        const snake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (snake !== key && snake in obj) delete obj[snake];
        const camel = key.replace(/_([a-z])/g, (_, g) => g.toUpperCase());
        if (camel !== key && camel in obj) delete obj[camel];
      };

      // Attempt insert with adaptive retry: handle FK failure once, and drop unknown columns reported by PG
      for (const tbl of PRODUCT_TABLES_VENDOR) {
        let attemptPayload = { ...payload };
        let attemptedFkRetry = false;

        if (tbl === "products") {
          const hasVendorId =
            "vendor_id" in attemptPayload &&
            attemptPayload.vendor_id !== undefined &&
            attemptPayload.vendor_id !== null &&
            String(attemptPayload.vendor_id).trim() !== "";

          if (!hasVendorId && attemptPayload.vendor) {
            try {
              const resolved = await resolveVendorKeyToNumericId(String(attemptPayload.vendor));
              if (resolved !== null) {
                attemptPayload.vendor_id = resolved;
                delete attemptPayload.vendor;
              }
            } catch (err) {
              console.warn("Failed to resolve vendor key before inserting into products:", err);
            }
          }

          const stillMissingVendorId =
            !("vendor_id" in attemptPayload) ||
            attemptPayload.vendor_id === undefined ||
            attemptPayload.vendor_id === null ||
            String(attemptPayload.vendor_id).trim() === "";

          if (stillMissingVendorId) {
            continue;
          }
        }

        for (let attempt = 0; attempt < 6; attempt++) {
          try {
            const { data, error } = await supabase.from(tbl).insert([attemptPayload]).select();
            if (error) {
              lastError = error;
              const message = String((error as any).message || (error as any).details || "").toLowerCase();

              if (!attemptedFkRetry && (message.includes("23503") || message.includes("foreign key") || message.includes("null value in column \"vendor_id\"") || message.includes("23502"))) {
                attemptedFkRetry = true;
                await ensureVendorProfileExists(sanitizedUserId);
                continue;
              }

              const unknownColMatch = String(error.message || error).match(/column "([^"]+)" does not exist/i);
              if (unknownColMatch && unknownColMatch[1]) {
                const col = unknownColMatch[1];
                removeKeyVariants(attemptPayload, col);
                continue;
              }

              const detailMatch = String((error as any).details || "").match(/column "([^"]+)" does not exist/i);
              if (detailMatch && detailMatch[1]) {
                removeKeyVariants(attemptPayload, detailMatch[1]);
                continue;
              }

              console.warn(`Insert into ${tbl} returned error (not retriable):`, error);
              break;
            }

            insertResult = { table: tbl, data };
            break;
          } catch (err: any) {
            lastError = err;
            const errMsg = String(err && ((err as any).message || err)).toLowerCase();
            const unknownMatch = String(err && ((err as any).message || "")).match(/column "([^"]+)" does not exist/i);
            if (unknownMatch && unknownMatch[1]) {
              removeKeyVariants(attemptPayload, unknownMatch[1]);
              continue;
            }
            console.warn(`Unexpected insert error into ${tbl}:`, err);
            break;
          }
        }

        if (insertResult) break;
      }

      if (!insertResult) {
        console.error("Failed to insert into any vendor/product table. Last error:", lastError);
        return res.status(500).json({
          error: "Failed to insert product into any known product table",
          tried: PRODUCT_TABLES_VENDOR,
          lastError: (lastError && (lastError.message || lastError)) || String(lastError),
        });
      }

      const created = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data;
      if (created) created.payment_methods = normalizePaymentMethodsForResponse(created.payment_methods);

      return res.status(201).json({ product: created, insertedInto: insertResult.table });
    } catch (err: any) {
      console.error("Error creating vendor product:", err);
      return res.status(500).json({ error: err?.message || "Unknown server error", details: err });
    }
  }
);

// -----------------------------
// VENDOR: PUT /vendor/products/:id (update) - ownership enforced
// -----------------------------
router.put(
  "/vendor/products/:id",
  authMiddleware,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnails", maxCount: 5 },
  ]),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body || {};
      const { name, price, rating, discount, hot, new: isNew, lowStock, category, stock, description, specifications, shippingInfo, returnInfo, faqs, variants, title, highlight } = body;

      const payment_methods = parsePaymentMethods(body.payment_methods ?? body["payment_methods[]"] ?? body.paymentMethods);
      const files = req.files as { image?: Express.Multer.File[]; thumbnails?: Express.Multer.File[] };

      const { product: existingProduct, table: productTable } = await findProductAcrossTables(id, PRODUCT_TABLES_VENDOR);
      if (!existingProduct || !productTable) return res.status(404).json({ error: "Product not found" });

      const user = req.user;
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const sanitizedUserId = stripQuotes(user.id);
      const ownerMatches = String(existingProduct.vendor_id) === String(sanitizedUserId) || String(existingProduct.vendor) === String(sanitizedUserId);
      if (!ownerMatches) return res.status(403).json({ error: "You do not have permission to update this product" });

      // Upload main image if provided
      let imageUrl: string | null = existingProduct.image;
      if (files?.image?.[0]) {
        const mainImage = files.image[0];
        const ext = mainImage.originalname.split(".").pop() || "jpg";
        const mainFileName = `products/${uuid()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from(VENDOR_PRODUCT_BUCKET).upload(mainFileName, mainImage.buffer, {
          contentType: mainImage.mimetype,
        });
        if (uploadError) {
          console.error("Upload error:", uploadError);
          return res.status(500).json({ error: "Failed to upload main image", details: uploadError });
        }
        const { data } = supabase.storage.from(VENDOR_PRODUCT_BUCKET).getPublicUrl(mainFileName);
        imageUrl = data?.publicUrl ?? imageUrl;
      }

      // Thumbnails
      let thumbnailUrls: string[] = Array.isArray(existingProduct.thumbnails) ? existingProduct.thumbnails : [];
      if (files?.thumbnails) {
        thumbnailUrls = [];
        for (const thumb of files.thumbnails) {
          const ext = thumb.originalname.split(".").pop() || "jpg";
          const thumbFileName = `thumbnails/${uuid()}.${ext}`;
          const { error: thumbErr } = await supabase.storage.from(VENDOR_PRODUCT_BUCKET).upload(thumbFileName, thumb.buffer, {
            contentType: thumb.mimetype,
          });
          if (!thumbErr) {
            const { data } = supabase.storage.from(VENDOR_PRODUCT_BUCKET).getPublicUrl(thumbFileName);
            const url = data?.publicUrl ?? null;
            if (url) thumbnailUrls.push(url);
          } else {
            console.warn("Thumbnail upload error (skipping):", thumbErr);
          }
        }
      }

      // Build updates
      const updates: any = {
        name: name ?? existingProduct.name,
        rating: rating !== undefined ? parseFloat(rating) : existingProduct.rating,
        image: imageUrl,
        thumbnails: thumbnailUrls,
        sale: undefined, // will set below if provided
        hot: hot !== undefined ? hot === "true" || hot === true : existingProduct.hot,
        new: isNew !== undefined ? isNew === "true" || isNew === true : existingProduct.new,
        lowStock: lowStock !== undefined ? lowStock === "true" || lowStock === true : existingProduct.lowStock,
        category: category ?? existingProduct.category,
        stock: stock !== undefined && stock !== "" ? parseInt(stock) : existingProduct.stock,
        description: description ?? existingProduct.description,
        specifications: specifications ?? existingProduct.specifications,
        shippingInfo: shippingInfo ?? existingProduct.shippingInfo,
        returnInfo: returnInfo ?? existingProduct.returnInfo,
        faqs: faqs ?? existingProduct.faqs,
        variants: variants ?? existingProduct.variants,
        title: title ?? existingProduct.title,
        highlight: highlight ?? existingProduct.highlight,
      };

      // payment methods
      if (payment_methods !== undefined) updates.payment_methods = payment_methods;

      // Pricing
      const baseOriginalCandidate = tryParseNumber(body.original_price ?? body.originalPrice) ?? tryParseNumber(existingProduct.original_price) ?? tryParseNumber(existingProduct.price) ?? 0;
      const salePctCandidate = body.sale_percent ?? body.sale ?? body.discount ?? body.discounted_price ?? body.discountedPrice ?? null;
      const salePct = parseSalePercent(salePctCandidate);
      const discountedFallback = tryParseNumber(body.discounted_price ?? body.discountedPrice ?? body.discount) ?? undefined;

      if (salePct !== null) {
        updates.price = computeFinalPrice(baseOriginalCandidate, salePct, discountedFallback);
        updates.original_price = baseOriginalCandidate;
        updates.sale = `${salePct}%`;
      } else if (body.price !== undefined) {
        updates.price = body.price ? parseFloat(body.price) : 0;
        if (body.original_price !== undefined || body.originalPrice !== undefined) {
          updates.original_price = Number(body.original_price ?? body.originalPrice);
        }
        updates.sale = body.sale !== undefined ? (body.sale || null) : existingProduct.sale;
      }

      if (salePct === null && body.sale !== undefined) {
        updates.sale = body.sale || null;
      }

      const cleanedUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));

      const { data: updatedRows, error } = await supabase.from(productTable).update(cleanedUpdates).eq("id", id).select();
      if (error) {
        console.error("Update error:", error);
        return res.status(500).json({ error: "Failed to update product", details: error });
      }

      const updated = Array.isArray(updatedRows) && updatedRows.length > 0 ? updatedRows[0] : null;
      if (updated) updated.payment_methods = normalizePaymentMethodsForResponse(updated.payment_methods);

      res.status(200).json({ product: updated, updatedIn: productTable });
    } catch (err: any) {
      console.error("Error updating vendor product:", err);
      res.status(500).json({ error: err?.message || "Unknown server error", details: err });
    }
  }
);

// -----------------------------
// VENDOR: POST /vendor/profiles (create/update profile with photo/banner)
// -----------------------------
router.post(
  "/vendor/profiles",
  authMiddleware,
  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const files = (req.files as { photo?: Express.Multer.File[]; banner?: Express.Multer.File[] }) || {};
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      let photoUrl: string | undefined;
      let bannerUrl: string | undefined;

      if (files.photo?.[0]) {
        const file = files.photo[0];
        const ext = file.originalname.split(".").pop() || "jpg";
        const fileName = `profiles/${user.id}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("vendor-profiles-bucket").upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });
        if (uploadError) {
          console.error("Photo upload error:", uploadError);
          return res.status(500).json({ error: "Failed to upload profile photo", details: uploadError });
        }
        const { data } = supabase.storage.from("vendor-profiles-bucket").getPublicUrl(fileName);
        photoUrl = data?.publicUrl ?? undefined;
      }

      if (files.banner?.[0]) {
        const file = files.banner[0];
        const ext = file.originalname.split(".").pop() || "jpg";
        const fileName = `banners/${user.id}.${ext}`;
        const { error: bannerUploadError } = await supabase.storage.from("vendor-profiles-bucket").upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: true,
        });
        if (bannerUploadError) {
          console.error("Banner upload error:", bannerUploadError);
          return res.status(500).json({ error: "Failed to upload banner", details: bannerUploadError });
        }
        const { data } = supabase.storage.from("vendor-profiles-bucket").getPublicUrl(fileName);
        bannerUrl = data?.publicUrl ?? undefined;
      }

      const upsertPayload: any = { id: user.id, updated_at: new Date().toISOString() };
      if (photoUrl) upsertPayload.photo_url = photoUrl;
      if (bannerUrl) upsertPayload.banner_url = bannerUrl;

      const { data: profileData, error } = await supabase.from(VENDOR_PROFILES_TABLE).upsert(upsertPayload).select();
      if (error) {
        console.error("Upsert error:", error);
        return res.status(500).json({ error: "Failed to create/update profile", details: error });
      }
      if (!profileData || profileData.length === 0) return res.status(500).json({ error: "No profile data created" });

      res.status(201).json({ profile: profileData[0] });
    } catch (err: any) {
      console.error("Error creating/updating profile:", err);
      res.status(500).json({ error: err.message || "Unknown server error", details: err });
    }
  }
);

// -----------------------------
// VENDOR: DELETE /vendor/products/:id
// -----------------------------
router.delete("/vendor/products/:id", authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { product: existingProduct, table: productTable } = await findProductAcrossTables(id, PRODUCT_TABLES_VENDOR);
    if (!existingProduct || !productTable) return res.status(404).json({ error: "Product not found" });

    const sanitizedUserId = stripQuotes(user.id);
    const ownerMatches = String(existingProduct.vendor_id) === String(sanitizedUserId) || String(existingProduct.vendor) === String(sanitizedUserId);
    if (!ownerMatches) return res.status(403).json({ error: "You do not have permission to delete this product" });

    const removedFiles: string[] = [];
    try {
      const pathsToRemove: string[] = [];
      const mainPath = extractStoragePathFromPublicUrl(existingProduct.image, VENDOR_PRODUCT_BUCKET);
      if (mainPath) pathsToRemove.push(mainPath);

      const thumbs = Array.isArray(existingProduct.thumbnails)
        ? existingProduct.thumbnails
        : typeof existingProduct.thumbnails === "string" && existingProduct.thumbnails
        ? [existingProduct.thumbnails]
        : [];

      for (const t of thumbs) {
        const p = extractStoragePathFromPublicUrl(t, VENDOR_PRODUCT_BUCKET);
        if (p) pathsToRemove.push(p);
      }

      const uniquePaths = Array.from(new Set(pathsToRemove.filter(Boolean)));
      if (uniquePaths.length > 0) {
        const { error: removeError } = await supabase.storage.from(VENDOR_PRODUCT_BUCKET).remove(uniquePaths);
        if (!removeError) removedFiles.push(...uniquePaths);
        else console.warn("Storage remove error:", removeError);
      }
    } catch (err) {
      console.warn("Error removing product files:", err);
    }

    const { error: deleteErr } = await supabase.from(productTable).delete().eq("id", id);
    if (deleteErr) {
      console.error("Delete error:", deleteErr);
      return res.status(500).json({ error: "Failed to delete product", details: deleteErr, removedFiles });
    }

    return res.status(200).json({ deletedId: id, deletedFrom: productTable, removedFiles });
  } catch (err: any) {
    console.error("Error deleting vendor product:", err);
    return res.status(500).json({ error: err.message || "Server error", details: err });
  }
});

// -----------------------------
// PUBLIC: GET /vendors/:vendorId/products
// -----------------------------
router.get("/vendors/:vendorId/products", async (req: Request, res: Response) => {
  const { vendorId } = req.params;
  if (!vendorId) return res.status(400).json({ error: "Missing vendor ID" });

  try {
    const raw = stripQuotes(vendorId);
    const { products, tableResults } = await findProductsByVendorId(raw);

    if (Array.isArray(products) && products.length > 0) {
      const normalized = products.map((row: any) => ({ ...row, payment_methods: normalizePaymentMethodsForResponse(row.payment_methods) }));
      const vendorTableCheck = await findVendorTableContainingId(raw);
      return res.status(200).json({ products: normalized, debug: { vendorTableChecked: vendorTableCheck.table, tableResults } });
    }

    const vendorTableCheck = await findVendorTableContainingId(raw);
    if (!vendorTableCheck.table) {
      return res.status(200).json({
        products: [],
        debug: {
          message: `No products found for vendorId ${raw} and vendor not found in vendor tables.`,
          vendorTableChecked: null,
          tableResults,
        },
      });
    }

    return res.status(200).json({
      products: [],
      debug: {
        message: `Vendor found in table ${vendorTableCheck.table}, but no products returned.`,
        vendorTableChecked: vendorTableCheck.table,
        tableResults,
      },
    });
  } catch (err: any) {
    console.error("Error in GET /vendors/:vendorId/products:", err);
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
});

// -----------------------------
// PUBLIC: POST /validate-vendors
// -----------------------------
router.post("/validate-vendors", async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body.vendorIds) ? req.body.vendorIds.map((i: any) => String(i)) : [];
    if (ids.length === 0) return res.status(200).json({ existing: [] });

    const { data, error } = await supabase.from(VENDOR_PROFILES_TABLE).select("id").in("id", ids);
    if (error) {
      console.warn("Error validating vendor ids:", error);
      return res.status(500).json({ error: "Validation failed", details: error });
    }

    const existing = (data || []).map((r: any) => String(r.id));
    return res.status(200).json({ existing });
  } catch (err: any) {
    console.error("Error in /validate-vendors:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// -----------------------------
// PUBLIC: GET /vendors/:id
// -----------------------------
router.get("/vendors/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const viewCandidates = ["vendor_profiles_with_user", "vendor_profiles", "vendor", "vendors"];
    for (const tbl of viewCandidates) {
      try {
        const { data, error } = await supabase.from(tbl).select("*").eq("id", id).maybeSingle();
        if (error) {
          console.warn("vendor lookup error on", tbl, error);
          continue;
        }
        if (data) {
          const vendor = {
            id: data.id ?? id,
            vendor_name: data.vendor_name ?? data.display_name ?? data.name ?? data.company_name ?? data.username ?? null,
            raw: data,
          };
          return res.status(200).json({ vendor });
        }
      } catch (err) {
        console.warn("vendor lookup threw for", tbl, err);
      }
    }

    return res.status(404).json({ error: "Vendor not found" });
  } catch (err: any) {
    console.error("Error in GET /vendors/:id", err);
    return res.status(500).json({ error: "Server error", details: err?.message ?? err });
  }
});

// -----------------------------
// ADMIN: GET / (all products from 'products' table preferred)
// -----------------------------
router.get("/", async (_, res: Response) => {
  try {
    const { data, error } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    res.status(200).json({ products: data });
  } catch (err: any) {
    console.error("Error fetching products:", err.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// -----------------------------
// ADMIN: POST / (create product with admin/vendor handling)
// -----------------------------
router.post(
  "/",
  authMiddleware,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "thumbnails", maxCount: 5 },
  ]),
  async (req: Request & { user?: any }, res: Response) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const {
        name,
        price,
        rating,
        sale,
        hot,
        new: isNew,
        lowStock,
        category,
        stock,
        description,
        specifications,
        shippingInfo,
        returnInfo,
        faqs,
        vendor_id,
      } = req.body as any;

      const files = req.files as { image?: Express.Multer.File[]; thumbnails?: Express.Multer.File[] };
      if (!files?.image?.[0]) return res.status(400).json({ error: "Main image file is required" });

      const paymentMethods = parsePaymentMethods(req.body.payment_methods ?? req.body["payment_methods[]"] ?? req.body.paymentMethods);

      const adminFlag =
        req.body.admin === "true" ||
        req.body.admin === true ||
        req.body.is_admin === "true" ||
        req.body.is_admin === true ||
        req.body.isAdmin === "true" ||
        req.body.isAdmin === true;

      const vendorIdFromBody = (vendor_id ?? req.body.vendor ?? "").toString().trim();

      // Upload main image
      const mainImage = files.image[0];
      const ext = (mainImage.originalname || "").split(".").pop() || "jpg";
      const mainFileName = `products/${uuid()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(PRODUCTS_BUCKET).upload(mainFileName, mainImage.buffer, {
        contentType: mainImage.mimetype || "image/jpeg",
        upsert: true,
      });
      if (uploadError) {
        console.error("Upload error:", uploadError);
        return res.status(500).json({ error: "Upload to Supabase failed", details: uploadError });
      }
      const { data: getData } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(mainFileName) as any;
      const imageUrl = getData?.publicUrl ?? null;

      // Upload thumbnails (products)
      const thumbnailUrls: string[] = [];
      if (files.thumbnails && files.thumbnails.length) {
        for (const thumb of files.thumbnails) {
          const extThumb = (thumb.originalname || "").split(".").pop() || "jpg";
          const thumbFileName = `products/thumbs/${uuid()}.${extThumb}`;
          const { error: thumbErr } = await supabase.storage.from(PRODUCTS_BUCKET).upload(thumbFileName, thumb.buffer, {
            contentType: thumb.mimetype || "image/jpeg",
            upsert: true,
          });
          if (!thumbErr) {
            const { data: thumbData } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(thumbFileName) as any;
            const thumbUrl = thumbData?.publicUrl ?? null;
            if (thumbUrl) thumbnailUrls.push(thumbUrl);
          } else {
            console.warn("Thumbnail upload error for", thumb.originalname, thumbErr);
          }
        }
      }

      // Parse faqs
      let parsedFaqs: any = null;
      if (faqs) {
        try {
          parsedFaqs = typeof faqs === "string" ? JSON.parse(faqs) : faqs;
        } catch {
          parsedFaqs = faqs;
        }
      }

      const tryParse = (v: any) => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };

      // compute prices using percentage approach
      const originalPriceCandidate = tryParse(req.body.original_price ?? req.body.originalPrice) ?? tryParse(price) ?? 0;
      const salePercentCandidate = req.body.sale_percent ?? req.body.sale ?? req.body.discount ?? req.body.discounted_price ?? req.body.discountedPrice ?? null;
      const salePercent = parseSalePercent(salePercentCandidate);
      const discountedFallback = tryParse(req.body.discounted_price ?? req.body.discountedPrice ?? req.body.discount);
      const computedFinalPrice = computeFinalPrice(originalPriceCandidate, salePercent, discountedFallback);

      const insertPayload: any = {
        name: name ?? null,
        price: computedFinalPrice,
        original_price: originalPriceCandidate,
        rating: rating ? parseFloat(rating) : 0,
        image: imageUrl,
        thumbnails: thumbnailUrls.length ? thumbnailUrls : null,
        sale_percent: salePercent !== null ? salePercent : null,
        hot: hot === "true" || hot === true,
        new: isNew === "true" || isNew === true,
        lowstock: (lowStock === "true" || lowStock === true) || false,
        category: category || null,
        stock: stock ? parseInt(stock, 10) : 0,
        description: description || null,
        specifications: specifications || null,
        shippingInfo: shippingInfo || null,
        returnInfo: returnInfo || null,
        faqs: parsedFaqs,
        admin: !!adminFlag,
      };

      // Attach vendor identity
      async function findVendorRowForUser(userId: string) {
        const candidates = ["vendor", "vendors", "vendor_profiles_with_user", "vendor_profiles"];
        for (const tbl of candidates) {
          try {
            const { data: byUser, error: errByUser } = await supabase.from(tbl).select("*").eq("user_id", userId).limit(1).maybeSingle();
            if (!errByUser && byUser) return { table: tbl, row: byUser };
            const { data: byId, error: errById } = await supabase.from(tbl).select("*").eq("id", userId).limit(1).maybeSingle();
            if (!errById && byId) return { table: tbl, row: byId };
          } catch (err) {
            console.warn(`Vendor lookup error on ${tbl}:`, err);
            continue;
          }
        }
        return null;
      }

      const authUserId = String(user.id);
      let attachedVendorSet = false;

      const vendorRowInfo = await findVendorRowForUser(authUserId);
      if (vendorRowInfo && vendorRowInfo.row) {
        const vRow: any = vendorRowInfo.row;
        if (vRow.id !== undefined && /^\d+$/.test(String(vRow.id))) {
          insertPayload.vendor_id = Number(vRow.id);
          attachedVendorSet = true;
        } else if (vRow.vendor_id !== undefined && /^\d+$/.test(String(vRow.vendor_id))) {
          insertPayload.vendor_id = Number(vRow.vendor_id);
          attachedVendorSet = true;
        } else if (vRow.id !== undefined) {
          insertPayload.vendor = String(vRow.id);
          attachedVendorSet = true;
        }
      }

      // vendor_id explicitly provided in body takes precedence
      if (!attachedVendorSet && vendorIdFromBody) {
        const v = vendorIdFromBody;
        if (/^\d+$/.test(v)) {
          insertPayload.vendor_id = Number(v);
        } else {
          insertPayload.vendor = v;
        }
        attachedVendorSet = true;
      }

      // If still not set, try to attach from authUserId: prefer numeric, else create a vendor_profiles string row and attach vendor string
      if (!attachedVendorSet && authUserId) {
        if (/^\d+$/.test(authUserId)) {
          insertPayload.vendor_id = Number(authUserId);
          insertPayload.payment_methods = paymentMethods && paymentMethods.length ? paymentMethods : null;
          attachedVendorSet = true;
        } else {
          try {
            await ensureVendorProfileExists(authUserId);
          } catch (err) {
            console.warn("ensureVendorProfileExists failed for authUserId:", authUserId, err);
          }
          insertPayload.vendor = authUserId;
          insertPayload.payment_methods = paymentMethods && paymentMethods.length ? paymentMethods : null;
          attachedVendorSet = true;
        }
      }

      // If there's a vendor string but no numeric vendor_id, try resolving it to a numeric id
      if (!("vendor_id" in insertPayload) && insertPayload.vendor) {
        try {
          const resolved = await resolveVendorKeyToNumericId(String(insertPayload.vendor));
          if (resolved !== null) {
            insertPayload.vendor_id = resolved;
          }
        } catch (err) {
          console.warn("Vendor resolution attempt failed:", err);
        }
      }

      // Decide which table to insert into:
      let targetTable = "products";
      if (!("vendor_id" in insertPayload) || insertPayload.vendor_id === undefined || insertPayload.vendor_id === null || String(insertPayload.vendor_id).trim() === "") {
        targetTable = "vendor_product";
        if (!insertPayload.vendor) insertPayload.vendor = insertPayload.vendor ?? authUserId;
        delete insertPayload.vendor_id;
      }

      // Try insert, retry fallback if products insert fails due to FK/constraint
      let insertResultData: any = null;
      try {
        const { data, error: insertError } = await supabase.from(targetTable).insert([insertPayload]).select();
        if (insertError) {
          throw insertError;
        }
        insertResultData = { table: targetTable, data };
      } catch (err: any) {
        const errMsg = String((err && ((err as any).message || err)) || "").toLowerCase();
        console.warn(`Insert into ${targetTable} failed:`, errMsg || err);

        if (targetTable === "products" && (errMsg.includes("foreign key") || errMsg.includes("vendor") || errMsg.includes('null value in column "vendor_id"') || errMsg.includes("23503") || errMsg.includes("23502"))) {
          try {
            const fallbackPayload = { ...insertPayload };
            delete fallbackPayload.vendor_id;
            if (!fallbackPayload.vendor) fallbackPayload.vendor = authUserId;
            const { data: fbData, error: fbErr } = await supabase.from("vendor_product").insert([fallbackPayload]).select();
            if (fbErr) {
              console.error("Fallback insert into vendor_product also failed:", fbErr);
              return res.status(500).json({ error: "Failed to insert into products (FK error) and fallback into vendor_product also failed", details: { original: err, fallback: fbErr } });
            }
            insertResultData = { table: "vendor_product", data: fbData };
          } catch (fbErr: any) {
            console.error("Fallback insert into vendor_product failed unexpectedly:", fbErr);
            return res.status(500).json({ error: "Insert failed and fallback failed", details: fbErr });
          }
        } else {
          console.error("Insert error:", err);
          return res.status(500).json({ error: "Failed to insert product", details: err });
        }
      }

      // success
      const createdRow = Array.isArray(insertResultData.data) ? insertResultData.data[0] : insertResultData.data;
      if (createdRow) createdRow.payment_methods = paymentMethods && paymentMethods.length ? paymentMethods : normalizePaymentMethodsForResponse(createdRow.payment_methods);
      res.status(201).json({ product: createdRow, insertedInto: insertResultData.table });
      return;
    } catch (err: any) {
      console.error("Error creating admin product:", err);
      res.status(500).json({ error: err?.message || "Unknown server error", details: err });
    }
  }
);

// -----------------------------
// ADMIN: GET /search?category=foo
// -----------------------------
// Keep search before the dynamic :id routes
router.get("/search", async (req: Request, res: Response) => {
  try {
    const category = String(req.query.category ?? "").trim();
    if (!category) return res.status(400).json({ error: "Missing category query param" });

    const searchTerm = category.toLowerCase();
    const productLimit = 300;

    // candidate tables to search
    const tablesToSearch = ["products", "vendor_product"];

    // fields we'll look inside for matches (only if they exist on the row)
    const candidateFields = [
      "category",
      "name",
      "title",
      "description",
      "faqs",
      "highlight",
      "specifications",
      "tags", // harmless to include here even if table lacks it — we'll check row presence first
    ];

    // helper to normalize a field value into a string to search
    const valueToSearchString = (v: any): string => {
      if (v === undefined || v === null) return "";
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v.map((x) => (x === null || x === undefined ? "" : String(x))).join(" ");
      if (typeof v === "object") {
        try {
          return JSON.stringify(v);
        } catch {
          return String(v);
        }
      }
      return String(v);
    };

    // fetch limited rows from each table, then filter in JS to avoid referencing non-existent columns in SQL
    const fetches = tablesToSearch.map((tbl) => supabase.from(tbl).select("*").limit(productLimit));
    const responses = await Promise.all(fetches);

    const combined: any[] = [];

    for (let i = 0; i < responses.length; i++) {
      const tbl = tablesToSearch[i];
      const resp = responses[i] as any;
      if (resp.error) {
        console.warn(`${tbl} search warning:`, resp.error);
        continue;
      }
      const rows = Array.isArray(resp.data) ? resp.data : [];
      for (const r of rows) {
        // see if any candidate field on this row contains the search term
        let matched = false;
        for (const f of candidateFields) {
          if (!(f in r)) continue;
          const sval = valueToSearchString(r[f]);
          if (!sval) continue;
          if (sval.toLowerCase().includes(searchTerm)) {
            matched = true;
            break;
          }
        }
        if (matched) {
          combined.push({ ...r, _sourceKey: `${tbl}:${r.id ?? Math.random()}` });
        }
      }
    }

    // dedupe by _sourceKey (prefer first occurrence)
    const map = new Map<string, any>();
    for (const it of combined) {
      const key = it._sourceKey ?? String(it.id ?? Math.random());
      if (!map.has(key)) map.set(key, it);
    }

    const result = Array.from(map.values()).map((r: any) => {
      // normalize payment_methods for compatibility with other endpoints
      if (r && r.payment_methods !== undefined) {
        r.payment_methods = normalizePaymentMethodsForResponse(r.payment_methods);
      }
      return r;
    });

    return res.status(200).json({ products: result });
  } catch (err) {
    console.error("Error in GET /search:", err);
    return res.status(500).json({ error: "Server error", details: String(err) });
  }
});

// -----------------------------
// ADMIN: GET /:id (product by ID w/ fallback across tables)
// -----------------------------
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || "");
    if (!id) return res.status(400).json({ error: "Missing id" });

    const { data: primary, error: primaryErr } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (!primaryErr && primary) return res.status(200).json({ product: primary, table: "products" });

    const found = await findProductAcrossTables(id, PRODUCT_TABLES_COMBINED);
    if (found.product) return res.status(200).json({ product: found.product, table: found.table });

    return res.status(404).json({ error: "Product not found" });
  } catch (err: any) {
    console.error("Error fetching product by ID:", err.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// -----------------------------
// ADMIN: PUT /:id (update across candidate tables)
// -----------------------------
router.put("/:id", authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const found = await findProductAcrossTables(id, PRODUCT_TABLES_COMBINED);
    if (!found.product || !found.table) return res.status(404).json({ error: "Product not found" });

    const existingProduct = found.product;
    const productTable = found.table;

    const isAdmin = Boolean(user.user_metadata?.is_admin);
    const ownerMatches = String(existingProduct.vendor_id) === String(user.id) || String(existingProduct.vendor) === String(user.id);
    if (!isAdmin && !ownerMatches) return res.status(403).json({ error: "You do not have permission to update this product" });

    const { image, name, price, rating, sale, hot, new: isNew, lowStock, category, stock, description, specifications, shippingInfo, returnInfo, faqs } = req.body as any;

    const pmCandidates = req.body.payment_methods ?? req.body.paymentMethods ?? req.body["payment_methods[]"];
    const parsePaymentMethodsSimple = (val: any): string[] | undefined => {
      if (val === undefined) return undefined;
      if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
      if (typeof val === "string") {
        const t = val.trim();
        if (!t) return [];
        try {
          const parsed = JSON.parse(t);
          if (Array.isArray(parsed)) return parsed.map(String).map((s) => s.trim()).filter(Boolean);
        } catch {}
        return t.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return [String(val)].map((s) => s.trim()).filter(Boolean);
    };

    const pm = parsePaymentMethodsSimple(pmCandidates);

    const updates: any = {
      ...(name !== undefined ? { name } : {}),
      ...(rating !== undefined ? { rating: rating ? parseFloat(rating) : 0 } : {}),
      ...(sale !== undefined ? { sale: sale || null } : {}),
      ...(hot !== undefined ? { hot: hot === true || hot === "true" } : {}),
      ...(isNew !== undefined ? { new: isNew === true || isNew === "true" } : {}),
      ...(lowStock !== undefined ? { lowstock: lowStock === true || lowStock === "true" } : {}),
      ...(category !== undefined ? { category: category || null } : {}),
      ...(stock !== undefined ? { stock: stock ? parseInt(stock, 10) : 0 } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(specifications !== undefined ? { specifications: specifications || null } : {}),
      ...(shippingInfo !== undefined ? { shippingInfo: shippingInfo || null } : {}),
      ...(returnInfo !== undefined ? { returnInfo: returnInfo || null } : {}),
      ...(faqs !== undefined
        ? {
            faqs:
              typeof faqs === "string"
                ? (() => {
                    try {
                      return JSON.parse(faqs);
                    } catch {
                      return faqs;
                    }
                  })()
                : faqs,
          }
        : {}),
    };

    if (pm !== undefined) updates.payment_methods = pm;

    // Handle base64 image upload for admin update
    if (image) {
      const matches = (image as string).match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) return res.status(400).json({ error: "Invalid image format" });
      const ext = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, "base64");
      const fileName = `products/${uuid()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from(PRODUCTS_BUCKET).upload(fileName, buffer, {
        contentType: `image/${ext}`,
        upsert: true,
      });
      if (uploadError) {
        console.error("Image upload error during update:", uploadError);
        return res.status(500).json({ error: "Failed to upload image", details: uploadError });
      }
      const { data: getData } = supabase.storage.from(PRODUCTS_BUCKET).getPublicUrl(fileName) as any;
      updates.image = getData?.publicUrl ?? undefined;

      try {
        const oldMainPath = extractStoragePathFromPublicUrl(existingProduct.image, PRODUCTS_BUCKET);
        if (oldMainPath) {
          const { error: removeErr } = await supabase.storage.from(PRODUCTS_BUCKET).remove([oldMainPath]);
          if (removeErr) console.warn("Failed to remove old main image:", removeErr);
        }
      } catch (err) {
        console.warn("Error removing old main image:", err);
      }
    }

    // Pricing
    const baseOriginalCandidate = tryParseNumber(req.body.original_price ?? req.body.originalPrice) ?? tryParseNumber(existingProduct.original_price) ?? tryParseNumber(existingProduct.price) ?? 0;
    const salePercentCandidate = req.body.sale_percent ?? req.body.sale ?? req.body.discount ?? req.body.discounted_price ?? req.body.discountedPrice ?? null;
    const salePercentValue = parseSalePercent(salePercentCandidate);
    const discountedFallback = tryParseNumber(req.body.discounted_price ?? req.body.discountedPrice ?? req.body.discount);

    if (salePercentValue !== null) {
      updates.price = computeFinalPrice(baseOriginalCandidate, salePercentValue, discountedFallback);
      updates.original_price = baseOriginalCandidate;
      updates.sale = `${salePercentValue}%`;
    } else if (req.body.price !== undefined) {
      updates.price = req.body.price ? parseFloat(req.body.price) : 0;
      if (req.body.original_price !== undefined || req.body.originalPrice !== undefined) {
        updates.original_price = Number(req.body.original_price ?? req.body.originalPrice);
      }
      if (req.body.sale !== undefined) updates.sale = req.body.sale || null;
    }

    const finalUpdates = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    const { data, error } = await supabase.from(found.table!).update(finalUpdates).eq("id", id).select();
    if (error) {
      console.error("Update error:", error);
      return res.status(500).json({ error: "Failed to update product", details: error });
    }

    res.status(200).json({ product: data?.[0] ?? null, updatedIn: found.table });
  } catch (err: any) {
    console.error("Error updating product:", err);
    res.status(500).json({ error: err.message || "Unknown error", details: err });
  }
});

// -----------------------------
// ADMIN: DELETE /:id
// -----------------------------
router.delete("/:id", authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const found = await findProductAcrossTables(id, PRODUCT_TABLES_COMBINED);
    if (!found.product || !found.table) return res.status(404).json({ error: "Product not found" });

    const productRow = found.product;
    const productTable = found.table;

    const isAdmin = Boolean(user.user_metadata?.is_admin);
    const ownerMatches = String(productRow.vendor_id) === String(user.id) || String(productRow.vendor) === String(user.id);
    if (!isAdmin && !ownerMatches) return res.status(403).json({ error: "You do not have permission to delete this product" });

    const removedFiles: string[] = [];
    try {
      const paths: string[] = [];
      const mainPath = extractStoragePathFromPublicUrl(productRow.image, PRODUCTS_BUCKET);
      if (mainPath) paths.push(mainPath);

      const thumbs = Array.isArray(productRow.thumbnails)
        ? productRow.thumbnails
        : typeof productRow.thumbnails === "string" && productRow.thumbnails
        ? [productRow.thumbnails]
        : [];

      for (const t of thumbs) {
        const p = extractStoragePathFromPublicUrl(t, PRODUCTS_BUCKET);
        if (p) paths.push(p);
      }

      const unique = Array.from(new Set(paths.filter(Boolean)));
      if (unique.length > 0) {
        const { error: rmErr } = await supabase.storage.from(PRODUCTS_BUCKET).remove(unique);
        if (!rmErr) removedFiles.push(...unique);
        else console.warn("Storage remove error:", rmErr);
      }
    } catch (err) {
      console.warn("Error while removing storage files:", err);
    }

    const { error: delErr } = await supabase.from(productTable).delete().eq("id", id);
    if (delErr) {
      console.error("DB delete error:", delErr);
      return res.status(500).json({ error: "Failed to delete product", details: delErr });
    }

    return res.status(200).json({ deletedId: id, removedFiles, deletedFrom: productTable });
  } catch (err: any) {
    console.error("Error deleting product:", err);
    res.status(500).json({ error: err.message || "Unknown error", details: err });
  }
});

// -----------------------------
// ADMIN: DELETE /vendors/:id  (remove vendor + vendor products + files)
// -----------------------------
router.delete("/vendors/:id", authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const rawId = String(req.params.id || "");
    if (!rawId) return res.status(400).json({ error: "Missing vendor id" });

    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // restrict destructive removal to admins
    const isAdmin = Boolean(user.user_metadata?.is_admin || user.user_metadata?.isAdmin);
    if (!isAdmin) return res.status(403).json({ error: "Only admins may delete vendors" });

    const vendorKey = stripQuotes(rawId);

    // find vendor row location
    const vendorLookup = await findVendorTableContainingId(vendorKey);
    if (!vendorLookup.table) {
      // still allow cleaning up products if vendor string used in product rows
      // continue but note no vendor table row found.
    }

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

    // 3) delete product rows by id across both product tables (safe to call even if id doesn't exist)
    const deletedProductsSummary: Record<string, any> = { vendor_product_deleted: 0, products_deleted: 0 };
    try {
      if (productIds.length > 0) {
        // delete from vendor_product
        try {
          const { error: errVP, count } = await (supabase.from("vendor_product").delete().in("id", productIds) as any);
          if (!errVP) deletedProductsSummary.vendor_product_deleted = productIds.length; // approximate
          else console.warn("vendor_product delete error:", errVP);
        } catch (err) {
          console.warn("Error deleting from vendor_product:", err);
        }

        // delete from products
        try {
          const { error: errP, count } = await (supabase.from("products").delete().in("id", productIds) as any);
          if (!errP) deletedProductsSummary.products_deleted = productIds.length; // approximate
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
        // delete by id
        const { error: delErrById, data: dataById } = await supabase.from(tbl).delete().eq("id", vendorKey).select();
        if (!delErrById && Array.isArray(dataById) && dataById.length > 0) deletedVendors.push(`${tbl}:id`);
      } catch (err) {
        console.warn(`Delete by id on ${tbl} failed (ignored):`, err);
      }
      try {
        // delete by user_id (some tables store user_id)
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
      // also try delete by user_id
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

// -----------------------------
// ADMIN/VENDOR: PATCH /vendors/:id/demote  (soft-demote / remove vendor flags)
// - Admins may demote anyone.
// - A vendor may demote themselves (self-service).
// - The handler attempts to update common vendor fields across candidate tables, ignoring missing columns.
// -----------------------------
router.patch("/vendors/:id/demote", authMiddleware, async (req: Request & { user?: any }, res: Response) => {
  try {
    const rawId = String(req.params.id || "");
    if (!rawId) return res.status(400).json({ error: "Missing vendor id" });

    const user = req.user;
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const vendorKey = stripQuotes(rawId);
    const isAdmin = Boolean(user.user_metadata?.is_admin || user.user_metadata?.isAdmin);
    const isSelf = String(user.id) === vendorKey;

    if (!isAdmin && !isSelf) return res.status(403).json({ error: "Only admins or the vendor themselves may demote the vendor" });

    const updatePayload: any = { demoted_at: new Date().toISOString() };
    // fields we try to set; some tables won't have them — we catch/ignore errors
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
        // attempt update by id
        const { error: upErr, data: upData } = await supabase.from(tbl).update(candidateUpdates).eq("id", vendorKey).select();
        if (!upErr && Array.isArray(upData) && upData.length > 0) {
          updatedTables.push(`${tbl}:id`);
        }
      } catch (err) {
        // ignore per-table failures (likely missing cols)
        console.warn(`Update vendor demote failed on ${tbl} by id (ignored):`, err);
      }
      try {
        // attempt update by user_id
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


export default router;
