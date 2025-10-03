// src/components/Banner.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Link } from "react-router-dom";
import type { Product } from "@/types";
import { supabase } from "@/lib/supabaseClient";
import { ShieldCheck, Truck, Zap } from "lucide-react";
import clsx from "clsx";

/**
 * Performance-minded Banner:
 * - Defers expensive fetch/processing until component is in viewport
 * - Parallelizes network requests where safe
 * - Uses refs for timers and mounted flags to avoid extra renders
 * - Uses lightweight "select N random" instead of full-array shuffle
 */

/* ---------- constants ---------- */
const API_BASE = (import.meta.env.VITE_API_BASE as string) || "";
const PLACEHOLDER = "https://via.placeholder.com/600x400?text=Vshop";
const MAX_TILES = 12;
const SLIDE_COUNT = 3;

/* ---------- typed slide ---------- */
interface Slide {
  title: string;
  highlight: string;
  description: string;
  collage: { src: string; style: string }[];
}

/* ---------- banner messages (unchanged) ---------- */
const messages = [
  {
    text: "Exclusive Offer: Free Shipping on Orders Over $50!",
    bgColor: "bg-blue-500",
    textColor: "text-white",
  },
  {
    text: "New Products Launched This Week!",
    bgColor: "bg-purple-500",
    textColor: "text-white",
  },
  {
    text: "Flash Sale: 24 Hours Only!",
    bgColor: "bg-red-500",
    textColor: "text-white",
  },
];

/* ---------- Small UI atoms (memoized) ---------- */
const GlassCard: React.FC<React.PropsWithChildren<{ className?: string }>> = React.memo(({ children, className }) => (
  <div
    className={clsx(
      "bg-white/6 dark:bg-black/30 backdrop-blur-md border border-white/6 dark:border-white/6 rounded-2xl p-6",
      className
    )}
  >
    {children}
  </div>
));
GlassCard.displayName = "GlassCard";

const IconBadge: React.FC<{ icon: React.ReactNode; text: string }> = React.memo(({ icon, text }) => (
  <div className="flex items-center gap-2 text-sm text-gray-400">
    <div className="p-2 rounded-md bg-white/3 dark:bg-black/40">{icon}</div>
    <div>{text}</div>
  </div>
));
IconBadge.displayName = "IconBadge";

/* ---------- helper utilities ---------- */
const isImageLike = (p: any) =>
  Boolean(p?.image || p?.image_url || p?.photo || p?.photo_url || (Array.isArray(p?.thumbnails) && p.thumbnails.length));

const safeImage = (img: any) => {
  if (!img) return PLACEHOLDER;
  try {
    const s = String(img).trim();
    return s || PLACEHOLDER;
  } catch {
    return PLACEHOLDER;
  }
};

// Choose up to n random items from array using partial Fisher-Yates (O(n))
function pickRandom<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  if (len <= n) return arr.slice();
  const res = arr.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (len - i));
    [res[i], res[j]] = [res[j], res[i]];
  }
  return res.slice(0, n);
}

/* ---------- Banner component ---------- */
const Banner: React.FC = () => {
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [vendorSuggestionText, setVendorSuggestionText] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(true);
  const timersRef = useRef<{ slide?: number; message?: number }>({});
  const fetchAbortRef = useRef<AbortController | null>(null);
  const startedRef = useRef(false); // whether heavy work started (only once when visible)

  // precomputed collage styles (keeps same layout strings as your design)
  const defaultCollageStyles = useMemo(
    () => [
      ["top-[20%] left-1/2 w-[50vw] h-[90%] z-10 -translate-x-1/2 sm:w-[50%] sm:h-[90%]"],
      ["top-[10%] left-[-6%] w-[34vw] h-[80%] sm:w-[34%] sm:h-[80%]"],
      ["bottom-0 left-[6%] w-[34vw] h-[75%] sm:w-[34%] sm:h-[75%]"],
      ["top-[15%] right-[-6%] w-[34vw] h-[80%] sm:w-[34%] sm:h-[80%]"],
      ["top-[15%] left-1/2 w-[55vw] h-[90%] z-10 -translate-x-1/2 sm:w-[55%] sm:h-[90%]"],
      ["bottom-[5%] left-[0%] w-[38vw] h-[75%] sm:w-[38%] sm:h-[75%]"],
      ["top-[10%] right-[0%] w-[38vw] h-[70%] sm:w-[38%] sm:h-[70%]"],
      ["top-[12%] left-[10%] w-[40vw] h-[80%] z-10 sm:w-[40%] sm:h-[80%]"],
      ["bottom-0 right-[5%] w-[40vw] h-[75%] sm:w-[40%] sm:h-[75%]"],
      ["top-[18%] right-[20%] w-[35vw] h-[60%] sm:w-[35%] sm:h-[60%]"],
    ],
    []
  );

  // start/stop slide & message timers (kept in refs to avoid extra renders)
  const startTimers = useCallback(() => {
    // clear first
    stopTimers();

    timersRef.current.slide = window.setInterval(() => {
      setSlideIndex((s) => (s + 1) % SLIDE_COUNT);
    }, 10000);
    timersRef.current.message = window.setInterval(() => {
      setMessageIndex((s) => (s + 1) % messages.length);
    }, 10000);
  }, []);

  const stopTimers = useCallback(() => {
    if (timersRef.current.slide) {
      clearInterval(timersRef.current.slide);
      timersRef.current.slide = undefined;
    }
    if (timersRef.current.message) {
      clearInterval(timersRef.current.message);
      timersRef.current.message = undefined;
    }
  }, []);

  // small utility to safely call supabase/selects and fetch endpoints in parallel
  const fetchAll = useCallback(async () => {
    // guard: only run once
    if (startedRef.current) return;
    startedRef.current = true;

    fetchAbortRef.current = new AbortController();
    const signal = fetchAbortRef.current.signal;
    const mounted = mountedRef;

    try {
      const nowIso = new Date().toISOString();

      // Parallelize: fetch store products (api) + vendor_product (supabase) in parallel
      const productFetch = (async (): Promise<Product[]> => {
        try {
          const res = await fetch("/api/products", { signal });
          if (!res.ok) return [];
          const json = await res.json();
          return Array.isArray(json?.products) ? json.products : Array.isArray(json) ? json : [];
        } catch (e) {
          return [];
        }
      })();

      const vendorProductFetch = (async (): Promise<any[]> => {
        try {
          // first try featured
          const { data: featured, error: fErr } = await supabase
            .from("vendor_product")
            .select("*")
            .gt("featured_until", nowIso)
            .order("featured_at", { ascending: false })
            .limit(MAX_TILES);
          if (!fErr && Array.isArray(featured) && featured.length) return featured as any[];
          // fallback: recent
          const { data: recent, error: rErr } = await supabase
            .from("vendor_product")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(MAX_TILES);
          if (!rErr && Array.isArray(recent)) return recent as any[];
        } catch {
          // ignore
        }
        return [];
      })();

      const [storeProducts, vendorProducts] = await Promise.all([productFetch, vendorProductFetch]);

      // merge with vendor taking precedence using Map keyed by id-like string
      const mergedMap = new Map<string, any>();
      const idFor = (p: any, src: "vendor" | "store") => String(p?.id ?? p?._id ?? p?.product_id ?? `${src}-${Math.random().toString(36).slice(2, 9)}`);

      for (const p of vendorProducts) mergedMap.set(idFor(p, "vendor"), { ...p, __source: "vendor" });
      for (const p of storeProducts) {
        const k = idFor(p, "store");
        if (!mergedMap.has(k)) mergedMap.set(k, { ...p, __source: "store" });
      }

      const usableAll = Array.from(mergedMap.values()).filter(isImageLike);

      // pick up to MAX_TILES randomly (efficient)
      const picked = pickRandom(usableAll, MAX_TILES);

      // pad placeholders if needed
      while (picked.length < MAX_TILES) {
        picked.push({
          id: `placeholder-${picked.length}`,
          title: `Placeholder ${picked.length + 1}`,
          image: PLACEHOLDER,
          image_url: PLACEHOLDER,
          description: "",
          highlight: "",
          __source: "placeholder",
        } as unknown as Product);
      }

      // helper to get image for index
      const getImgFor = (idx: number) =>
        safeImage(
          (picked[idx] as any)?.image ??
            (picked[idx] as any)?.image_url ??
            (picked[idx] as any)?.photo ??
            (picked[idx] as any)?.photo_url ??
            (Array.isArray((picked[idx] as any)?.thumbnails) ? (picked[idx] as any).thumbnails[0] : null)
        );

      // Build 3 slides (same layout as before) but keep lightweight
      const structured: Slide[] = [
        {
          title: (picked[0] as any)?.title ?? "Spring Sale",
          highlight: (picked[0] as any)?.highlight ?? "50% Off",
          description: (picked[0] as any)?.description ?? "Don’t miss out on our exclusive seasonal discounts.",
          collage: [
            { src: getImgFor(0), style: defaultCollageStyles[0][0] },
            { src: getImgFor(1), style: defaultCollageStyles[1][0] },
            { src: getImgFor(2), style: defaultCollageStyles[2][0] },
            { src: getImgFor(3), style: defaultCollageStyles[3][0] },
          ],
        },
        {
          title: (picked[4] as any)?.title ?? "Upgrade Your Home",
          highlight: (picked[4] as any)?.highlight ?? "Save Big",
          description: (picked[4] as any)?.description ?? "Top appliances at unbeatable prices. Limited time!",
          collage: [
            { src: getImgFor(4), style: defaultCollageStyles[4][0] },
            { src: getImgFor(5), style: defaultCollageStyles[5][0] },
            { src: getImgFor(6), style: defaultCollageStyles[6][0] },
          ],
        },
        {
          title: (picked[8] as any)?.title ?? "New Arrivals",
          highlight: (picked[8] as any)?.highlight ?? "Fresh Looks",
          description: (picked[8] as any)?.description ?? "Check out the latest styles and trends now in stock.",
          collage: [
            { src: getImgFor(8), style: defaultCollageStyles[7][0] },
            { src: getImgFor(9), style: defaultCollageStyles[8][0] },
            { src: getImgFor(10), style: defaultCollageStyles[9][0] },
          ],
        },
      ];

      // vendor suggestion: quick best-effort (non-blocking)
      (async () => {
        try {
          const vendorRaw = await fetchVendorCandidateLight("mzazi");
          if (!vendorRaw) {
            if (mounted.current) setVendorSuggestionText(null);
            return;
          }
          const vendorId = vendorRaw.user_id ?? vendorRaw.vendor_id ?? vendorRaw.id;
          const vendorName =
            vendorRaw.vendor_name ?? vendorRaw.name ?? vendorRaw.raw_user_meta_data?.name ?? vendorRaw.raw_user_meta_data?.email ?? "This vendor";
          if (!vendorId) {
            if (mounted.current) setVendorSuggestionText(`A product from ${vendorName} — would you like to try their collection?`);
            return;
          }
          // try a short API call (non-fatal)
          try {
            const encoded = encodeURIComponent(String(vendorId).replace(/^['"]+|['"]+$/g, ""));
            const resp = await fetch(`${API_BASE}/api/vendor/${encoded}/products`, { signal });
            if (!resp.ok) {
              if (mounted.current) setVendorSuggestionText(`A product from ${vendorName} — would you like to try their collection?`);
            } else {
              const parsed = await resp.json();
              const count = Array.isArray(parsed?.products) ? parsed.products.length : 0;
              if (mounted.current)
                setVendorSuggestionText(
                  `A product from ${vendorName} — they have ${count} product${count === 1 ? "" : "s"}. Would you like to try their collection?`
                );
            }
          } catch {
            if (mounted.current) setVendorSuggestionText(`A product from ${vendorName} — would you like to try their collection?`);
          }
        } catch {
          if (mounted.current) setVendorSuggestionText(null);
        }
      })();

      if (mounted.current) setSlides(structured);

      // start timers now that content is ready
      startTimers();
    } catch (err) {
      // ignore or log
      // console.error("Banner fetch error:", err);
    }
  }, [defaultCollageStyles, startTimers]);

  // lightweight vendor candidate lookup: simplified & defensive compared to full original
  const fetchVendorCandidateLight = useCallback(async (nameQuery = "mzazi"): Promise<any | null> => {
    // small set of candidate tables to probe in order
    const candTables = [
      { tbl: "vendor_profiles_with_user", cols: "user_id, vendor_name, name, photo_url, banner_url, raw_user_meta_data" },
      { tbl: "vendor_profiles", cols: "id, vendor_name, name, photo_url, banner_url" },
      { tbl: "vendors", cols: "id, vendor_name, name, photo_url" },
    ];
    const pattern = `%${String(nameQuery)}%`;
    for (const cand of candTables) {
      try {
        const { data, error } = await supabase.from(cand.tbl).select(cand.cols).ilike("vendor_name", pattern).limit(1);
        if (!error && Array.isArray(data) && data.length) return data[0];
        // try name column as backup
        const { data: d2, error: e2 } = await supabase.from(cand.tbl).select(cand.cols).ilike("name", pattern).limit(1);
        if (!e2 && Array.isArray(d2) && d2.length) return d2[0];
      } catch {
        // continue
      }
    }
    return null;
  }, []);

  // intersection observer to defer fetching until visible
  useEffect(() => {
    mountedRef.current = true;
    const el = rootRef.current;
    if (!el) {
      // fallback: start immediately
      fetchAll().catch(() => {});
      return () => {
        mountedRef.current = false;
        stopTimers();
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            // start heavy work once
            fetchAll().catch(() => {});
            io.disconnect();
            break;
          }
        }
      },
      { root: null, rootMargin: "500px", threshold: 0.01 } // generous rootMargin to prefetch a bit before visible
    );
    io.observe(el);

    return () => {
      io.disconnect();
      mountedRef.current = false;
      stopTimers();
      if (fetchAbortRef.current) {
        fetchAbortRef.current.abort();
        fetchAbortRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAll, stopTimers]);

  // expose small controls: allow manual slide change (no heavy work)
  const handleSetSlide = useCallback((i: number) => {
    setSlideIndex(i % SLIDE_COUNT);
    // restart the interval to give the user time on the manual selection
    stopTimers();
    startTimers();
  }, [startTimers, stopTimers]);

  const currentSlide = slides?.[slideIndex] ?? {
    title: "Loading...",
    highlight: "0%",
    description: "Please wait while we load the latest offers.",
    collage: [],
  };
  const currentMessage = messages[messageIndex];

  return (
    <section ref={rootRef} className="w-full rounded-b-3xl overflow-hidden relative" role="region" aria-label="Promotional Banner">
      {/* decorative gradient blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 -top-36 w-[420px] h-[420px] rounded-full bg-gradient-to-tr from-green-200 to-green-400 opacity-30 blur-3xl transform rotate-12" />
        <div className="absolute -right-28 -bottom-36 w-[560px] h-[560px] rounded-full bg-gradient-to-br from-purple-300 to-indigo-400 opacity-20 blur-3xl transform -rotate-6" />
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 320" aria-hidden>
          <defs>
            <linearGradient id="g1" x1="0" x2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#f6fff5" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#g1)" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Left Text */}
          <div className="md:col-span-7 lg:col-span-6">
            <div className="backdrop-blur-sm">
              <GlassCard className="p-8 shadow-2xl">
                <h1 className="font-extrabold tracking-tight leading-tight text-4xl sm:text-5xl lg:text-6xl text-gray-900 dark:text-white">
                  {currentSlide.title}
                  <br className="hidden sm:inline" />
                  <span className="ml-1 inline-block bg-gradient-to-r from-green-600 to-emerald-400 text-white rounded-md px-3 py-1 text-2xl sm:text-3xl font-bold align-baseline shadow-lg">
                    Up to{" "}
                    <span className="text-white">{currentSlide.highlight}</span>
                  </span>
                </h1>

                <p className="mt-4 text-lg text-gray-700 dark:text-gray-300 max-w-xl">{currentSlide.description}</p>

                <div className="mt-6 flex flex-wrap gap-3 items-center">
                  <Link to="/products">
                    <Button className="px-8 py-3 rounded-full text-lg shadow-lg transform transition-transform duration-300 hover:-translate-y-1 hover:scale-102">
                      Shop Now
                    </Button>
                  </Link>

                  <div
                    className={`inline-flex items-center gap-3 px-4 py-2 rounded-full shadow-md transition-all duration-500 ${currentMessage.bgColor} ${currentMessage.textColor}`}
                    aria-live="polite"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M12 2v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M6 8v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M18 8v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="17" r="3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    <span className="text-sm font-medium">{currentMessage.text}</span>
                  </div>

                  {vendorSuggestionText && (
                    <div className="w-full mt-4 text-sm text-gray-700 dark:text-gray-300">
                      <strong>Featured:</strong>
                      <span className="ml-2">{vendorSuggestionText}</span>
                      <Link to="/vendors" className="ml-3 underline text-green-600 dark:text-green-400">
                        Browse vendors
                      </Link>
                    </div>
                  )}

                  {/* slide indicators */}
                  <div className="mt-6 flex items-center gap-2">
                    {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => handleSetSlide(i)}
                        className={`w-3 h-3 rounded-full transition-all duration-300 border ${slideIndex === i ? "bg-green-600 border-green-700 scale-110" : "bg-gray-300 dark:bg-gray-600 border-transparent"}`}
                        aria-label={`Go to slide ${i + 1}`}
                      />
                    ))}
                  </div>

                  {/* trust/feature cards */}
                  <div className="w-full mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <GlassCard className="flex items-center justify-center gap-3 p-3">
                      <ShieldCheck className="w-5 h-5 text-green-400" />
                      <div className="text-xs">Secure checkout</div>
                    </GlassCard>
                    <GlassCard className="flex items-center justify-center gap-3 p-3">
                      <Truck className="w-5 h-5 text-blue-400" />
                      <div className="text-xs">Free returns 30d</div>
                    </GlassCard>
                    <GlassCard className="flex items-center justify-center gap-3 p-3">
                      <Zap className="w-5 h-5 text-yellow-400" />
                      <div className="text-xs">Fast shipping</div>
                    </GlassCard>
                  </div>
                </div>
              </GlassCard>
            </div>
          </div>

          {/* Right Image Collage */}
          <div className="md:col-span-5 lg:col-span-6 flex justify-center">
            <div className="relative h-[420px] w-full max-w-[520px] overflow-visible">
              {currentSlide.collage.map((img, i) => (
                <img
                  key={i}
                  src={img.src}
                  alt={`slide-img-${i}`}
                  loading="lazy"
                  className={`absolute ${img.style} rounded-2xl object-cover shadow-2xl hover:scale-105 transform transition-all duration-500 ease-in-out ring-1 ring-white/40 dark:ring-black/30`}
                />
              ))}

              {currentSlide.collage.length === 0 && (
                <img src={PLACEHOLDER} alt="placeholder" loading="lazy" className="absolute left-0 right-0 top-0 bottom-0 m-auto rounded-2xl object-cover shadow-2xl" />
              )}

              {/* curated card (desktop) */}
              <div className="hidden md:flex absolute right-4 top-4 md:right-6 md:top-6 bg-[#d3d2d2] dark:bg-gray-950 backdrop-blur-md rounded-3xl p-4 shadow-2xl border border-white/30 dark:border-gray-800/40 w-56 z-30">
                <div className="flex items-start gap-3 w-full">
                  <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/50 dark:ring-black/40">
                    <img src={currentSlide.collage[0]?.src ?? PLACEHOLDER} alt="curated-thumb" className="w-full h-full object-cover" loading="lazy" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-500 dark:text-gray-300">Curated picks</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">Hand-picked for you</div>

                    <div className="mt-3 grid grid-cols-3 gap-1">
                      {currentSlide.collage.slice(0, 3).map((c, idx) => (
                        <div key={idx} className="w-full h-12 rounded-md overflow-hidden">
                          <img src={c.src} alt={`thumb-${idx}`} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex justify-between items-center">
                      <Link to="/products" className="text-xs font-medium text-green-600 dark:text-emerald-300 underline">Explore</Link>
                      <button className="bg-white/80 dark:bg-gray-800/60 px-2 py-1 rounded-md text-xs shadow-sm">View</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* curated pill (small screens) */}
              <div className="md:hidden absolute left-3 bottom-3 bg-white/90 dark:bg-gray-900/70 backdrop-blur-md rounded-full px-3 py-2 shadow-lg border border-white/20 dark:border-gray-800/30 z-30">
                <div className="flex items-center gap-2">
                  <img src={currentSlide.collage[0]?.src ?? PLACEHOLDER} alt="curated-sm" className="w-8 h-8 rounded-md object-cover ring-1 ring-white/40 dark:ring-black/30" loading="lazy" />
                  <div className="text-xs">
                    <div className="font-medium text-sm text-gray-900 dark:text-white">Curated picks</div>
                    <Link to="/products" className="text-xs text-green-600 dark:text-emerald-300 underline">Explore</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default React.memo(Banner);
