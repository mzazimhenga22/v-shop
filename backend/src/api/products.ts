// src/routes/products.ts
import express from "express";
import mergedProducts from "./mergedProducts.js";// mergedProducts is in the same folder

const router = express.Router();

/**
 * Mount mergedProducts so admin product endpoints map to /api/products/.
 * Example: incoming POST /api/products -> mergedProducts sees POST /
 *
 * Note: vendor endpoints are still available under /api/products/vendor/...
 * If you prefer vendor endpoints under /api/vendor/*, use the vendor wrapper above instead.
 */
router.use((req, res, next) => {
  // Do not alter req.url — express strips the mount path before the router sees it,
  // so mergedProducts will get "/" for admin list/create, "/:id" for admin get/update/delete, etc.
  next();
}, mergedProducts);

export default router;
