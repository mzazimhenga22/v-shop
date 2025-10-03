import { useEffect, useState } from "react";
import type { Product } from "@/types";
import ProductCard from "@/components/ProductCard";
import CategoryCarousel from "@/components/CategoryCarousel";
import { AlertTriangle } from "lucide-react";

const BestSellersPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [recommended, setRecommended] = useState<Product | null>(null);
  const [promos, setPromos] = useState<Product[]>([]);
  const [currentPromoIndex, setCurrentPromoIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch("http://localhost:4000/api/products");
        const data = await res.json();

        const bestSellers = data.products.filter(
          (p: Product) =>
            p.category?.toLowerCase() === "best sellers" ||
            p.sale?.toLowerCase().includes("best")
        );

        const recommendedProduct = bestSellers.reduce((prev: Product, curr: Product) => {
          const prevDiscount = parseInt(prev.sale?.match(/\d+/)?.[0] || "0", 10);
          const currDiscount = parseInt(curr.sale?.match(/\d+/)?.[0] || "0", 10);
          return currDiscount > prevDiscount ? curr : prev;
        }, bestSellers[0]);

        const promoCandidates = data.products.filter(
          (p: Product) =>
            !(
              p.category?.toLowerCase() === "best sellers" ||
              p.sale?.toLowerCase().includes("best")
            )
        );

        const shuffledPromos = promoCandidates.sort(() => 0.5 - Math.random()).slice(0, 5);

        setProducts(bestSellers);
        setRecommended(recommendedProduct);
        setPromos(shuffledPromos);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // 🔁 Auto-rotate promo every 6 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPromoIndex((prev: number) => (prev + 1) % promos.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [promos]);

  return (
    <section className="px-4 md:px-10 py-8 bg-white dark:bg-gray-950 min-h-screen space-y-8">
      <CategoryCarousel />

      <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
        <span className="text-red-500 text-3xl">🔥</span> Best Sellers
      </h2>

      {/* 🌟 Recommended Banner */}
      {recommended && (
        <div className="bg-gradient-to-r from-amber-400 to-red-500 text-white px-6 py-5 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">🌟 Recommended Just for You</h3>
            <p className="text-sm">
              {recommended.name} — now at {recommended.sale || "a great price"}!
            </p>
          </div>
          <img
            src={recommended.image ?? ""}
            alt={recommended.name}
            className="w-20 h-20 object-contain rounded-md border border-white/20"
          />
        </div>
      )}

      {/* 🔁 Rotating Alert Message */}
      <div className="bg-yellow-100 text-yellow-800 border border-yellow-300 px-4 py-3 rounded-lg flex items-center gap-3 transition-all duration-500">
        <AlertTriangle className="w-5 h-5" />
        <p className="text-sm font-medium">
          {promos.length > 0 ? (
            <>
              🛍️ Did you know Vshop also offers{" "}
              <span className="font-semibold">{promos[currentPromoIndex].name}</span> in{" "}
              <span className="italic">{promos[currentPromoIndex].category}</span>?
            </>
          ) : (
            "Some items are in limited stock — order now before they run out!"
          )}
        </p>
      </div>

      {/* 🛍️ Product Grid */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading products...</p>
      ) : products.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No best sellers found.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
};

export default BestSellersPage;
