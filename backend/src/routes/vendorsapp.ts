// routes/vendorApplications.ts
import express, { Request, Response } from "express";
import { supabase } from "../supabaseClient.js"; // your server-side supabase client (must use SERVICE_ROLE_KEY)
import type { User } from "@supabase/supabase-js";

const router = express.Router();

/**
 * Helper: normalize vendor row for responses
 */
function normalizeVendorRow(v: any) {
  return {
    id: v.id,
    user_id: v.user_id,
    name: v.name,
    email: v.email,
    phone: v.phone,
    category: v.category,
    message: v.message,
    website: v.website,
    instagram: v.instagram,
    facebook: v.facebook,
    registration_number: v.registration_number,
    vat_number: v.vat_number,
    payment_methods: v.payment_methods,
    address: v.address,
    city: v.city,
    county: v.county,
    country: v.country,
    postal_code: v.postal_code,
    lat: v.lat,
    lng: v.lng,
    logo_url: v.logo_url,
    id_doc_url: v.id_doc_url,
    reviewed: v.reviewed ?? false,
    status: v.status ?? "pending",
    inserted_at: v.inserted_at,
    updated_at: v.updated_at ?? null,
  };
}

/**
 * GET /admin/vendor-applications
 * Optional query params:
 *  - reviewed=true|false
 *  - limit, offset
 */
router.get("/vendor-applications", async (req: Request, res: Response) => {
  try {
    const { reviewed, limit = "50", offset = "0" } = req.query;

    let query = supabase
      .from("vendor")
      .select(
        `id, user_id, name, email, phone, category, message, website, instagram, facebook,
         registration_number, vat_number, payment_methods, address, city, county, country,
         postal_code, lat, lng, logo_url, id_doc_url, reviewed, status, inserted_at, updated_at`
      )
      .order("inserted_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (reviewed === "true") query = query.eq("reviewed", true);
    if (reviewed === "false") query = query.eq("reviewed", false);

    const { data, error } = await query;

    if (error) throw error;

    const applications = (data ?? []).map(normalizeVendorRow);
    return res.json({ applications });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch vendor applications.";
    console.error("❌ Error fetching vendor applications:", message);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /vendor-applications
 * Accepts full vendor payload (see frontend)
 */
router.post("/vendor-applications", async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {};

    // required fields from the frontend
    const { user_id, name, email, message } = body;

    if (!user_id || !name || !email || !message) {
      return res.status(400).json({ error: "Missing required fields: user_id, name, email, message." });
    }

    // Ensure user exists in auth (uses admin API) - requires SERVICE_ROLE_KEY on the server
    const { data: userCheck, error: userError } = await supabase.auth.admin.getUserById(user_id);
    if (userError || !userCheck?.user) {
      return res.status(401).json({ error: "User not registered. Please sign up first." });
    }

    // Prevent duplicate application: check by user_id OR email
    const { data: existing, error: existingError } = await supabase
      .from("vendor")
      .select("id, user_id, email")
      .or(`user_id.eq.${user_id},email.eq.${email}`)
      .limit(1);

    if (existingError) throw existingError;
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Application already exists." });
    }

    // Build insertable row with safe defaults.
    // Accept arrays/objects for payment_methods (Supabase -> jsonb)
    const insertRow = {
      user_id: user_id,
      name: name,
      email: email,
      phone: body.phone ?? null,
      category: body.category ?? null,
      message: message,
      website: body.website ?? null,
      instagram: body.instagram ?? null,
      facebook: body.facebook ?? null,
      registration_number: body.registration_number ?? null,
      vat_number: body.vat_number ?? null,
      payment_methods: Array.isArray(body.payment_methods) ? body.payment_methods : body.payment_methods ?? [],
      address: body.address ?? null,
      city: body.city ?? null,
      county: body.county ?? null,
      country: body.country ?? null,
      postal_code: body.postal_code ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      logo_url: body.logo_url ?? null,
      id_doc_url: body.id_doc_url ?? null,
      reviewed: false,
      status: "pending", // optional workflow column
    };

    const { data: inserted, error: insertError } = await supabase
      .from("vendor")
      .insert([insertRow])
      .select()
      .single();

    if (insertError) throw insertError;

    return res.status(201).json({ application: normalizeVendorRow(inserted), message: "Application submitted successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit application.";
    console.error("❌ Error submitting vendor application:", message);
    return res.status(500).json({ error: message });
  }
});

/**
 * PATCH /vendor-applications/:id/review
 * Mark application as reviewed (admin)
 */
router.patch("/vendor-applications/:id/review", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Vendor ID is required." });
  }

  try {
    // we can attempt to update directly and return the row
    const { data, error } = await supabase.from("vendor").update({ reviewed: true, status: "reviewed", updated_at: new Date() }).eq("id", id).select().single();

    if (error) {
      if ((error as any).code === "PGRST116") {
        return res.status(404).json({ error: "Vendor application not found." });
      }
      throw error;
    }

    return res.status(200).json({ application: normalizeVendorRow(data), message: "Application marked as reviewed." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update review status.";
    console.error("❌ Error marking as reviewed:", message);
    return res.status(500).json({ error: message });
  }
});

/**
 * PATCH /vendor-applications/:id/promote
 * Promote the applicant's auth user to vendor (sets user_metadata) and creates vendor_profiles row.
 * Expects that vendor row includes user_id (frontend inserts it).
 */
router.patch("/vendor-applications/:id/promote", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Vendor application ID is required." });
  }

  try {
    // Fetch vendor row (including user_id)
    const { data: app, error: fetchError } = await supabase.from("vendor").select("*").eq("id", id).single();

    if (fetchError || !app) {
      return res.status(404).json({ error: "Vendor application not found." });
    }

    const userId = app.user_id;
    if (!userId) {
      return res.status(400).json({ error: "Vendor row missing user_id; cannot promote." });
    }

    // 1) promote auth user metadata
    const { error: updateUserError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        isVendor: true,
        vendor_profile_created_at: new Date().toISOString(),
      },
    });
    if (updateUserError) throw updateUserError;

    // 2) create or upsert vendor_profiles row (id = auth user id)
    // Make sure your vendor_profiles table has id: uuid primary key (matching auth.users.id)
    const profileRow = {
      id: userId,
      name: app.name ?? null,
      email: app.email ?? null,
      category: app.category ?? "General",
      phone: app.phone ?? null,
      website: app.website ?? null,
      instagram: app.instagram ?? null,
      facebook: app.facebook ?? null,
      registration_number: app.registration_number ?? null,
      vat_number: app.vat_number ?? null,
      payment_methods: app.payment_methods ?? [],
      photo_url: app.logo_url ?? null,
      id_doc_url: app.id_doc_url ?? null,
      rating: 0,
      verified: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    // Upsert: if row exists, update; else insert
    const { error: profileError } = await supabase.from("vendor_profiles").upsert(profileRow, { onConflict: "id" });

    if (profileError) throw profileError;

    // 3) mark vendor application as reviewed/promoted
    const { error: updateVendorError } = await supabase.from("vendor").update({ reviewed: true, status: "promoted", updated_at: new Date() }).eq("id", id);
    if (updateVendorError) throw updateVendorError;

    return res.status(200).json({ message: "User promoted and vendor profile created." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to promote user.";
    console.error("❌ Error promoting user:", message);
    return res.status(500).json({ error: message });
  }
});

export default router;
