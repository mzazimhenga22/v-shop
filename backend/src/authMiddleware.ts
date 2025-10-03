import { Request, Response, NextFunction } from "express";
import { supabase } from "./supabaseClient.js"; // ✅ Adjust path if needed

// Extend Express Request type to include user
declare module "express-serve-static-core" {
  interface Request {
    user?: any;
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed authorization token" });
  }

  const token = authHeader.split("Bearer ")[1];

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = data.user;
  next();
};
