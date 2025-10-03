import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { supabase } from "../supabaseClient";

interface ProductRow {
  name: string;
  price: string;
  rating: string;
  image: string;
  sale: string;
  hot: string;
  new: string;
  lowStock: string;
  category: string;
}

const csvFilePath = path.join(__dirname, "products.csv");

fs.createReadStream(csvFilePath)
  .pipe(csv())
  .on("data", async (row: ProductRow) => {
    const product = {
      name: row.name,
      price: parseFloat(row.price),
      rating: parseFloat(row.rating),
      image: row.image,
      sale: row.sale,
      hot: row.hot === "true",
      new: row.new === "true",
      lowStock: row.lowStock === "true",
      category: row.category,
    };

    const { error } = await supabase.from("products").insert([product]);

    if (error) {
      console.error("Insert error:", error.message);
    } else {
      console.log("Inserted:", product.name);
    }
  })
  .on("end", () => {
    console.log("CSV import completed.");
  });
