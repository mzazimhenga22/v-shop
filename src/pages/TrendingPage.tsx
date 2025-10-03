import { useEffect, useState } from "react";
import type { Product } from "@/types";
import ProductCard from "@/components/ProductCard";
import { Rocket, TrendingUp } from "lucide-react";
import FireLottie from "@/components/FireLottie"; // ⬅️ import the fire animation

const TrendingPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [topTrending, setTopTrending] = useState<Product[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await fetch("/api/products");
        const data = await res.json();

        const allProducts = Array.isArray(data.products) ? data.products : data;
        const hotProducts = allProducts.filter((p: Product) => p.hot);

        setProducts(hotProducts);

        const shuffled = [...hotProducts].sort(() => 0.5 - Math.random());
        setTopTrending(shuffled.slice(0, 4));
      } catch (err) {
        console.error("Failed to fetch trending products:", err);
      }
    };

    fetchProducts();
  }, []);

  return (
    <section className="px-6 py-12 bg-white dark:bg-gray-950 min-h-screen space-y-10">
      {/* Top Trending Horizontal Scroll */}
      {topTrending.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
            <Rocket className="text-orange-600" /> Top Trending on Vshop
          </h2>
          <div className="flex space-x-4 overflow-x-auto pb-2 items-center">
            {/* 🔥 Fire on the left */}
            <FireLottie size={72} />

            {topTrending.map((product) => (
              <div key={product.id} className="min-w-[200px] max-w-[250px]">
                <ProductCard product={product} />
              </div>
            ))}

            {/* 🔥 Fire on the right */}
            <FireLottie size={72} />
          </div>
        </div>
      )}

      {/* Trending Grid */}
      <div>
        <h2 className="text-2xl font-bold mb-6 text-gray-800 dark:text-white flex items-center gap-2">
          <TrendingUp className="text-pink-600" /> Trending Now
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {products.length === 0 && (
          <p className="text-gray-500 mt-6 dark:text-gray-400">
            No trending products found.
          </p>
        )}
      </div>
    </section>
  );
};

export default TrendingPage;
