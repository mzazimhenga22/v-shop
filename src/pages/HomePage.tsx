// src/pages/HomePage.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Banner from "@/components/Banner";
import CategoryBanners from "@/components/CategoryBanners";
import FeaturedProducts from "@/components/FeaturedProducts";
import TopVendors from "@/components/TopVendors";
import CategoryCarousel from "@/components/CategoryCarousel";
import Promotions from "@/components/Promotions";
import CustomerTestimonials from "@/components/CustomerTestimonials";
import NewsletterSignup from "@/components/NewsletterSignup";
import RecentlyViewed from "@/components/RecentlyViewed";
import PromoBanner from "@/components/PromoBanner";
import ProductCard from "@/components/ProductCard";
import { supabase } from "@/lib/supabaseClient";

const API_BASE = (import.meta.env.VITE_API_BASE as string) || "http://localhost:4000";

// Shuffle helper
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

type VendorHit = {
  id: string;
  name: string;
  photo_url?: string | null;
  sourceTable?: string;
};

function ParticleCanvasController() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const particlesRef = useRef<any[]>([]);
  const lastActivityRef = useRef<number>(Date.now());
  const hoveringRef = useRef<boolean>(false);
  const visibilityRef = useRef<boolean>(!document.hidden);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) return;

    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    let dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
    const FRAME_CAP = 45;
    const FRAME_INTERVAL = 1000 / FRAME_CAP;
    const IDLE_MS = 2000;
    const MAX_PARTICLES = 60;
    const SPAWN_RATE_WHEN_IDLE = 0.12;
    const SPAWN_RATE_WHEN_ACTIVE = 0.01;
    const GRAVITY = 0.02;
    const WIND_VARIANCE = 0.03;

    const COLORS_LIGHT = [
      "rgba(255,255,255,0.18)",
      "rgba(255,255,255,0.12)",
      "rgba(255,255,255,0.08)",
      "rgba(255,255,255,0.06)",
    ];
    const COLORS_DARK = [
      "rgba(255,255,255,0.16)",
      "rgba(255,255,255,0.10)",
      "rgba(255,255,255,0.06)",
      "rgba(255,255,255,0.04)",
    ];

    let lastResize = 0;
    function resizeCanvas() {
      const el = canvasEl;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width * dpr));
      const h = Math.max(200, Math.floor(rect.height * dpr));
      if (el.width !== w || el.height !== h) {
        el.width = w;
        el.height = h;
        ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }

    resizeCanvas();

    const onResize = () => {
      const now = performance.now();
      if (now - lastResize < 120) return;
      lastResize = now;
      dpr = Math.max(1, Math.min(1.5, window.devicePixelRatio || 1));
      resizeCanvas();
    };
    window.addEventListener("resize", onResize);

    const activity = () => {
      lastActivityRef.current = Date.now();
    };
    const activityOptions = { passive: true } as AddEventListenerOptions;
    window.addEventListener("mousemove", activity, activityOptions);
    window.addEventListener("touchstart", activity, activityOptions);
    window.addEventListener("keydown", activity, activityOptions);

    const onParticlesHover = (ev: Event) => {
      const custom = ev as CustomEvent<boolean>;
      hoveringRef.current = !!custom.detail;
    };
    window.addEventListener("particles-hover", onParticlesHover as EventListener);

    const onVisibilityChange = () => {
      visibilityRef.current = !document.hidden;
      if (!visibilityRef.current && rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (visibilityRef.current && !rafRef.current) {
        lastFrame = performance.now();
        rafRef.current = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const rand = (a: number, b?: number) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
    const choose = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    function spawnParticle(width: number, height: number) {
      if (particlesRef.current.length >= MAX_PARTICLES) return;
      const dark =
        document.documentElement.classList.contains("dark") ||
        (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const colors = dark ? COLORS_DARK : COLORS_LIGHT;
      const size = rand(6, 14);
      const shape = Math.random() < 0.55 ? "circle" : "rect";
      const x = rand(0, width);
      const y = rand(-40, -8);
      const vx = rand(-0.25, 0.25);
      const vy = rand(0.2, 0.6);
      const life = rand(4000, 9000);
      const color = choose(colors);
      const rotation = rand(0, Math.PI * 2);
      const particle = {
        x,
        y,
        vx,
        vy,
        size,
        shape,
        color,
        life,
        birth: Date.now(),
        rotation,
        wobble: rand(0.02, 0.06),
      };
      particlesRef.current.push(particle);
    }

    function drawRoundedRect(ctxInner: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
      const min = Math.min(w, h) / 2;
      if (r > min) r = min;
      ctxInner.beginPath();
      ctxInner.moveTo(x + r, y);
      ctxInner.arcTo(x + w, y, x + w, y + h, r);
      ctxInner.arcTo(x + w, y + h, x, y + h, r);
      ctxInner.arcTo(x, y + h, x, y, r);
      ctxInner.arcTo(x, y, x + w, y, r);
      ctxInner.closePath();
      ctxInner.fill();
    }

    let lastFrame = performance.now();
    let lastRenderTime = performance.now();

    function frame(now: number) {
      const dt = now - lastFrame;
      lastFrame = now;

      if (now - lastRenderTime < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }
      lastRenderTime = now;

      if (window.innerWidth < 720) {
        ctx!. clearRect(0, 0, ctx!. canvas.width, ctx!. canvas.height);
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const width = ctx!. canvas.clientWidth;
      const height = ctx!. canvas.clientHeight;

      ctx!. clearRect(0, 0, width, height);

      const idle = Date.now() - lastActivityRef.current > IDLE_MS;
      const hovering = hoveringRef.current;
      const shouldSpawn = idle && !hovering;
      const spawnChance = shouldSpawn ? SPAWN_RATE_WHEN_IDLE : SPAWN_RATE_WHEN_ACTIVE;

      if (particlesRef.current.length < MAX_PARTICLES && Math.random() < spawnChance) {
        spawnParticle(width, height);
      }

      const toKeep: any[] = [];
      for (const p of particlesRef.current) {
        p.vx += Math.sin((now + (p.birth % 1000)) * p.wobble) * WIND_VARIANCE * 0.06;
        p.vy = Math.min(1.8, p.vy + GRAVITY * (dt / 16));

        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.rotation += 0.002 * (p.vx || 0);

        const age = now - p.birth;
        const lifeRatio = Math.max(0, Math.min(1, age / p.life));
        const alpha = 1 - lifeRatio;
        if (alpha <= 0.03) continue;

        ctx!. save();
        ctx!. globalAlpha = alpha;
        ctx!. shadowColor = p.color;
        ctx!. shadowBlur = Math.min(14, 4 + (1 - lifeRatio) * 10);
        ctx!. translate(p.x, p.y);
        ctx!. rotate(p.rotation);
        ctx!. fillStyle = p.color;

        if (p.shape === "circle") {
          ctx!. beginPath();
          ctx!. arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx!. fill();
        } else {
          drawRoundedRect(ctx!, -p.size / 2, -Math.max(6, p.size / 2), p.size * 1.1, Math.max(6, p.size * 0.9), 6);
        }
        ctx!. restore();

        if (p.y < height + 60 && age < p.life + 800) {
          toKeep.push(p);
        }
      }

      particlesRef.current = toKeep;
      rafRef.current = requestAnimationFrame(frame);
    }

    if (visibilityRef.current) rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", activity);
      window.removeEventListener("touchstart", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("particles-hover", onParticlesHover as EventListener);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 w-full h-full z-0"
      aria-hidden
      style={{ willChange: "transform" }}
    />
  );
}

export default function HomePage() {
  const [shuffledSections, setShuffledSections] = useState<React.ReactNode[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  // Search result state
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<string | null>(null); // "product" | "vendor" | null
  const [searchId, setSearchId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<VendorHit[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);

  // category / initialProducts coming from navigation (Navbar)
  const [categoryParam, setCategoryParam] = useState<string | null>(null);
  const [initialProductsState, setInitialProductsState] = useState<any[] | null>(null);

  // shuffle sections once
  useEffect(() => {
    const componentsToShuffle: React.ReactNode[] = [
      <FeaturedProducts key="FeaturedProducts" />,
      <PromoBanner key="PromoBanner" />,
      <TopVendors key="TopVendors" />,
      <Promotions key="Promotions" />,
      <RecentlyViewed key="RecentlyViewed" />,
      <CategoryCarousel key="CategoryCarousel" />,
    ];

    setShuffledSections(shuffleArray(componentsToShuffle));
  }, []);

  // parse query params on load / change, AND accept initialProducts via location.state
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    const t = params.get("type"); // "product" or "vendor"
    const id = params.get("id");
    const cat = params.get("category");
    setSearchQuery(q);
    setSearchType(t);
    setSearchId(id);
    setCategoryParam(cat);

    // Accept initialProducts passed in navigation state from Navbar (prefer it if non-empty)
    const navState: any = (location.state as any) ?? null;
    if (navState && Array.isArray(navState.initialProducts) && navState.initialProducts.length > 0) {
      setInitialProductsState(navState.initialProducts);
      setProducts(navState.initialProducts);
      setVendors([]);
      setSearchMessage(null);
    } else {
      // clear previous state; if there's a category param we will fetch below
      setInitialProductsState(null);
      setProducts([]);
      setVendors([]);
      setSearchMessage(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, location.state]);

  // helper: dedupe products by id
  const dedupeById = (arr: any[]) => {
    const m = new Map<string, any>();
    for (const it of arr) {
      const k = String(it.id ?? it._sourceKey ?? `${Math.random()}`);
      if (!m.has(k)) m.set(k, it);
    }
    return Array.from(m.values());
  };

  // If category param present but we don't have initialProductsState, fetch here.
  useEffect(() => {
    let cancelled = false;
    const cat = categoryParam?.trim();
    if (!cat) return;

    // if we already have initial products from nav state, don't re-fetch
    if (initialProductsState && initialProductsState.length > 0) return;

    (async () => {
      setLoadingSearch(true);
      setSearchMessage(null);
      try {
        // reuse the same approach your Navbar used: query both tables
        const pattern = `%${cat}%`;
        const productLimit = 300;

        const q1 = supabase.from("products").select("*").or(`category.ilike.${pattern},categories.ilike.${pattern},tags.ilike.${pattern},name.ilike.${pattern}`).limit(productLimit);
        const q2 = supabase.from("vendor_product").select("*").or(`category.ilike.${pattern},categories.ilike.${pattern},tags.ilike.${pattern},name.ilike.${pattern}`).limit(productLimit);

        const [resA, resB] = await Promise.all([q1, q2]);

        if (cancelled) return;

        const aRows = Array.isArray(resA.data) ? resA.data : [];
        const bRows = Array.isArray(resB.data) ? resB.data : [];

        const combined = [
          ...aRows.map((r: any) => ({ ...r, sourceTable: "products", _sourceKey: `product:${r.id}` })),
          ...bRows.map((r: any) => ({ ...r, sourceTable: "vendor_product", _sourceKey: `vendor_product:${r.id}` })),
        ];

        const deduped = dedupeById(combined);
        setProducts(deduped);

        if (deduped.length === 0) {
          setSearchMessage(`No products found for ${cat}.`);
        } else {
          setSearchMessage(null);
        }
      } catch (err) {
        console.error("Error fetching category products on Home:", err);
        if (!cancelled) {
          setProducts([]);
          setSearchMessage("Error fetching category products.");
        }
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categoryParam, initialProductsState]);

  // Main search effect: runs when searchQuery/type/id change
  useEffect(() => {
    let cancelled = false;
    const q = searchQuery?.trim() ?? "";
    const t = searchType;
    const id = searchId;

    // If initialProductsState is provided (from Navbar), prefer that and skip remote fetch
    if (initialProductsState && initialProductsState.length > 0) {
      setLoadingSearch(false);
      setVendors([]);
      return () => {
        cancelled = true;
      };
    }

    const fetchVendorProductsPublic = async (vendorId: string) => {
      try {
        setLoadingSearch(true);
        setSearchMessage(null);
        const encoded = encodeURIComponent(vendorId);
        const res = await fetch(`${API_BASE}/api/vendor/${encoded}/products`);
        if (!res.ok) {
          const text = await res.text();
          console.warn("Vendor products fetch error:", text);
          setProducts([]);
          setVendors([]);
          setSearchMessage("No products found for this vendor.");
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        const found = Array.isArray(data.products) ? data.products : [];
        setProducts(found);
        setVendors([]);
        if (found.length === 0) setSearchMessage("No products found for this vendor.");
      } catch (err) {
        console.error("Error fetching vendor products:", err);
        if (!cancelled) {
          setProducts([]);
          setVendors([]);
          setSearchMessage("Error fetching vendor products.");
        }
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    };

    const searchBothProductsTables = async (pattern: string) => {
      try {
        setLoadingSearch(true);
        setSearchMessage(null);

        const productLimit = 50;
        const patternLike = `%${pattern}%`;

        const promises: Promise<any>[] = [];
        promises.push(
          (async () => {
            try {
              const { data, error } = await supabase
                .from("products")
                .select("*")
                .ilike("name", patternLike)
                .limit(productLimit);
              if (error) {
                console.warn("products search error:", error.message ?? error);
                return [];
              }
              return Array.isArray(data) ? data : [];
            } catch (e) {
              console.warn("products unexpected error:", e);
              return [];
            }
          })()
        );

        promises.push(
          (async () => {
            try {
              const { data, error } = await supabase
                .from("vendor_product")
                .select("*")
                .ilike("name", patternLike)
                .limit(productLimit);
              if (error) {
                console.warn("vendor_product search error:", error.message ?? error);
                return [];
              }
              return Array.isArray(data) ? data : [];
            } catch (e) {
              console.warn("vendor_product unexpected error:", e);
              return [];
            }
          })()
        );

        const [prodA, prodB] = await Promise.all(promises);
        if (cancelled) return;
        let merged = [...(prodA ?? []), ...(prodB ?? [])];
        merged = dedupeById(merged);
        setProducts(merged);
        if (merged.length === 0) setSearchMessage("No products match your search.");
      } catch (err) {
        console.error("Error searching products:", err);
        if (!cancelled) {
          setProducts([]);
          setSearchMessage("Error searching products.");
        }
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    };

    const searchVendorsCandidateTables = async (pattern: string) => {
      try {
        setLoadingSearch(true);
        setSearchMessage(null);
        const vendorLimit = 30;
        const patternLike = `%${pattern}%`;

        const vendorCandidates = [
          { tbl: "vendor", cols: "id,name,photo_url,vendor_name" },
          { tbl: "vendors", cols: "id,name,photo_url,vendor_name" },
          { tbl: "vendor_profiles_with_user", cols: "user_id, vendor_name, photo_url, raw_user_meta_data" },
          { tbl: "vendor_profiles", cols: "id, photo_url, banner_url" },
        ];

        const hits: VendorHit[] = [];

        for (const cand of vendorCandidates) {
          try {
            const orExpr = `(name.ilike.%${pattern}%,vendor_name.ilike.%${pattern}%,raw_user_meta_data->>name.ilike.%${pattern}%)`;
            let data: any;
            let error: any;
            try {
              ({ data, error } = await supabase.from(cand.tbl).select(cand.cols).or(orExpr).limit(vendorLimit));
            } catch (e) {
              ({ data, error } = await supabase.from(cand.tbl).select(cand.cols).ilike("name", patternLike).limit(vendorLimit));
            }
            if (error) {
              console.warn(`${cand.tbl} vendor search error:`, error.message ?? error);
              continue;
            }
            if (!Array.isArray(data) || data.length === 0) continue;

            for (const r of data) {
              const id = r.id ?? r.user_id ?? r.id;
              const name = r.vendor_name ?? r.name ?? r.raw_user_meta_data?.name ?? `Vendor ${id}`;
              hits.push({
                id,
                name,
                photo_url: r.photo_url ?? null,
                sourceTable: cand.tbl,
              });
            }
          } catch (err) {
            console.warn("vendor candidate search error (ignored):", cand.tbl, err);
            continue;
          }
        }

        if (!cancelled) {
          const map = new Map<string, VendorHit>();
          for (const h of hits) {
            const k = String(h.id);
            if (!map.has(k)) map.set(k, h);
          }
          const deduped = Array.from(map.values());
          setVendors(deduped);
          if (deduped.length === 0) setSearchMessage("No vendors match your search.");
        }
      } catch (err) {
        console.error("Error searching vendors:", err);
        if (!cancelled) {
          setVendors([]);
          setSearchMessage("Error searching vendors.");
        }
      } finally {
        if (!cancelled) setLoadingSearch(false);
      }
    };

    // Decide what to fetch
    if (t === "vendor" && id) {
      fetchVendorProductsPublic(id);
      return () => {
        cancelled = true;
      };
    }

    if (t === "product" && id) {
      (async () => {
        try {
          setLoadingSearch(true);
          setSearchMessage(null);

          const { data: pA, error: errA } = await supabase.from("products").select("*").eq("id", id).limit(1);
          if (!errA && Array.isArray(pA) && pA.length > 0) {
            if (!cancelled) {
              setProducts(pA);
              setVendors([]);
            }
            return;
          }

          const { data: pB, error: errB } = await supabase.from("vendor_product").select("*").eq("id", id).limit(1);
          if (!errB && Array.isArray(pB) && pB.length > 0) {
            if (!cancelled) {
              setProducts(pB);
              setVendors([]);
            }
            return;
          }

          if (!cancelled) {
            setProducts([]);
            setVendors([]);
            setSearchMessage("Product not found");
          }
        } catch (err) {
          console.error("Error fetching product by id:", err);
          if (!cancelled) {
            setProducts([]);
            setVendors([]);
            setSearchMessage("Error fetching product");
          }
        } finally {
          if (!cancelled) setLoadingSearch(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (q && q.length > 1) {
      (async () => {
        setLoadingSearch(true);
        setSearchMessage(null);
        setProducts([]);
        setVendors([]);
        try {
          await Promise.all([searchBothProductsTables(q), searchVendorsCandidateTables(q)]);
        } finally {
          if (!cancelled) setLoadingSearch(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // default: clear results
    setProducts([]);
    setVendors([]);
    setSearchMessage(null);
    return () => {
      cancelled = true;
    };
  }, [searchQuery, searchType, searchId, initialProductsState]);

  // Treat category param / initialProducts as a "search" (so UI shows results panel)
  const hasSearch = useMemo(
    () =>
      !!(searchQuery && searchQuery.trim().length > 0) ||
      !!(categoryParam && categoryParam.trim().length > 0) ||
      !!(initialProductsState && initialProductsState.length > 0),
    [searchQuery, categoryParam, initialProductsState]
  );

  const mainRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;

    const onEnter = () => {
      const ev = new CustomEvent("particles-hover", { detail: true });
      window.dispatchEvent(ev);
    };
    const onLeave = () => {
      const ev = new CustomEvent("particles-hover", { detail: false });
      window.dispatchEvent(ev);
    };

    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);

    return () => {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  useEffect(() => {
    const updateHeaderVar = () => {
      const header = document.querySelector("header");
      if (!header) return;
      const hh = Math.round((header as HTMLElement).getBoundingClientRect().height);
      document.documentElement.style.setProperty("--header-height", `${hh}px`);
    };
    updateHeaderVar();
    const ro = new ResizeObserver(updateHeaderVar);
    const hEl = document.querySelector("header");
    if (hEl) ro.observe(hEl);
    window.addEventListener("resize", updateHeaderVar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", updateHeaderVar);
    };
  }, []);

  return (
    <div className="relative transition-colors duration-300 min-h-screen" ref={mainRef} style={{ paddingTop: "var(--header-height, 72px)" }}>
      <ParticleCanvasController />

      <Banner />
      <main className="px-6 pt-0 pb-10 space-y-10">
        <CategoryBanners />

        {hasSearch ? (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                {categoryParam ? `Search results for "${categoryParam}"` : searchQuery ? `Search results for "${searchQuery}"` : "Search results"}
              </h2>
              <div className="text-sm text-gray-500">{loadingSearch ? "Searching..." : `${products.length} products • ${vendors.length} vendors`}</div>
            </div>

            {searchMessage && <div className="text-sm text-gray-500">{searchMessage}</div>}

            {vendors.length > 0 && (
              <div>
                <h3 className="text-lg font-medium mb-2">Vendors</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {vendors.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        navigate(`/vendor/${v.id}`);
                      }}
                      className="cursor-pointer p-3 border rounded-md flex flex-col items-center gap-2 hover:shadow-md transition"
                    >
                      <img src={v.photo_url ?? "/placeholder-avatar.png"} alt={v.name} className="w-20 h-20 rounded-full object-cover" />
                      <div className="text-sm font-medium text-center truncate">{v.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {products.length > 0 ? (
              <div>
                <h3 className="text-lg font-medium mb-2">Products</h3>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((p) => (
                    <ProductCard key={p.id ?? p._sourceKey ?? JSON.stringify(p)} product={p} />
                  ))}
                </div>
              </div>
            ) : (
              !loadingSearch && <div className="text-sm text-gray-500">No products found.</div>
            )}
          </section>
        ) : (
          <>
            {shuffledSections}
            <CustomerTestimonials />
            <NewsletterSignup />
          </>
        )}
      </main>
    </div>
  );
}
