// src/components/FeaturedProducts.tsx
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Link } from "react-router-dom";
import ProductCard from "@/components/ProductCard";
import type { Product as ProductType } from "@/types";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function FeaturedProducts() {
  const [featured, setFeatured] = useState<ProductType[]>([]);
  const [fallback, setFallback] = useState<ProductType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const listToRender = featured.length ? featured : fallback;

  // ---------- Helpers ----------
  const isValidFutureDate = (val: any) => {
    if (!val) return false;
    const d = new Date(val);
    return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
  };

  const filterActiveClientSide = (rows: any[]) => {
    return rows.filter((r) => {
      // accept rows that have a valid featured_until in the future
      if (!r.featured_until) return false;
      return isValidFutureDate(r.featured_until);
    });
  };

  // ---------- Fetcher ----------
  const fetchFeatured = async () => {
    setLoading(true);
    setError(null);

    try {
      // try to query a DB view first — this uses server time (recommended)
      // create the view "active_vendor_featured" in your DB:
      // CREATE VIEW active_vendor_featured AS
      //   SELECT * FROM vendor_product WHERE featured_until > now() ORDER BY featured_at DESC;
      const tryView = await supabase.from("active_vendor_featured").select("*").limit(12);
      if (!tryView.error && Array.isArray(tryView.data) && tryView.data.length > 0) {
        // defensive client-side filter (in case view unexpectedly contains expired rows)
        const active = filterActiveClientSide(tryView.data as any[]);
        console.debug("[Featured] fetched from view active_vendor_featured:", {
          returned: tryView.data.length,
          afterClientFilter: active.length,
        });
        setFeatured(active as ProductType[]);
        setFallback([]);
        return;
      }

      // If view didn't exist or was empty, fall back to querying vendor_product.
      // Use server-side filtering where possible and explicitly exclude NULLs.
      // NOTE: we cannot ask Postgres for `now()` via supabase filter string,
      // so use a conservative query + client-side validation.
      const nowIso = new Date().toISOString();

      const { data, error: fe } = await supabase
        .from("vendor_product")
        .select("*")
        .not("featured_until", "is", null)
        .gte("featured_until", nowIso) // include equal timestamps
        .order("featured_at", { ascending: false })
        .limit(12);

      if (fe) {
        // If there's an error querying vendor_product, log it and fall back below
        console.warn("[Featured] vendor_product fetch error:", fe);
      }

      // Defensive: if server returned rows, still ensure they're truly in the future
      if (Array.isArray(data) && data.length > 0) {
        const active = filterActiveClientSide(data);
        console.debug("[Featured] vendor_product returned:", {
          returned: data.length,
          afterClientFilter: active.length,
          nowIso,
        });

        if (active.length > 0) {
          setFeatured(active as ProductType[]);
          setFallback([]);
          return;
        }
      }

      // fallback: show most recent (non-featured) products — but exclude items that still
      // have a featured_until in the future (we don't want duplicates or stale featured).
      const { data: fbData, error: fbErr } = await supabase
        .from("vendor_product")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(12);

      if (fbErr) {
        console.warn("[Featured] fallback fetch error:", fbErr);
        setFallback([]);
      } else {
        // exclude items that are still featured (defensive)
        const cleansed = (fbData || []).filter((r: any) => {
          if (!r.featured_until) return true; // show it if never featured
          return !isValidFutureDate(r.featured_until); // show fallback only if not currently featured
        });
        setFallback(cleansed as ProductType[]);
      }
      setFeatured([]);
    } catch (err) {
      console.error("[Featured] fetchFeatured error:", err);
      setError("Failed to load featured products");
    } finally {
      setLoading(false);
    }
  };

  // initial + periodic refresh
  useEffect(() => {
    fetchFeatured();
    const iv = setInterval(fetchFeatured, 60 * 1000); // refresh every 60s
    return () => clearInterval(iv);
  }, []);

  // ---------- Carousel refs + state ----------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollButtons = () => {
    const el = containerRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth + 10 < el.scrollWidth);
  };

  useEffect(() => {
    updateScrollButtons();
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => updateScrollButtons();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [listToRender.length]);

  const scrollByViewport = (dir: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const amount = Math.floor(el.clientWidth * 0.85); // scroll most of viewport
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    // update after animation
    setTimeout(updateScrollButtons, 300);
  };

  // keyboard arrows for accessibility when container is focused
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") scrollByViewport("left");
      if (e.key === "ArrowRight") scrollByViewport("right");
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  // ---------- render states ----------
  if (loading) {
    return (
      <section className="py-6 px-4 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-md bg-gray-100/60 dark:bg-gray-800/60" disabled>
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </button>
            <h2 className="text-xl font-semibold">Featured Products</h2>
          </div>
          <Link to="/products" className="text-sm text-green-700 dark:text-green-400 hover:underline">
            See All →
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 bg-gray-100 dark:bg-gray-800 animate-pulse rounded" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="py-6 px-4 sm:px-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-md bg-gray-100/60 dark:bg-gray-800/60" disabled>
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </button>
            <h2 className="text-xl font-semibold">Featured Products</h2>
          </div>
          <Link to="/products" className="text-sm text-green-700 dark:text-green-400 hover:underline">
            See All →
          </Link>
        </div>

        <p className="text-sm text-red-500">{error}</p>
      </section>
    );
  }

  return (
    <section className="w-full px-4 sm:px-6 py-10 transition-colors duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* left slider button placed to the left of the title */}
          <button
            onClick={() => scrollByViewport("left")}
            aria-label="Scroll left"
            disabled={!canScrollLeft}
            className={`p-2 rounded-md transition ${(canScrollLeft ? "bg-gray-100 hover:bg-gray-200" : "bg-gray-100/40 cursor-not-allowed")} dark:bg-gray-800`}
          >
            <ChevronLeft className={`w-5 h-5 ${canScrollLeft ? "text-gray-700 dark:text-gray-100" : "text-gray-400"}`} />
          </button>

          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Featured Products
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/products"
            className="text-sm text-green-700 dark:text-green-400 hover:underline"
          >
            See All →
          </Link>

          {/* right slider button placed near the "See All" */}
          <button
            onClick={() => scrollByViewport("right")}
            aria-label="Scroll right"
            disabled={!canScrollRight}
            className={`p-2 rounded-md transition ${(canScrollRight ? "bg-gray-100 hover:bg-gray-200" : "bg-gray-100/40 cursor-not-allowed")} dark:bg-gray-800`}
          >
            <ChevronRight className={`w-5 h-5 ${canScrollRight ? "text-gray-700 dark:text-gray-100" : "text-gray-400"}`} />
          </button>
        </div>
      </div>

      {listToRender.length === 0 ? (
        <div className="text-sm text-gray-500">
          No featured products right now. Check back soon!
        </div>
      ) : (
        <>
          {/* scrollable carousel */}
          <div
            ref={containerRef}
            tabIndex={0}
            className="relative flex gap-4 overflow-x-auto snap-x snap-mandatory touch-pan-x hide-scrollbar"
            style={{ scrollBehavior: "smooth" }}
            aria-label="Featured products carousel"
          >
            {listToRender.map((p) => (
              <div
                key={(p as any).id}
                className="snap-start flex-shrink-0 w-[48%] sm:w-[31%] md:w-[23%] lg:w-[23%]"
                role="group"
                aria-roledescription="slide"
              >
                <ProductCard
                  product={p as any}
                  onAddToCart={() => {}}
                  onBuyNow={() => {}}
                />
              </div>
            ))}
          </div>

          {/* small note about pushed items */}
          {featured.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              These products were pushed to the homepage by vendors and are visible for 24 hours.
            </p>
          )}
        </>
      )}
    </section>
  );
}
