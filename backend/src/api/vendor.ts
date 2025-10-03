import express, { Request, Response } from "express";
import mergedProducts, { authMiddleware } from "./mergedProducts.js"; // make sure mergedProducts exports authMiddleware

const router = express.Router();

/**
 * DELETE /api/vendors/:id
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    console.log(`[VENDOR] Deleting vendor with id: ${id}`);
    // TODO: replace with DB logic; e.g. await supabase.from("vendor_profiles").delete().eq("id", id);
    return res.status(200).json({ success: true, message: `Vendor ${id} removed successfully` });
  } catch (err: any) {
    console.error("[VENDOR] Error removing vendor:", err);
    return res.status(500).json({ error: "Failed to remove vendor" });
  }
});

/**
 * PATCH /api/vendors/:id/demote
 */
router.patch("/:id/demote", authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    console.log(`[VENDOR] Demoting vendor with id: ${id}`);
    // TODO: DB demote logic
    return res.status(200).json({ success: true, message: `Vendor ${id} demoted successfully` });
  } catch (err: any) {
    console.error("[VENDOR] Error demoting vendor:", err);
    return res.status(500).json({ error: "Failed to demote vendor" });
  }
});

/**
 * Forward to mergedProducts WITHOUT rewriting req.url.
 *
 * Important:
 * - mergedProducts already registers both the public plural routes (`/vendors/:vendorId/products`)
 *   and protected singular vendor routes (`/vendor/products`) itself.
 * - Mutating req.url here (to "/vendor" or "/vendors") caused the router to receive paths that
 *   didn't match what mergedProducts registered, producing 404s.
 *
 * By calling `router.use(mergedProducts)`, we let mergedProducts handle its own paths unchanged.
 */
router.use(mergedProducts);

export default router;
