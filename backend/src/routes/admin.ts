import express from "express";
import { supabase } from "../supabaseClient.js";

const router = express.Router();

/**
 * GET /admin/users
 * Fetch all users from Supabase Auth.
 * Requires service role key in supabase client.
 */
router.get("/users", async (req, res) => {
  console.log("🔁 Received request: GET /admin/users");

  try {
    const { data, error } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("❌ Supabase admin error:", error);
      return res.status(500).json({ error: error.message });
    }

    if (!data?.users?.length) {
      console.warn("⚠️ No users found in Supabase.");
    } else {
      console.log(`✅ Fetched ${data.users.length} user(s)`);
    }

    return res.json({ users: data.users || [] });
  } catch (err: any) {
    console.error("❌ Unexpected server error:", err.message || err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
