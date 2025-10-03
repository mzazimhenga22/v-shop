import { useSearchParams, Link } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import type { Product } from "@/types";

const normalize = (str: string) => str.trim().toLowerCase();

type CategoryItem = {
  name: string;
  imageUrl: string;
};

const CategoryPage = () => {
  const [searchParams] = useSearchParams();
  const category = searchParams.get("name") || "All";

  // Replace useCategories with API fetch
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  const [products, setProducts] = useState<Product[]>([]);
  const [sortBy, setSortBy] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);

  const [onlyHot, setOnlyHot] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlySale, setOnlySale] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(300);

  // 🔁 Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const res = await axios.get("/api/products", {
          params: category !== "All" ? { category } : {},
        });
        setProducts(res.data.products || []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [category]);

  // ✅ Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get("/api/categories");
        setCategories(res.data || []);
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    };

    fetchCategories();
  }, []);

  // Filtering
  const filtered = useMemo(() => {
    return products
      .filter((product) => category === "All" || product.category === category)
      .filter((product) => product.price <= maxPrice)
      .filter((product) => !onlyHot || product.hot)
      .filter((product) => !onlyNew || product.new)
      .filter((product) => !onlySale || product.sale)
      .filter((product) => product.rating >= minRating);
  }, [products, category, onlyHot, onlyNew, onlySale, minRating, maxPrice]);

  const sorted = useMemo(() => {
    const sortedData = [...filtered];
    if (sortBy === "priceLow") sortedData.sort((a, b) => a.price - b.price);
    else if (sortBy === "priceHigh") sortedData.sort((a, b) => b.price - a.price);
    else if (sortBy === "rating") sortedData.sort((a, b) => b.rating - a.rating);
    return sortedData;
  }, [filtered, sortBy]);


  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => normalize(cat.name) !== normalize(category))
      .filter((cat) => normalize(cat.name).includes(normalize(searchQuery)));
  }, [categories, category, searchQuery]);

  const displayedCategories = useMemo(() => {
    return showAll ? filteredCategories : filteredCategories.slice(0, 10);
  }, [filteredCategories, showAll]);

  return (
     <div className="min-h-screen px-6 py-12 bg-[#d3d2d2]/60 dark:bg-gray-950/60 text-gray-900 dark:text-white transition-colors duration-300 rounded-xl">
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        <Link to="/" className="hover:underline">Home</Link> /{" "}
        <span className="capitalize">{category}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold capitalize">{category} Products</h2>
        <select
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 rounded border text-sm bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
        >
          <option value="">Sort By</option>
          <option value="priceLow">Price: Low to High</option>
          <option value="priceHigh">Price: High to Low</option>
          <option value="rating">Rating</option>
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <label className="text-sm">
          <input type="checkbox" checked={onlyHot} onChange={() => setOnlyHot(!onlyHot)} className="mr-2" />
          Hot
        </label>
        <label className="text-sm">
          <input type="checkbox" checked={onlyNew} onChange={() => setOnlyNew(!onlyNew)} className="mr-2" />
          New
        </label>
        <label className="text-sm">
          <input type="checkbox" checked={onlySale} onChange={() => setOnlySale(!onlySale)} className="mr-2" />
          On Sale
        </label>
        <label className="text-sm col-span-2">
          Min Rating: {minRating}
          <input type="range" min="0" max="5" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="w-full" />
        </label>
        <label className="text-sm col-span-2">
          Max Price: ${maxPrice}
          <input type="range" min="0" max="300" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full" />
        </label>
      </div>

       <div className="mb-10">
        <h3 className="text-lg font-semibold mb-4">Browse Other Categories</h3>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <input
            type="text"
            placeholder="Search categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 rounded border text-sm w-full sm:max-w-xs bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
          />
          {filteredCategories.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 sm:mt-0"
            >
              {showAll ? "Show Less" : "Show More"}
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 sm:flex sm:justify-start gap-4 overflow-x-auto no-scrollbar">
          {displayedCategories.map((cat, i) => (
            <Link to={`/category?name=${encodeURIComponent(cat.name)}`} key={i}>
              <div className="flex flex-col items-center w-20">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 dark:bg-gray-800 shadow-md flex items-center justify-center overflow-hidden hover:scale-105 transition-transform">
                  <img
                    src={cat.imageUrl}
                    alt={cat.name}
                    className="w-full h-full object-cover rounded-full"
                  />
                </div>
                <span className="mt-2 text-xs sm:text-sm text-center text-gray-700 dark:text-gray-300">
                  {cat.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Products rendering */}
      {loading ? (
        <div className="text-center text-gray-500 dark:text-gray-400">Loading products...</div>
      ) : sorted.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sorted.map((product, i) => (
            <ProductCard product={product} key={i} />
          ))}
        </div>
      ) : (
        <div className="text-center text-gray-600 dark:text-gray-400 mt-20">
          <p className="text-lg mb-2">No products found in <strong>{category}</strong>.</p>
          <p className="text-sm">Try adjusting your filters or selecting a different category.</p>
        </div>
      )}
    </div>
  );
};

export default CategoryPage;