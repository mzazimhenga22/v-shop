import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// 🔐 Supabase Setup
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// 🔐 Middleware to verify admin from access token
async function verifyAdmin(
  req: any,
  res: express.Response,
  next: express.NextFunction
) {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized - No token" });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = data.user;
  const isAdmin = user.user_metadata?.isAdmin === true;
  if (!isAdmin) {
    return res.status(403).json({ error: "Forbidden - Admins only" });
  }

  req.user = user;
  next();
}

// 🚀 POST /promote
router.post("/", verifyAdmin, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }

  try {
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: { isAdmin: true },
    });

    if (error) {
      console.error("❌ Supabase error:", error.message);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      message: "✅ User promoted to admin",
      user: data?.user?.email || userId,
    });
  } catch (err: any) {
    console.error("❌ Server error:", err.message);
    return res.status(500).json({ error: "Server error occurred." });
  }
});

export default router;
