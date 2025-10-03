import express from "express";
import multer from "multer";
import { supabase } from "../supabaseClient.js";
import { v4 as uuid } from "uuid";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ✅ Upload category image
router.post("/upload", upload.single("categoryImage"), async (req, res) => {
  const categoryName = req.body.categoryName;
  const file = req.file;

  if (!categoryName || !file) {
    return res.status(400).json({ error: "Category name and image are required." });
  }

  const fileExt = file.originalname.split(".").pop();
  const filePath = `categories/${categoryName}-${uuid()}.${fileExt}`;

  const { error } = await supabase.storage
    .from("products")
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
    });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const { data: publicUrlData } = supabase.storage
    .from("products")
    .getPublicUrl(filePath);

  return res.status(200).json({ imageUrl: publicUrlData.publicUrl });
});

// ✅ Fetch categories from products table
router.get("/", async (_, res) => {
  const { data, error } = await supabase
    .from("products")
    .select("category, image");

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const categoryMap = new Map();

  for (const product of data) {
    if (!product.category) continue;
    if (!categoryMap.has(product.category)) {
      categoryMap.set(product.category, product.image);
    }
  }

  const categories = Array.from(categoryMap.entries()).map(([name, imageUrl]) => ({
    name,
    imageUrl,
  }));

  res.json(categories);
});

export default router;
