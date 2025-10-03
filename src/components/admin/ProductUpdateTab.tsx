// src/components/admin/ProductUpdateTab.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import type { Product } from "@/types";
import { Trash, Pencil } from "lucide-react";
import ProductCard from "@/components/ProductCard";

/**
 * Admin product editor that:
 * - fetches both admin/store products (table "products") and vendor products (table "vendor_product")
 * - normalizes them into a single list with `_table` metadata
 * - allows editing & deleting and routes updates/deletes to the correct table
 *
 * Note: adjust field names if your DB schema differs.
 */

type ExtProduct = Product & {
  _table: "products" | "vendor_product";
  isVendor?: boolean;
  raw?: any;
};

export const ProductUpdateTab = () => {
  const [products, setProducts] = useState<ExtProduct[]>([]);
  const [editingProduct, setEditingProduct] = useState<ExtProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // selected category for tabs (All or specific category name)
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>("All");

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const normalizeRow = (row: any, table: "products" | "vendor_product"): ExtProduct => {
    const thumbnails = Array.isArray(row.thumbnails) ? row.thumbnails : row.thumbnail ? [row.thumbnail] : [];
    const image = row.image ?? thumbnails[0] ?? row.photo ?? null;
    const price = typeof row.price === "number" ? row.price : parseFloat(row.price ?? "0") || 0;
    const rating = typeof row.rating === "number" ? row.rating : parseFloat(row.rating ?? "0") || 0;
    const stock =
      (typeof row.stock === "number" ? row.stock : null) ??
      (typeof row.inventory === "number" ? row.inventory : null) ??
      (typeof row.qty === "number" ? row.qty : null) ??
      (typeof row.quantity === "number" ? row.quantity : null) ??
      0;

    const normalized: ExtProduct = {
      id: String(row.id ?? row._id ?? `${table}-${Math.random().toString(36).slice(2, 9)}`),
      name: row.name ?? row.title ?? "Untitled product",
      price,
      rating,
      category: row.category ?? "Uncategorized",
      hot: Boolean(row.hot),
      new: Boolean(row.new || row.is_new),
      sale: Boolean(row.sale || row.discount),
      image,
      thumbnails,
      stock,
      description: row.description ?? row.desc ?? row.long_description ?? null,
      vendor: row.vendor ?? row.vendor_id ?? null,
      raw: row,
      _table: table,
      isVendor: table === "vendor_product",
    } as any;

    return normalized;
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const [storeResp, vendorResp] = await Promise.allSettled([
        supabase.from("products").select("*").order("created_at", { ascending: false }),
        supabase.from("vendor_product").select("*").order("created_at", { ascending: false }),
      ]);

      const storeRows = storeResp.status === "fulfilled" && Array.isArray(storeResp.value.data) ? storeResp.value.data : [];
      const vendorRows = vendorResp.status === "fulfilled" && Array.isArray(vendorResp.value.data) ? vendorResp.value.data : [];

      const normalized: ExtProduct[] = [
        ...storeRows.map((r: any) => normalizeRow(r, "products")),
        ...vendorRows.map((r: any) => normalizeRow(r, "vendor_product")),
      ];

      normalized.sort((a, b) => {
        const ta = a.raw?.created_at ? new Date(a.raw.created_at).getTime() : 0;
        const tb = b.raw?.created_at ? new Date(b.raw.created_at).getTime() : 0;
        return tb - ta;
      });

      setProducts(normalized);

      // If the selected tab is not present in the new data, reset to 'All'
      const categories = ["All", ...Array.from(new Set(normalized.map((p) => p.category || "Uncategorized")))];
      if (selectedCategoryTab !== "All" && !categories.includes(selectedCategoryTab)) {
        setSelectedCategoryTab("All");
      }
    } catch (err) {
      console.error("Error fetching products (admin):", err);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const deleteProduct = async (p: ExtProduct) => {
    if (!p || !p.id) return;
    const table = p._table;
    try {
      const { error } = await supabase.from(table).delete().eq("id", p.raw?.id ?? p.id);
      if (error) {
        console.error("Delete failed:", error);
        alert("Delete failed. See console for details.");
        return;
      }
      setProducts((prev) => prev.filter((x) => !(x._table === table && String(x.id) === String(p.id))));
    } catch (err) {
      console.error("Delete unexpected error:", err);
      alert("Delete failed. See console.");
    }
  };

  const handleUpdate = async () => {
    if (!editingProduct) return;
    setSaving(true);
    const table = editingProduct._table;
    const idToUse = editingProduct.raw?.id ?? editingProduct.id;

    const updates: any = {
      name: editingProduct.name,
      price: editingProduct.price,
      category: editingProduct.category,
      stock: editingProduct.stock,
      description: editingProduct.description,
    };

    try {
      const { data, error } = await supabase.from(table).update(updates).eq("id", idToUse).select();
      if (error) {
        console.error("Update failed:", error);
        alert("Update failed. See console.");
      } else {
        if (Array.isArray(data) && data.length > 0) {
          const updatedRow = normalizeRow(data[0], table);
          setProducts((prev) => prev.map((p) => (p._table === table && String(p.id) === String(editingProduct.id) ? updatedRow : p)));
        } else {
          await fetchProducts();
        }
        setEditingProduct(null);
      }
    } catch (err) {
      console.error("Update crash:", err);
      alert("Update failed. See console.");
    } finally {
      setSaving(false);
    }
  };

  // group products by category for display
  const groupedByCategory = products.reduce((acc: Record<string, ExtProduct[]>, product) => {
    const category = product.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {});

  // derive tabs (All + categories)
  const tabs = ["All", ...Object.keys(groupedByCategory).sort()];

  // Decide which categories to render based on selected tab
  const categoriesToRender = selectedCategoryTab === "All" ? Object.keys(groupedByCategory) : [selectedCategoryTab];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">📦 Update Products (Admin)</h2>
        <div>
          <button
            onClick={() => fetchProducts()}
            className="px-3 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && <p>Loading products...</p>}

      {/* Tabs */}
      {!loading && tabs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-3">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedCategoryTab(t)}
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                selectedCategoryTab === t
                  ? "bg-green-600 text-white shadow"
                  : "bg-white/60 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
              }`}
            >
              {t} <span className="ml-2 text-xs text-gray-400">({t === "All" ? products.length : (groupedByCategory[t] || []).length})</span>
            </button>
          ))}
        </div>
      )}

      {!loading &&
        categoriesToRender.map((category) => {
          const items = groupedByCategory[category] || [];
          return (
            <div key={category}>
              <h3 className="text-xl font-semibold mb-4">{category}</h3>
              {items.length === 0 ? (
                <p className="text-sm text-gray-500">No products in this category.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {items.map((product) => (
                    <div
                      key={`${product._table}-${product.id}`}
                      className="relative border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-sm"
                    >
                      {/* guard all editingProduct accesses with a null check to satisfy TS */}
                      {editingProduct && editingProduct.id === product.id && editingProduct._table === product._table ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleUpdate();
                          }}
                          className="space-y-3"
                        >
                          <label className="block text-xs text-gray-600">Name</label>
                          <input
                            type="text"
                            className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"
                            value={editingProduct?.name ?? ""}
                            onChange={(e) => setEditingProduct((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                            required
                          />

                          <label className="block text-xs text-gray-600">Price</label>
                          <input
                            type="number"
                            step="0.01"
                            className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"
                            value={editingProduct?.price ?? 0}
                            onChange={(e) =>
                              setEditingProduct((prev) => (prev ? { ...prev, price: parseFloat(e.target.value || "0") } : prev))
                            }
                            required
                          />

                          <label className="block text-xs text-gray-600">Stock</label>
                          <input
                            type="number"
                            className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"
                            value={editingProduct?.stock ?? 0}
                            onChange={(e) => setEditingProduct((prev) => (prev ? { ...prev, stock: parseInt(e.target.value || "0") } : prev))}
                            required
                          />

                          <label className="block text-xs text-gray-600">Category</label>
                          <input
                            type="text"
                            className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"
                            value={editingProduct?.category ?? ""}
                            onChange={(e) => setEditingProduct((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                          />

                          <label className="block text-xs text-gray-600">Description</label>
                          <textarea
                            className="w-full p-2 rounded-md bg-gray-100 dark:bg-gray-700"
                            value={editingProduct?.description ?? ""}
                            onChange={(e) => setEditingProduct((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                          />

                          <div className="flex items-center gap-2">
                            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-1 rounded-md hover:bg-blue-700">
                              {saving ? "Saving…" : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingProduct(null)} className="text-sm text-gray-500 ml-2">
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <ProductCard product={product as any} />
                          <div className="absolute top-2 right-2 flex gap-2">
                            <button
                              onClick={() => setEditingProduct(product)}
                              className="p-1 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white"
                              title="Edit"
                              aria-label="Edit product"
                            >
                              <Pencil size={16} />
                            </button>

                            <button
                              onClick={() => {
                                if (confirm("Are you sure you want to delete this product?")) {
                                  deleteProduct(product);
                                }
                              }}
                              className="p-1 rounded-full bg-red-500 hover:bg-red-600 text-white"
                              title="Delete"
                              aria-label="Delete product"
                            >
                              <Trash size={16} />
                            </button>
                          </div>

                          {product.isVendor && (
                            <div className="absolute left-3 top-3 px-2 py-0.5 rounded bg-indigo-600 text-white text-xs">Vendor</div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default ProductUpdateTab;
