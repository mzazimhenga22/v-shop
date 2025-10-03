// src/components/RecentlyViewed.tsx
import React, { useEffect, useRef, useState } from "react";
import ProductCard from "./ProductCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { supabase } from "@/lib/supabaseClient";
import type { Product as ProductType } from "@/types";
import { useCurrency } from "@/context/CurrencyContext"; // ✅ import currency context

const RecentlyViewed: React.FC = () => {
  const [recentItems, setRecentItems] = useState<ProductType[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const { formatCurrency } = useCurrency(); // ✅ use formatCurrency

  useEffect(() => {
    const loadRecent = async () => {
      try {
        const data = localStorage.getItem("recentItems");
        if (!data) return;

        const parsed = JSON.parse(data);
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        const ids = parsed.map((p: any) => p.id);

        // 🔥 fetch full product details from Supabase
        const { data: products, error } = await supabase
          .from("vendor_product")
          .select("*")
          .in("id", ids);

        if (error) {
          console.warn("RecentlyViewed fetch error:", error);
          setRecentItems(parsed); // fallback to local
        } else {
          // preserve original order
          const ordered = ids
            .map((id: string | number) =>
              (products || []).find((p) => p.id === id)
            )
            .filter(Boolean) as ProductType[];
          setRecentItems(ordered);
        }
      } catch (err) {
        console.warn("Failed to load recentItems:", err);
      }
    };

    loadRecent();
  }, []);

  useEffect(() => {
    const updateScrollButtons = () => {
      const el = containerRef.current;
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft + el.clientWidth + 10 < el.scrollWidth);
    };

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
  }, [recentItems.length]);

  const scrollByViewport = (dir: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const amount = Math.floor(el.clientWidth * 0.85);
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    setTimeout(() => {
      if (!el) return;
      setCanScrollLeft(el.scrollLeft > 10);
      setCanScrollRight(el.scrollLeft + el.clientWidth + 10 < el.scrollWidth);
    }, 300);
  };

  const removeItem = (id: string | number) => {
    const updated = recentItems.filter((item) => item.id !== id);
    setRecentItems(updated);
    try {
      localStorage.setItem(
        "recentItems",
        JSON.stringify(
          updated.map(({ id, name, image, price }) => ({
            id,
            name,
            image,
            price,
          }))
        )
      );
    } catch (err) {
      console.warn("Failed to persist recentItems:", err);
    }
  };

  if (recentItems.length === 0) return null;

  return (
    <div className="py-12 px-4 md:px-16 transition-colors duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => scrollByViewport("left")}
            aria-label="Scroll left"
            disabled={!canScrollLeft}
            className={clsx(
              "p-2 rounded-md transition",
              canScrollLeft
                ? "bg-white/6 hover:bg-white/8 text-gray-900 dark:text-white"
                : "bg-white/4 text-gray-400 cursor-not-allowed"
            )}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white">
            Recently Viewed
          </h2>
        </div>
        <button
          onClick={() => scrollByViewport("right")}
          aria-label="Scroll right"
          disabled={!canScrollRight}
          className={clsx(
            "p-2 rounded-md transition",
            canScrollRight
              ? "bg-white/6 hover:bg-white/8 text-gray-900 dark:text-white"
              : "bg-white/4 text-gray-400 cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Recently viewed products carousel"
        className="relative flex gap-6 overflow-x-auto hide-scrollbar snap-x snap-mandatory touch-pan-x"
        style={{ scrollBehavior: "smooth" }}
      >
        {recentItems.map((p) => (
          <div
            key={p.id}
            className="snap-start flex-shrink-0 min-w-[220px] relative"
            role="group"
            aria-roledescription="slide"
          >
            <div className="relative">
              <button
                onClick={() => removeItem(p.id ?? -1)}
                className="absolute top-3 right-3 bg-red-600 text-white p-1 rounded-full hover:bg-red-700 shadow-md z-20"
                title="Remove"
                aria-label={`Remove ${p.name}`}
              >
                ✕
              </button>

              <div className="rounded-2xl overflow-hidden">
                {/* ✅ pass currency-aware price */}
                <ProductCard product={{ ...p }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentlyViewed;
