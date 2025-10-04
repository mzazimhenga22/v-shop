// src/pages/CategoryPage.tsx
import { useSearchParams, Link } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import { useEffect, useState, useMemo, Fragment } from "react";
import axios from "axios";
import type { Product } from "@/types";
import { Dialog, Transition } from "@headlessui/react";
import { X, List, Grid3x3 } from "lucide-react";

const normalize = (str: string) => str?.trim().toLowerCase() || "";

type CategoryItem = {
  name: string;
  imageUrl: string;
};

const CategoryPage = () => {
  const [searchParams] = useSearchParams();
  const initialCategory = searchParams.get("name") || "All";

  // Data
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [sortBy, setSortBy] = useState<string>("default");
  const [onlyHot, setOnlyHot] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlySale, setOnlySale] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(300);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // category search for "Browse Other Categories"
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  // Fetch products (filtered by category query param originally)
  useEffect(() => {
    let mounted = true;
    const fetchProducts = async () => {
      try {
        setProductsLoading(true);
        const res = await axios.get("/api/products", {
          params: selectedCategory && selectedCategory !== "All" ? { category: selectedCategory } : {},
        });
        if (!mounted) return;
        setProducts(res.data.products || res.data || []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
        if (!mounted) return;
        setProducts([]);
      } finally {
        if (mounted) setProductsLoading(false);
      }
    };

    fetchProducts();
    return () => {
      mounted = false;
    };
  }, [selectedCategory]);

  // Fetch categories
  useEffect(() => {
    let mounted = true;
    const fetchCategories = async () => {
      try {
        const res = await axios.get("/api/categories");
        if (!mounted) return;
        // Expecting array of { name, imageUrl } or array of strings
        const data = res.data || [];
        if (Array.isArray(data) && data.length && typeof data[0] === "string") {
          setCategories((data as string[]).map((n) => ({ name: n, imageUrl: "" })));
        } else {
          setCategories(data as CategoryItem[]);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    };
    fetchCategories();
    return () => {
      mounted = false;
    };
  }, []);

  // Combined logic: filters
  const filtered = useMemo(() => {
    return (products || [])
      .filter((product) => selectedCategory === "All" || (product.category ?? "Uncategorized") === selectedCategory)
      .filter((product) => (product.price ?? 0) <= maxPrice)
      .filter((product) => !onlyHot || product.hot)
      .filter((product) => !onlyNew || product.new)
      .filter((product) => !onlySale || product.sale)
      .filter((product) => (product.rating ?? 0) >= minRating);
  }, [products, selectedCategory, onlyHot, onlyNew, onlySale, minRating, maxPrice]);

  const sorted = useMemo(() => {
    const s = [...filtered];
    if (sortBy === "priceLow") s.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    else if (sortBy === "priceHigh") s.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    else if (sortBy === "rating") s.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return s;
  }, [filtered, sortBy]);

  // Pagination
  const paginated = sorted.slice(0, page * itemsPerPage);
  const hasMore = paginated.length < sorted.length;

  // Browse other categories list (exclude current)
  const filteredCategories = useMemo(() => {
    return categories
      .filter((cat) => normalize(cat.name) !== normalize(selectedCategory))
      .filter((cat) => normalize(cat.name).includes(normalize(searchQuery)));
  }, [categories, selectedCategory, searchQuery]);

  const displayedCategories = useMemo(() => (showAll ? filteredCategories : filteredCategories.slice(0, 10)), [
    filteredCategories,
    showAll,
  ]);

  // Helpers
  const resetFilters = () => {
    setOnlyHot(false);
    setOnlyNew(false);
    setOnlySale(false);
    setMinRating(0);
    setMaxPrice(300);
    setSortBy("default");
    setSelectedCategory("All");
  };

  // Sync selectedCategory if initial query param changed externally
  useEffect(() => {
    setSelectedCategory(initialCategory);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCategory]);

  return (
    <section className="min-h-screen px-4 py-12 bg-gradient-to-br from-gray-100/60 to-gray-200/40 dark:from-gray-900/80 dark:to-black/70 text-gray-900 dark:text-white backdrop-blur-lg rounded-xl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        <Link to="/" className="hover:underline">
          Home
        </Link>{" "}
        / <span className="font-medium text-gray-800 dark:text-white ml-1">{selectedCategory}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
        <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-emerald-400">
          {selectedCategory === "All" ? "All Products" : `${selectedCategory} Products`}
        </h2>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 rounded-xl border text-sm bg-white/50 dark:bg-gray-900/40 border-gray-300 dark:border-gray-600 backdrop-blur-sm shadow-sm w-full md:w-auto"
          >
            <option value="default">Sort By</option>
            <option value="priceLow">Price: Low to High</option>
            <option value="priceHigh">Price: High to Low</option>
            <option value="rating">Rating</option>
          </select>

          <button
            className="lg:hidden px-4 py-2 border rounded-xl text-sm font-medium bg-white/40 dark:bg-gray-800/40 backdrop-blur-md shadow-sm hover:shadow-lg transition"
            onClick={() => setSidebarOpen(true)}
          >
            Filters
          </button>
        </div>
      </div>

      {/* Active tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {selectedCategory !== "All" && <Tag label={selectedCategory} onRemove={() => setSelectedCategory("All")} />}
        {onlyHot && <Tag label="Hot" onRemove={() => setOnlyHot(false)} />}
        {onlyNew && <Tag label="New" onRemove={() => setOnlyNew(false)} />}
        {onlySale && <Tag label="On Sale" onRemove={() => setOnlySale(false)} />}
        {minRating > 0 && <Tag label={`Rating ≥ ${minRating}`} onRemove={() => setMinRating(0)} />}
        {(selectedCategory !== "All" || onlyHot || onlyNew || onlySale || minRating > 0) && (
          <button onClick={resetFilters} className="text-sm text-red-500 underline ml-2">
            Reset All
          </button>
        )}
      </div>

      {/* Top small controls for quick filter toggles (mobile-friendly) */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex gap-2 flex-wrap">
          {/* Render category chips from fetched categories names (show a few) */}
          <button
            onClick={() => setSelectedCategory("All")}
            className={`px-4 py-2 rounded-full border text-sm font-medium transition backdrop-blur-sm shadow-sm ${
              selectedCategory === "All"
                ? "bg-gradient-to-r from-green-600 to-emerald-500 text-white border-green-600 shadow-md"
                : "bg-white/50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"
            }`}
          >
            All
          </button>

          {categories.slice(0, 6).map((c) => (
            <button
              key={c.name}
              onClick={() => setSelectedCategory(c.name)}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition backdrop-blur-sm shadow-sm ${
                selectedCategory === c.name
                  ? "bg-gradient-to-r from-green-600 to-emerald-500 text-white border-green-600 shadow-md"
                  : "bg-white/50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="px-2 py-2 rounded-xl border text-sm bg-white/50 dark:bg-gray-900/40 border-gray-300 dark:border-gray-600 backdrop-blur-sm shadow-sm"
            value={itemsPerPage}
          >
            <option value={4}>4</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
          </select>

          <button
            onClick={() => setViewMode("grid")}
            className={`p-2 rounded-xl transition ${viewMode === "grid" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"}`}
          >
            <Grid3x3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-xl transition ${viewMode === "list" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"}`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar filters (desktop) */}
        <aside className="hidden lg:block w-full max-w-xs sticky top-24 self-start border rounded-2xl p-6 bg-white/60 dark:bg-gray-900/60 border-gray-200 dark:border-gray-700 backdrop-blur-lg shadow-md">
          <FiltersSidebar
            onlyHot={onlyHot}
            onlyNew={onlyNew}
            onlySale={onlySale}
            maxPrice={maxPrice}
            setOnlyHot={setOnlyHot}
            setOnlyNew={setOnlyNew}
            setOnlySale={setOnlySale}
            setMaxPrice={setMaxPrice}
            minRating={minRating}
            setMinRating={setMinRating}
          />
          <div className="mt-6 text-xs text-gray-500">
            <div>
              <strong>Note:</strong> Categories are fetched from your API.
            </div>
          </div>
        </aside>

        <div className="flex-1">
          {/* Browse other categories */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Browse Other Categories</h3>
              {filteredCategories.length > 10 && (
                <button onClick={() => setShowAll(!showAll)} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  {showAll ? "Show Less" : "Show More"}
                </button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <input
                type="text"
                placeholder="Search categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-4 py-2 rounded border text-sm w-full sm:max-w-xs bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600"
              />
            </div>

            <div className="grid grid-cols-3 sm:flex sm:justify-start gap-4 overflow-x-auto no-scrollbar pb-2">
              {displayedCategories.map((cat, i) => (
                <Link to={`/category?name=${encodeURIComponent(cat.name)}`} key={i}>
                  <div className="flex flex-col items-center w-20">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 dark:bg-gray-800 shadow-md flex items-center justify-center overflow-hidden hover:scale-105 transition-transform">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover rounded-full" />
                      ) : (
                        <span className="text-xs text-gray-600 dark:text-gray-300">{cat.name.charAt(0)}</span>
                      )}
                    </div>
                    <span className="mt-2 text-xs sm:text-sm text-center text-gray-700 dark:text-gray-300">{cat.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Products grid/list */}
          {productsLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading products...</p>
          ) : paginated.length > 0 ? (
            <>
              <div className={`grid ${viewMode === "list" ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"} gap-6`}>
                {paginated.map((product, i) => (
                  <ProductCard product={product} key={product.id ?? i} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-md hover:shadow-lg transition"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-gray-600 dark:text-gray-400 mt-20">
              <p className="text-lg mb-2">No products found in <strong>{selectedCategory}</strong>.</p>
              <p className="text-sm">Try adjusting your filters or selecting a different category.</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Sidebar (Transition) */}
      <Transition appear show={sidebarOpen} as={Fragment}>
        <Dialog as="div" className="relative z-50 lg:hidden" onClose={setSidebarOpen}>
          <Transition.Child
            as={Fragment}
            enter="transition-opacity ease-linear duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity ease-linear duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-30" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="relative bg-white/80 dark:bg-gray-950/90 w-full max-w-sm p-6 h-full shadow-xl backdrop-blur-md">
              <Dialog.Title className="flex justify-between items-center mb-4 text-lg font-semibold">
                Filters
                <button onClick={() => setSidebarOpen(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Title>

              <FiltersSidebar
                onlyHot={onlyHot}
                onlyNew={onlyNew}
                onlySale={onlySale}
                maxPrice={maxPrice}
                setOnlyHot={setOnlyHot}
                setOnlyNew={setOnlyNew}
                setOnlySale={setOnlySale}
                setMaxPrice={setMaxPrice}
                minRating={minRating}
                setMinRating={setMinRating}
              />
            </div>
          </div>
        </Dialog>
      </Transition>
    </section>
  );
};

export default CategoryPage;

/* 🔖 Sleek Tag component */
const Tag = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="bg-green-100/70 dark:bg-green-900/50 text-green-800 dark:text-green-200 text-sm px-3 py-1 rounded-full flex items-center gap-2 shadow-sm backdrop-blur-sm">
    {label}
    <button onClick={onRemove} className="hover:text-red-500">×</button>
  </span>
);

/* 🎛️ Filters sidebar (same style as ProductsPage) */
const FiltersSidebar = ({
  onlyHot,
  onlyNew,
  onlySale,
  maxPrice,
  setOnlyHot,
  setOnlyNew,
  setOnlySale,
  setMaxPrice,
  minRating,
  setMinRating,
}: any) => (
  <>
    <div className="mb-6">
      <label className="text-sm font-medium">Max Price: ${maxPrice}</label>
      <input type="range" min="0" max="10000" value={maxPrice} onChange={(e) => setMaxPrice(Number(e.target.value))} className="w-full mt-2 accent-green-600" />
    </div>
    <div className="mb-6">
      <label className="text-sm font-medium">Min Rating: {minRating}+</label>
      <input type="range" min="0" max="5" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} className="w-full mt-2 accent-green-600" />
    </div>
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyHot} onChange={() => setOnlyHot(!onlyHot)} className="accent-green-600" />
        Hot
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyNew} onChange={() => setOnlyNew(!onlyNew)} className="accent-green-600" />
        New
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlySale} onChange={() => setOnlySale(!onlySale)} className="accent-green-600" />
        On Sale
      </label>
    </div>
  </>
);
