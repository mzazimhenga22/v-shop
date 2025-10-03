import { useEffect, useState } from "react";
import type { Product } from "@/types";
import ProductCard from "@/components/ProductCard";
import { Info, Sparkles, PlusCircle } from "lucide-react";

const NewArrivalsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<Product | null>(null);
  const [alertMessage, setAlertMessage] = useState("Check out our kitchen deals too!");

  const rotatingMessages = [
    "Check out our kitchen deals too!",
    "Hot gadgets in electronics waiting for you!",
    "Trending in fashion now!",
    "Best beauty picks available!",
    "Don’t miss tasty food deals!"
  ];

useEffect(() => {
  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/products");
      const { products }: { products: Product[] } = await res.json(); // ✅ Fix here

      const newArrivals = products.filter((p) => p.new);
      const otherCategoryProduct = products.find((p) => !p.new);

      setProducts(newArrivals);
      setRecommended(otherCategoryProduct || null);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoading(false);
    }
  };

  fetchProducts();
}, []);


  useEffect(() => {
    const interval = setInterval(() => {
      setAlertMessage((prev) => {
        const currentIndex = rotatingMessages.indexOf(prev);
        const nextIndex = (currentIndex + 1) % rotatingMessages.length;
        return rotatingMessages[nextIndex];
      });
    }, 7000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="px-6 py-12 bg-white dark:bg-gray-950 min-h-screen space-y-8">
      {/* Page Heading */}
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
        <PlusCircle className="w-6 h-6 text-blue-500" />
        New Arrivals
      </h2>

      {/* Recommended Product Card */}
      {recommended && (
        <div className="bg-gradient-to-r from-blue-500 to-violet-600 text-white px-6 py-5 rounded-2xl shadow-lg flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-1">
              <Sparkles className="w-5 h-5" />
              Did you know?
            </h3>
            <p className="text-sm">
              {recommended.name} is hot in {recommended.category} — check it out!
            </p>
          </div>
          <img
            src={recommended.image ?? ""}
            alt={recommended.name}
            className="w-20 h-20 object-contain rounded-md border border-white/20"
          />
        </div>
      )}

      {/* Helpful Alert Banner */}
      <div className="bg-blue-50 text-blue-800 border border-blue-200 px-4 py-3 rounded-lg flex items-center gap-3">
        <Info className="w-5 h-5" />
        <p className="text-sm">{alertMessage}</p>
      </div>

      {/* Product Grid */}
      {loading ? (
        <p className="text-gray-500 dark:text-gray-400">Loading products...</p>
      ) : products.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No new arrivals found.</p>
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

export default NewArrivalsPage;
