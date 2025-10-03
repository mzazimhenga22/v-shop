// src/pages/products.tsx
import { useState, useEffect, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import ProductCard from "@/components/ProductCard";
import { X, List, Grid3x3 } from "lucide-react";
import type { Product } from "@/types/index";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

const categories = [
  "All",
  "Store", // marketplace / store products
  "Vendors", // separate category for vendor-supplied products
  "Fashion",
  "Kitchen",
  "Furniture",
  "Electronics",
  "Food",
  "Beauty",
  "Toys",
];

const ProductsPage = () => {
  const [storeProducts, setStoreProducts] = useState<Product[]>([]);
  const [vendorProducts, setVendorProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState("default");
  const [onlyHot, setOnlyHot] = useState(false);
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlySale, setOnlySale] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState(300);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [viewMode, setViewMode] = useState("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    const normalizeToProduct = (p: any, source: "store" | "vendor"): Product => {
      // helper to coerce a "discount" into a displayable sale string (avoid boolean used as string)
      const rawDiscount = p.discount ?? p.sale ?? p.raw_discount ?? null;
      let saleStr: string | undefined = undefined;
      if (typeof rawDiscount === "string" && rawDiscount.trim() !== "") saleStr = rawDiscount.trim();
      else if (typeof rawDiscount === "number" && !isNaN(rawDiscount)) {
        // interpret numeric discount as percentage if looks like percent <= 100, otherwise as dollar-off
        if (rawDiscount > 0 && rawDiscount <= 100) saleStr = `${rawDiscount}% off`;
        else saleStr = `$${rawDiscount} off`;
      }

      const thumbnails = Array.isArray(p.thumbnails)
        ? p.thumbnails
        : p.thumbnails?.length
        ? p.thumbnails
        : p.thumbnail
        ? [p.thumbnail]
        : [];

      const image = p.image ?? thumbnails[0] ?? p.photo ?? p.img ?? null;

      const stock =
        (typeof p.stock === "number" ? p.stock : null) ??
        (typeof p.inventory === "number" ? p.inventory : null) ??
        (typeof p.qty === "number" ? p.qty : null) ??
        (typeof p.quantity === "number" ? p.quantity : null) ??
        0;

      const price = typeof p.price === "number" ? p.price : parseFloat(p.price ?? "0") || 0;
      const rating = typeof p.rating === "number" ? p.rating : parseFloat(p.rating ?? "0") || 0;

      const normalized: Product = {
        id: String(p.id ?? p._id ?? p.product_id ?? `${source}-${Math.random().toString(36).slice(2, 9)}`),
        name: p.name ?? p.title ?? p.product_name ?? "Untitled product",
        price,
        rating,
        category: p.category ?? p.type ?? "Uncategorized",
        hot: Boolean(p.hot),
        new: Boolean(p.new || p.is_new),
        sale: Boolean(saleStr),
        image,
        thumbnails,
        stock,
        description: p.description ?? p.desc ?? p.long_description ?? null,
        vendor: p.vendor ?? p.vendor_id ?? null,
        // keep original row for debugging/advanced displays
        raw: p,
        // include discount string for ProductCard to parse (ensure it's string or undefined)
        // @ts-ignore allow extra prop for UI usage
        discount: saleStr,
        // mark source for UI
        // @ts-ignore allow extra prop
        source,
      } as any;

      return normalized;
    };

    const fetchVendorProductsFromSupabase = async () => {
      try {
        const nowIso = new Date().toISOString();

        // Prefer active featured vendor products (not expired), similar to FeaturedProducts
        const { data: featuredRows, error: fe } = await supabase
          .from("vendor_product")
          .select("*")
          .not("featured_at", "is", null)
          .lte("featured_at", nowIso) // started
          .gt("featured_until", nowIso) // still active
          .order("featured_at", { ascending: false })
          .limit(100); // fetch up to 100, we'll paginate client-side

        if (fe) {
          // If column doesn't exist or permission denied, fallthrough to fallback query
          console.warn("Vendor featured fetch warning:", fe.message ?? fe);
        }

        if (Array.isArray(featuredRows) && featuredRows.length > 0) {
          return featuredRows.map((r) => normalizeToProduct(r, "vendor"));
        }

        // If no featured results, fallback to most recent vendor products
        const { data: recentRows, error: recErr } = await supabase
          .from("vendor_product")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (recErr) {
          console.warn("Vendor recent fetch warning:", recErr.message ?? recErr);
          return [];
        }

        return (recentRows || []).map((r) => normalizeToProduct(r, "vendor"));
      } catch (err) {
        console.error("Error fetching vendor products from Supabase:", err);
        return [];
      }
    };

    const fetchProducts = async () => {
      setProductsLoading(true);
      try {
        // fetch store products via your API and vendor products via Supabase in parallel
        const [storeResp, vendorFromSupabase] = await Promise.all([
          axios.get("/api/products").catch((e) => ({ error: e })),
          fetchVendorProductsFromSupabase(),
        ]);

        if (!mounted) return;

        // Normalize store products (defensive)
        if (storeResp && !(storeResp as any).error) {
          const rawStore = (storeResp as any).data?.products ?? (storeResp as any).data ?? [];
          const normalizedStore: Product[] = Array.isArray(rawStore)
            ? rawStore.map((r: any) => normalizeToProduct(r, "store"))
            : [];
          setStoreProducts(normalizedStore);
        } else {
          setStoreProducts([]);
          if ((storeResp as any).error) {
            console.warn("Failed to fetch store products:", (storeResp as any).error?.message ?? (storeResp as any).error);
          }
        }

        // vendorFromSupabase is already normalized
        setVendorProducts(Array.isArray(vendorFromSupabase) ? vendorFromSupabase : []);
      } catch (err) {
        console.error("❌ Unexpected error fetching products:", err);
        setStoreProducts([]);
        setVendorProducts([]);
      } finally {
        if (mounted) setProductsLoading(false);
      }
    };

    fetchProducts();

    // optional: refresh vendor products every 60s so featured windows update
    const iv = setInterval(() => {
      if (!mounted) return;
      // call only vendor refresh to avoid hammering backend for store products
      (async () => {
        const vp = await fetchVendorProductsFromSupabase();
        if (!mounted) return;
        setVendorProducts(Array.isArray(vp) ? vp : []);
      })();
    }, 60 * 10000);

    return () => {
      mounted = false;
      clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset filters helper
  const resetFilters = () => {
    setSelectedCategory("All");
    setOnlyHot(false);
    setOnlyNew(false);
    setOnlySale(false);
    setMinRating(0);
    setMaxPrice(10000);
    setSortBy("default");
  };

  // Build the master list depending on selectedCategory
  const combinedProducts = [...storeProducts, ...vendorProducts];

  // Choose source-specific list when user picks the Vendors or Store category
  const sourceFilteredBase = (() => {
    if (selectedCategory === "Vendors") return vendorProducts;
    if (selectedCategory === "Store") return storeProducts;
    if (selectedCategory === "All") return combinedProducts;
    // Otherwise selectedCategory is a normal category (Fashion, Electronics, ...)
    return combinedProducts;
  })();

  // Apply category filter if a normal category is selected (not All/Store/Vendors)
  const filtered = sourceFilteredBase.filter((product) => {
    // category match: if selectedCategory is one of the normal categories, match it
    const categoryMatch =
      selectedCategory === "All" ||
      selectedCategory === "Store" ||
      selectedCategory === "Vendors" ||
      (product.category ?? "Uncategorized") === selectedCategory;

    const matchPrice = (product.price ?? 0) <= maxPrice;
    const matchHot = !onlyHot || product.hot;
    const matchNew = !onlyNew || product.new;
    const matchSale = !onlySale || Boolean(product.sale);
    const matchRating = (product.rating ?? 0) >= minRating;

    return categoryMatch && matchPrice && matchHot && matchNew && matchSale && matchRating;
  });

  // Sorting
  const sorted = [...filtered];
  if (sortBy === "priceLow") sorted.sort((a, b) => a.price - b.price);
  else if (sortBy === "priceHigh") sorted.sort((a, b) => b.price - a.price);
  else if (sortBy === "rating") sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  // Pagination (simple incremental "Load more")
  const paginated: Product[] = sorted.slice(0, page * itemsPerPage);
  const hasMore = paginated.length < sorted.length;

  return (
    <section className="min-h-screen px-4 py-12 bg-gradient-to-br from-gray-100/60 to-gray-200/40 dark:from-gray-900/80 dark:to-black/70 text-gray-900 dark:text-white backdrop-blur-lg">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        <span className="hover:underline cursor-pointer">Home</span> /
        <span className="font-medium text-gray-800 dark:text-white ml-1">Products</span>
      </nav>

      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-green-500 to-emerald-400">
          Explore Products
        </h2>
        <button
          className="lg:hidden px-4 py-2 border rounded-xl text-sm font-medium bg-white/40 dark:bg-gray-800/40 backdrop-blur-md shadow-sm hover:shadow-lg transition"
          onClick={() => setSidebarOpen(true)}
        >
          Filters
        </button>
      </div>

      {/* Active tags */}
      <div className="flex flex-wrap gap-2 mb-6">
        {selectedCategory !== "All" && (
          <Tag label={selectedCategory} onRemove={() => setSelectedCategory("All")} />
        )}
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

      {/* Filters + view mode */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex gap-2 flex-wrap">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition backdrop-blur-sm shadow-sm ${
                selectedCategory === category
                  ? "bg-gradient-to-r from-green-600 to-emerald-500 text-white border-green-600 shadow-md"
                  : "bg-white/50 dark:bg-gray-900/40 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <select
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-2 rounded-xl border text-sm bg-white/50 dark:bg-gray-900/40 border-gray-300 dark:border-gray-600 backdrop-blur-sm shadow-sm"
            value={sortBy}
          >
            <option value="default">Sort By</option>
            <option value="priceLow">Price: Low to High</option>
            <option value="priceHigh">Price: High to Low</option>
            <option value="rating">Rating</option>
          </select>

          <select
            onChange={(e) => setItemsPerPage(Number(e.target.value))}
            className="px-2 py-2 rounded-xl border text-sm bg-white/50 dark:bg-gray-900/40 border-gray-300 dark:border-gray-600 backdrop-blur-sm shadow-sm"
            value={itemsPerPage}
          >
            <option value={4}>4</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
          </select>

          <button onClick={() => setViewMode("grid")} className={`p-2 rounded-xl transition ${viewMode === "grid" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"}`}>
            <Grid3x3 className="w-4 h-4" />
          </button>
          <button onClick={() => setViewMode("list")} className={`p-2 rounded-xl transition ${viewMode === "list" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-100/50 dark:hover:bg-gray-800/40"}`}>
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col lg:flex-row gap-8">
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
            <div><strong>Note:</strong> "Vendors" shows products uploaded by vendors.</div>
          </div>
        </aside>

        <div className="flex-1">
          {productsLoading ? (
            <p className="text-gray-600 dark:text-gray-400">Loading products...</p>
          ) : paginated.length > 0 ? (
            <>
              <div className={`grid ${viewMode === "list" ? "grid-cols-1" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4"} gap-6`}>
                {paginated.map((product, i) => (
                  // ProductCard should be able to accept product.source to display badges if you want
                  <ProductCard product={product} key={product.id ?? i} />
                ))}
              </div>
              {hasMore && (
                <div className="flex justify-center mt-10">
                  <button
                    onClick={() => setPage(page + 1)}
                    className="px-6 py-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-500 text-white shadow-md hover:shadow-lg transition"
                  >
                    Load More
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">No matching products found.</p>
          )}
        </div>
      </div>

      {/* Mobile Sidebar */}
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

export default ProductsPage;

/* 🔖 Sleek Tags */
const Tag = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="bg-green-100/70 dark:bg-green-900/50 text-green-800 dark:text-green-200 text-sm px-3 py-1 rounded-full flex items-center gap-2 shadow-sm backdrop-blur-sm">
    {label}
    <button onClick={onRemove} className="hover:text-red-500">×</button>
  </span>
);

/* 🎛️ Sleek Sidebar Filters */
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
