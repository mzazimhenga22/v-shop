// src/pages/DealsPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Tag } from "lucide-react";
import api from "@/lib/axios"; // adjust if your axios helper path differs
import ProductCard from "@/components/ProductCard"; // adjust path if different
import type { Product as ProductType } from "@/types";

type ApiProduct = any; // loose type since backend rows may vary

const normalizeProduct = (p: ApiProduct): ProductType => {
  return {
    id: String(p.id ?? p.product_id ?? Math.random()),
    name: p.name ?? p.title ?? "Untitled product",
    price: typeof p.price === "number" ? p.price : parseFloat(p.price ?? 0) || 0,
    rating: Math.max(0, Math.floor(p.rating ?? p.rating_count ?? 0)),
    image: p.image ?? (Array.isArray(p.thumbnails) && p.thumbnails[0]) ?? "/images/placeholder.png",
    thumbnails: p.thumbnails ?? [],
    reviews: p.reviews ?? p.review_count ?? undefined,
    hot: !!p.hot,
    new: !!p.new,
    lowStock: !!p.lowStock,
    discount: p.discount ? String(p.discount) : p.sale ? `${p.sale}` : p.discount === 0 ? "0%" : undefined,
    _raw: p,
  } as unknown as ProductType;
};

const DealsPage = () => {
  const [products, setProducts] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchProducts = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await api.get?.("/products").catch(() => null) ?? null;
        const data = res?.data ?? null;

        const finalData =
          data ??
          (
            await fetch("/api/products")
              .then((r) => (r.ok ? r.json() : Promise.reject(r)))
              .catch(() => ({ products: [] }))
          );

        const rows: ApiProduct[] = finalData?.products ?? finalData ?? [];
        if (cancelled) return;

        const normalized = Array.isArray(rows)
          ? rows.map(normalizeProduct)
          : [];

        setProducts(normalized);
      } catch (err: any) {
        console.error("Failed fetching products for deals page:", err);
        if (!cancelled) setError("Oops! Something went wrong while loading deals. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddToCart = (product: ProductType) => {
    console.log("add to cart:", product.id);
  };

  const handleBuyNow = (product: ProductType) => {
    console.log("buy now:", product.id);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
          <Tag className="w-6 h-6 text-red-500" />
          Hot Deals
        </h1>
        <Link
          to="/"
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Back to Home
        </Link>
      </div>

      {/* Status */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="animate-pulse bg-white/10 dark:bg-gray-800/20 rounded-2xl h-64"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400">
          No deals available right now. Please check back later!
        </div>
      )}

      {/* Products grid */}
      {!loading && !error && products.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={() => handleAddToCart(product)}
              onBuyNow={() => handleBuyNow(product)}
            />
          ))}
        </div>
      )}

      {/* Footer / small note */}
      <div className="mt-6 text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <Clock className="w-4 h-4" />
        New deals are added regularly — don’t miss out!
      </div>
    </div>
  );
};

export default DealsPage;
