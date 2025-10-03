import express, { Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

// GET /admin/vendor-applications
router.get("/vendor-applications", async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("vendor")
      .select("id, name, email, message, reviewed, inserted_at")
      .order("inserted_at", { ascending: false });

    if (error) throw error;

    const applications = data.map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      message: v.message,
      reviewed: v.reviewed ?? false,
      submittedAt: v.inserted_at,
    }));

    return res.json({ applications });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch vendor applications.";
    console.error("❌ Error fetching vendor applications:", message);
    return res.status(500).json({ error: message });
  }
});

// POST /vendor-applications
router.post("/vendor-applications", async (req: Request, res: Response) => {
  try {
    const { user_id, name, email, message, phone, category } = req.body;

    if (!user_id || !name || !email || !message) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // ✅ Check if user exists in Supabase Auth (auth.users)
    const { data: userCheck, error: userError } = await supabase.auth.admin.getUserById(user_id);

    if (userError || !userCheck?.user) {
      return res.status(401).json({ error: "User not registered. Please sign up first." });
    }

    // Check if vendor application already exists
    const { data: existing, error: existingError } = await supabase
      .from("vendor")
      .select("id")
      .eq("user_id", user_id);

    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "Application already exists." });
    }

    // Insert new vendor application
    const { error: insertError } = await supabase.from("vendor").insert([
      {
        user_id,
        name,
        email,
        message,
        phone,
        category,
        reviewed: false,
      },
    ]);

    if (insertError) throw insertError;

    return res.status(201).json({ message: "Application submitted successfully." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit application.";
    console.error("❌ Error submitting vendor application:", message);
    return res.status(500).json({ error: message });
  }
});

// PATCH /vendor-applications/:id/review
router.patch("/vendor-applications/:id/review", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Vendor ID is required." });
  }

  try {
    const { data, error: fetchError } = await supabase
      .from("vendor")
      .select("id")
      .eq("id", id)
      .single();

    if (fetchError || !data) {
      return res.status(404).json({ error: "Vendor application not found." });
    }

    const { error: updateError } = await supabase
      .from("vendor")
      .update({ reviewed: true })
      .eq("id", id);

    if (updateError) throw updateError;

    return res.status(200).json({ message: "Application marked as reviewed." });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update review status.";
    console.error("❌ Error marking as reviewed:", message);
    return res.status(500).json({ error: message });
  }
});

// PATCH /vendor-applications/:id/promote
router.patch("/vendor-applications/:id/promote", async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Vendor application ID is required." });
  }

  try {
    // 1️⃣ Fetch the vendor application
    const { data: app, error: fetchError } = await supabase
      .from("vendor")
      .select("email, category")
      .eq("id", id)
      .single();

    if (fetchError || !app?.email) {
      return res.status(404).json({ error: "Vendor application not found or missing email." });
    }

    const { data: userList, error: userListError } = await supabase.auth.admin.listUsers();
    if (userListError) throw userListError;

    const user = userList?.users?.find((u: User) => u.email === app.email);
    if (!user) {
      return res.status(404).json({ error: "No user found with the provided email." });
    }

    // 3️⃣ Promote user to vendor
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: { isVendor: true },
    });
    if (updateError) throw updateError;

    // 4️⃣ Insert vendor profile automatically
    const { error: profileError } = await supabase
      .from("vendor_profiles")
      .insert([{
        id: user.id,                    // Must match auth.users UUID
        category: app.category || "General",
        photo_url: null,                 // or default placeholder
        rating: 0,
        verified: true,
        updated_at: new Date(),
      }]);

    if (profileError) throw profileError;

    return res.status(200).json({ message: "User promoted and vendor profile created." });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to promote user.";
    console.error("❌ Error promoting user:", message);
    return res.status(500).json({ error: message });
  }
});


export default router;
