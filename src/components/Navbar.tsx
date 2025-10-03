// src/components/Navbar.tsx
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  User,
  Store,
  HelpCircle,
  Phone,
  Info,
  LogOut,
  Search,
  X,
  Bell,
  Package,
  Menu,
} from "lucide-react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "@/context/CartContext";
import { useNotification } from "@/context/NotificationContext";
import { supabase } from "@/lib/supabaseClient";
import FireLottie from "@/components/FireLottie";
import { useCategories } from "@/context/CategoryContext";
import axios from "axios";

const TRANSITION_MS = 2500;

const Navbar: React.FC = () => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const { cart } = useCart();
  const { notificationCount } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isVendor, setIsVendor] = useState(false);

  // Categories (for drawer)
  const { categories } = useCategories();

  // Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const [drawerSearch, setDrawerSearch] = useState("");
  const [showAllGeneral, setShowAllGeneral] = useState(false);
  const [showAllShopBy, setShowAllShopBy] = useState(false);

  // category fetch loading state
  const [categoryLoading, setCategoryLoading] = useState(false);

  // Search state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // debounce
  const debounceRef = useRef<number | null>(null);
  const latestQueryId = useRef<number>(0);

  // header/subnav refs & sizes — used to dock the subnav exactly under header
  const headerRef = useRef<HTMLElement | null>(null);
  const headerHeightRef = useRef<number>(0);
  const subnavRef = useRef<HTMLDivElement | null>(null);
  const subnavHeightRef = useRef<number>(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [subnavHeight, setSubnavHeight] = useState(0);

  // sentinel used by IntersectionObserver (added below in JSX)
  const headerSentinelRef = useRef<HTMLDivElement | null>(null);

  // Subnav behavior states
  const [isSubnavDocked, setIsSubnavDocked] = useState(false);
  const [isSubnavHidden, setIsSubnavHidden] = useState(false);
  const lastScrollY = useRef<number>(0);
  const ticking = useRef<boolean>(false);
  const prevDockedRef = useRef<boolean>(isSubnavDocked);
  const prevHiddenRef = useRef<boolean>(isSubnavHidden);

  // Cart popover states (anchored to header cart button)
  const [isCartOpen, setIsCartOpen] = useState(false);
  const cartRef = useRef<HTMLDivElement | null>(null);
  const prevCartCount = useRef<number>(cartCount);
  const [cartPulse, setCartPulse] = useState(false);

  useEffect(() => {
    const getUserAndVendorStatus = async () => {
      try {
        await supabase.auth.refreshSession();
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const userName = session.user.user_metadata?.name || session.user.email;
          setUser(userName);
          setIsAdmin(!!session.user.user_metadata?.isAdmin);

          let vendorFound = false;
          try {
            const { data: vendorData, error: vendorError } = await supabase
              .from("vendor")
              .select("*")
              .eq("user_id", session.user.id)
              .maybeSingle();

            if (!vendorError && vendorData) {
              vendorFound = true;
            } else {
              const { data: vendorData2, error: vendorError2 } = await supabase
                .from("vendor_profiles_with_user")
                .select("*")
                .eq("user_id", session.user.id)
                .maybeSingle();

              if (!vendorError2 && vendorData2) {
                vendorFound = true;
              }
            }
          } catch (err) {
            console.warn("vendor lookup error:", err);
            vendorFound = false;
          }
          setIsVendor(!!vendorFound);
        }
      } catch (err) {
        console.warn("session refresh error:", err);
      }
    };

    getUserAndVendorStatus();

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsSearchOpen(false);
        setSuggestions([]);
        setIsDrawerOpen(false);
        setIsCartOpen(false);
        setIsDropdownOpen(false);
        setIsMoreOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Close overlays on route change (helps prevent "stuck" states)
  useEffect(() => {
    setIsSearchOpen(false);
    setIsDrawerOpen(false);
    setIsCartOpen(false);
    setIsDropdownOpen(false);
    setIsMoreOpen(false);
    setSuggestions([]);
  }, [location.pathname]);

  const handleClickOutside = (e: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
      setIsSearchOpen(false);
      setSuggestions([]);
    }

    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      setIsDrawerOpen(false);
    }

    if (cartRef.current && !cartRef.current.contains(e.target as Node)) {
      setIsCartOpen(false);
    }
  };

  useEffect(() => {
    if (isSearchOpen || isDrawerOpen || isCartOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isSearchOpen, isDrawerOpen, isCartOpen]);

  // Lock body scroll when drawer open (full panel)
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.classList.add("overflow-hidden");
    } else {
      document.body.classList.remove("overflow-hidden");
    }
  }, [isDrawerOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    navigate("/signin");
  };

  // compute heights for docking
  useLayoutEffect(() => {
    const compute = () => {
      const hh = headerRef.current?.getBoundingClientRect().height ?? 0;
      const sh = subnavRef.current?.getBoundingClientRect().height ?? 0;
      setHeaderHeight(hh);
      headerHeightRef.current = hh;
      setSubnavHeight(sh);
      subnavHeightRef.current = sh;
    };
    compute();

    const ro = new ResizeObserver(() => compute());
    if (headerRef.current) ro.observe(headerRef.current);
    if (subnavRef.current) ro.observe(subnavRef.current);

    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, []);

  // Subnav scroll/dock logic (rewritten: IntersectionObserver + rAF scroll handler)
  const idleTimerRef = useRef<number | null>(null);
  const REVEAL_DELAY = 2500;

  useEffect(() => {
    // initialize
    lastScrollY.current = window.scrollY;
    prevDockedRef.current = isSubnavDocked;
    prevHiddenRef.current = isSubnavHidden;

    let rafId: number | null = null;
    let io: IntersectionObserver | null = null;

    const sentinel = headerSentinelRef.current;

    // IntersectionObserver to decide docking when sentinel exists
    if (sentinel) {
      try {
        io = new IntersectionObserver(
          (entries) => {
            const e = entries[0];
            // When sentinel is out of view (intersectionRatio === 0) -> dock
            const shouldDock = e.intersectionRatio === 0;
            if (prevDockedRef.current !== shouldDock) {
              prevDockedRef.current = shouldDock;
              setIsSubnavDocked(shouldDock);
            }
          },
          {
            root: null,
            threshold: [0, 0.01, 1],
            rootMargin: `-${Math.max(0, headerHeightRef.current - 2)}px 0px 0px 0px`,
          }
        );
        io.observe(sentinel);
      } catch (err) {
        // IntersectionObserver may fail in some envs; fallback to scroll math below
        io = null;
      }
    }

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        const currentY = window.scrollY;
        const headerH = headerHeightRef.current ?? 0;

        // Determine shouldDock: if we don't have IO, compute from header height
        const shouldDock = io ? prevDockedRef.current : currentY >= Math.max(24, Math.round(headerH - 2));

        const delta = currentY - lastScrollY.current;
        const isDown = delta > 0;
        const isUp = delta < 0;

        if (isDown && currentY > headerH + 20) {
          if (!prevHiddenRef.current) {
            prevHiddenRef.current = true;
            setIsSubnavHidden(true);
          }

          if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
          }
          idleTimerRef.current = window.setTimeout(() => {
            prevHiddenRef.current = false;
            setIsSubnavHidden(false);
            idleTimerRef.current = null;
          }, REVEAL_DELAY);
        } else if (isUp) {
          if (idleTimerRef.current) {
            window.clearTimeout(idleTimerRef.current);
            idleTimerRef.current = null;
          }
          if (prevHiddenRef.current) {
            prevHiddenRef.current = false;
            setIsSubnavHidden(false);
          }
        }

        if (prevDockedRef.current !== shouldDock) {
          prevDockedRef.current = shouldDock;
          setIsSubnavDocked(shouldDock);
        }

        lastScrollY.current = currentY;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      if (io && sentinel) {
        try {
          io.unobserve(sentinel);
          io.disconnect();
        } catch (e) {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerHeight]);

  // Cart pulse when count increases
  useEffect(() => {
    if (prevCartCount.current < cartCount) {
      setCartPulse(true);
      const t = window.setTimeout(() => setCartPulse(false), 600);
      return () => window.clearTimeout(t);
    }
    prevCartCount.current = cartCount;
  }, [cartCount]);

  // ---------------------------
  //  Search suggestions
  // ---------------------------
  async function fetchSuggestionsFromSupabase(q: string, thisQueryId: number) {
    if (!q || q.trim().length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);

    const productLimit = 6;
    const vendorProductLimit = 6;
    const vendorLimit = 6;
    const pattern = `%${q}%`;

    const queries = [
      (async () => {
        try {
          const { data, error } = await supabase
            .from("products")
            .select("id,name,price,image")
            .ilike("name", pattern)
            .limit(productLimit);

          if (error) {
            console.warn("products search error:", error.message ?? error);
            return [];
          }
          return (Array.isArray(data) ? data : []).map((r: any) => ({
            type: "product" as const,
            id: r.id,
            name: r.name,
            image: r.image ?? null,
            price: typeof r.price === "number" ? r.price : r.price ? Number(r.price) : null,
            sourceTable: "products",
          }));
        } catch (err) {
          console.warn("products search unexpected error:", err);
          return [];
        }
      })(),

      (async () => {
        try {
          const { data, error } = await supabase
            .from("vendor_product")
            .select("id,name,price,image")
            .ilike("name", pattern)
            .limit(vendorProductLimit);

          if (error) {
            console.warn("vendor_product search error:", error.message ?? error);
            return [];
          }
          return (Array.isArray(data) ? data : []).map((r: any) => ({
            type: "product" as const,
            id: r.id,
            name: r.name,
            image: r.image ?? null,
            price: typeof r.price === "number" ? r.price : r.price ? Number(r.price) : null,
            sourceTable: "vendor_product",
          }));
        } catch (err) {
          console.warn("vendor_product search unexpected error:", err);
          return [];
        }
      })(),

      (async () => {
        const vendorCandidates = [
          { tbl: "vendor", cols: "id,name,photo_url,vendor_name" },
          { tbl: "vendors", cols: "id,name,photo_url,vendor_name" },
          { tbl: "vendor_profiles_with_user", cols: "user_id,vendor_name,photo_url" },
          { tbl: "vendor_profiles", cols: "id,photo_url,banner_url" },
        ];

        for (const cand of vendorCandidates) {
          try {
            const orExpr = `(name.ilike.${pattern},vendor_name.ilike.${pattern},vendor_name.ilike.${pattern},user_id.ilike.${pattern})`;
            const builder = supabase.from(cand.tbl).select(cand.cols);
            let data: any;
            let error: any;
            try {
              ({ data, error } = await builder.or(orExpr).limit(vendorLimit));
            } catch (e) {
              ({ data, error } = await builder.ilike("name", pattern).limit(vendorLimit));
            }

            if (error) {
              console.warn(`${cand.tbl} search error:`, error.message ?? error);
              continue;
            }
            if (!Array.isArray(data) || data.length === 0) continue;

            return data.map((r: any) => {
              const id = r.id ?? r.user_id ?? r.id;
              const name = r.vendor_name ?? r.name ?? r.email ?? r.raw_user_meta_data?.name ?? null;
              return {
                type: "vendor" as const,
                id,
                name: name ?? `Vendor ${id}`,
                image: r.photo_url ?? null,
                sourceTable: cand.tbl,
              };
            });
          } catch (err) {
            console.warn("vendor candidate error (ignored):", cand.tbl, err);
            continue;
          }
        }
        return [];
      })(),
    ];

    try {
      const settled = await Promise.all(queries);
      if (latestQueryId.current !== thisQueryId) return;

      const flat = settled.flat() as any[];
      const dedupeMap = new Map<string, any>();
      for (const s of flat) {
        const key = `${s.type}:${s.id}`;
        if (!dedupeMap.has(key)) dedupeMap.set(key, s);
      }

      const combined = Array.from(dedupeMap.values());

      combined.sort((a, b) => {
        if (a.type === b.type) return 0;
        return a.type === "product" ? -1 : 1;
      });

      setSuggestions(combined.slice(0, 12));
    } catch (err) {
      console.error("Error fetching suggestions:", err);
    } finally {
      if (latestQueryId.current === thisQueryId) {
        setLoadingSuggestions(false);
        setHighlightIndex(-1);
      }
    }
  }

  // Debounced effect: when query changes fetch suggestions
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    if (query && query.trim().length > 0) {
      setIsSearchOpen(true);
    }

    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const id = ++latestQueryId.current;
    debounceRef.current = window.setTimeout(() => {
      fetchSuggestionsFromSupabase(q, id);
    }, 300);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // keyboard navigation
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions || suggestions.length === 0) {
      if (e.key === "Enter" && query.trim().length > 0) {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        setIsSearchOpen(false);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = suggestions[highlightIndex >= 0 ? highlightIndex : 0];
      if (s) {
        if (s.type === "product") {
          navigate(`/product/${s.id}`);
        } else {
          navigate(`/vendor/${s.id}`);
        }
        setIsSearchOpen(false);
        setSuggestions([]);
      } else {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        setIsSearchOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
      setSuggestions([]);
    }
  };

  // Build params and navigate to home (keeps existing behavior)
  const onSuggestionClick = (s: any) => {
    const params = new URLSearchParams();
    if ((s as any).name) params.set("q", String((s as any).name));
    params.set("type", s.type);
    params.set("id", String(s.id));
    if ((s as any).sourceTable) params.set("source", String((s as any).sourceTable));
    navigate(`/?${params.toString()}`);
    setIsSearchOpen(false);
    setSuggestions([]);
  };

  // ---------------------------
  // Category fetch: query both products & vendor_product by category-like fields,
  // dedupe and navigate to / (home) with results in location.state.initialProducts
  // ---------------------------
  async function fetchProductsByCategory(category: string) {
    setCategoryLoading(true);
    try {
      const pattern = `*${category}*`; // PostgREST ilike wildcard with asterisks

      // Query both tables and combine
      const [prodResp, vendorResp] = await Promise.all([
        supabase
          .from("products")
          .select("*")
          .or(`category.ilike.${pattern},categories.ilike.${pattern},tags.ilike.${pattern},name.ilike.${pattern}`)
          .limit(300),
        supabase
          .from("vendor_product")
          .select("*")
          .or(`category.ilike.${pattern},categories.ilike.${pattern},tags.ilike.${pattern},name.ilike.${pattern}`)
          .limit(300),
      ]);

      const results: any[] = [];
      if (!prodResp.error && Array.isArray(prodResp.data)) {
        results.push(
          ...prodResp.data.map((r) => ({ ...r, sourceTable: "products", _sourceKey: `products:${r.id}` }))
        );
      } else if (prodResp.error) {
        console.warn("products query warning:", prodResp.error.message ?? prodResp.error);
      }

      if (!vendorResp.error && Array.isArray(vendorResp.data)) {
        results.push(
          ...vendorResp.data.map((r) => ({ ...r, sourceTable: "vendor_product", _sourceKey: `vendor_product:${r.id}` }))
        );
      } else if (vendorResp.error) {
        console.warn("vendor_product query warning:", vendorResp.error.message ?? vendorResp.error);
      }

      // dedupe by _sourceKey or id
      const map = new Map<string, any>();
      for (const it of results) {
        const key = it._sourceKey ?? `x:${it.id ?? Math.random()}`;
        if (!map.has(key)) map.set(key, it);
      }

      return Array.from(map.values());
    } catch (err) {
      console.error("fetchProductsByCategory error:", err);
      return [];
    } finally {
      setCategoryLoading(false);
    }
  }

  // Called when user clicks a category chip or a drawer category link
  const handleCategoryClick = async (category: string) => {
    setIsDrawerOpen(false);
    setCategoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (category && category !== "all") params.set("category", category);

      // Call your backend search endpoint (server-side Supabase queries)
      const resp = await axios.get(`/api/products/search?category=${encodeURIComponent(category)}`);
      const products = Array.isArray(resp.data?.products) ? resp.data.products : [];

      // Navigate to homepage with the initial products in state
      navigate(`/?${params.toString()}`, { state: { initialProducts: products, category } });
    } catch (err) {
      console.warn("Category fetch failed (backend):", err);
      // still navigate to home but with empty results so UI shows "No products found"
      const params = new URLSearchParams();
      if (category && category !== "all") params.set("category", category);
      navigate(`/?${params.toString()}`, { state: { initialProducts: [], category } });
    } finally {
      setCategoryLoading(false);
    }
  };

  const shopByList = [
    "Kitchen Wares",
    "Food",
    "Electronics",
    "Clothing",
    "Footwear",
    "Accessories",
    "Home Decor",
    "Furniture",
    "Beauty",
    "Health & Wellness",
    "Sports & Outdoors",
    "Toys & Games",
    "Books",
    "Stationery",
    "Jewelry",
    "Pet Supplies",
    "Automotive",
    "Garden & Outdoor",
    "Baby Products",
    "Tech Gadgets",
    "Fitness Equipment",
    "Travel Gear",
    "Craft Supplies",
    "Party Supplies",
  ];

  const generalCategories = categories.filter((cat) => !shopByList.includes(cat));
  const shopByCategories = categories.filter((cat) => shopByList.includes(cat));

  const filteredGeneralCategories = generalCategories.filter((cat) =>
    cat.toLowerCase().includes(drawerSearch.toLowerCase())
  );
  const filteredShopByCategories = shopByCategories.filter((cat) =>
    cat.toLowerCase().includes(drawerSearch.toLowerCase())
  );

  const displayedGeneralCategories = showAllGeneral ? filteredGeneralCategories : filteredGeneralCategories.slice(0, 5);
  const displayedShopByCategories = showAllShopBy ? filteredShopByCategories : filteredShopByCategories.slice(0, 5);

  const subtotal = cart.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0);

  // Respect reduced motion
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // computed styles for subnav
  const subnavTransform = isSubnavHidden ? "translateY(-106%)" : "translateY(0)";
  const subnavOpacity = isSubnavHidden ? 0 : 1;
  const subnavTransition = prefersReducedMotion
    ? "none"
    : `transform ${TRANSITION_MS}ms cubic-bezier(.22,.9,.36,1), opacity ${TRANSITION_MS}ms linear, box-shadow ${TRANSITION_MS}ms linear, background-color 180ms linear`;

  const headerSolidActive = isSubnavDocked && isSubnavHidden;

  // reusable nav-card style to match navbar background
  const navCardStyle: React.CSSProperties = {
    backgroundColor: "rgba(255,255,255,0.06)",
    WebkitBackdropFilter: "blur(6px)",
    backdropFilter: "blur(6px)",
    border: "1px solid rgba(0,0,0,0.06)",
  };
  const navCardClass = "inline-flex items-center justify-center rounded-lg shadow-sm";

  return (
    <>
      <header
        ref={headerRef}
        className={`w-full px-3 sm:px-6 py-2 sm:py-3 fixed top-0 left-0 backdrop-blur-md border-b border-slate-200/30 dark:border-gray-800/30 shadow-sm ${headerSolidActive ? "solid-header" : ""}`}
        style={{
          transform: "translateZ(0)",
          willChange: "transform, background-color",
          transition: prefersReducedMotion ? "none" : `background-color 180ms linear, box-shadow ${TRANSITION_MS}ms cubic-bezier(.22,.9,.36,1)`,
          zIndex: 1200,
          isolation: "isolate",
        }}
      >
        <div className="flex items-center justify-between max-w-screen-xl mx-auto">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 focus:outline-none">
              {/* logo styled as a nav-card to match the lottie/cart card */}
              <span
                className={`${navCardClass}`}
                style={{
                  width: 56,
                  height: 56,
                  ...navCardStyle,
                }}
                aria-hidden
              >
                <img
                  src="/images/logo.png"
                  alt="Vshop Logo"
                  className="h-9 w-9 object-contain"
                  style={{ display: "block", margin: "0 auto" }}
                />
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-3 text-sm">
              <Link to="/products" className="px-3 py-1 rounded-md hover:bg-[rgba(16,185,129,0.06)] transition text-gray-700 dark:text-gray-200">
                Products
              </Link>
              <Link to="/collections" className="px-3 py-1 rounded-md hover:bg-[rgba(16,185,129,0.06)] transition text-gray-700 dark:text-gray-200">
                Collections
              </Link>
              <Link to="/vendors" className="px-3 py-1 rounded-md hover:bg-[rgba(16,185,129,0.06)] transition text-gray-700 dark:text-gray-200">
                Vendors
              </Link>
            </nav>
          </div>

          {/* center search (md+) */}
          <div className="hidden md:flex w-full max-w-2xl mx-6">
            <div className="relative w-full">
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                type="text"
                placeholder="Search products, vendors, categories..."
                className="w-full rounded-full py-2 pl-4 pr-10 text-sm bg-white/20 dark:bg-black/10 border border-transparent text-gray-800 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-transform"
                onFocus={() => setIsSearchOpen(true)}
                aria-label="Search products and vendors"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <Search className="w-5 h-5" />
              </div>

              {/* Suggestions dropdown (desktop) */}
              {isSearchOpen && (suggestions.length > 0 || loadingSuggestions) && (
                <div
                  ref={modalRef}
                  className="absolute left-0 right-0 mt-2 max-h-80 overflow-auto rounded-xl shadow-lg bg-white dark:bg-gray-900 border border-[rgba(0,0,0,0.06)]"
                  role="listbox"
                  style={{
                    position: "absolute",
                  }}
                >
                  <div className="p-2">
                    {loadingSuggestions && <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>}

                    {suggestions.length > 0 && (
                      <>
                        {/* Products */}
                        {suggestions.some((s) => s.type === "product") && (
                          <div className="mb-2">
                            <div className="px-3 py-1 text-xs uppercase text-gray-400">Products</div>
                            <ul>
                              {suggestions
                                .filter((s) => s.type === "product")
                                .map((s, idx) => (
                                  <li
                                    key={`prod-${s.id}`}
                                    onMouseEnter={() => setHighlightIndex(idx)}
                                    onMouseLeave={() => setHighlightIndex(-1)}
                                    onClick={() => onSuggestionClick(s)}
                                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer rounded-md transition ${
                                      highlightIndex === idx ? "bg-[rgba(16,185,129,0.06)]" : "hover:bg-[rgba(0,0,0,0.02)]"
                                    }`}
                                  >
                                    <img src={(s as any).image ?? "/placeholder.jpg"} alt={s.name} className="w-11 h-11 object-cover rounded-md" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{s.name}</div>
                                      <div className="text-xs text-gray-400">
                                        {(s as any).price !== null ? `$${(s as any).price?.toFixed?.(2) ?? s.price}` : ""}
                                      </div>
                                    </div>
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}

                        {/* Vendors */}
                        {suggestions.some((s) => s.type === "vendor") && (
                          <div>
                            <div className="px-3 py-1 text-xs uppercase text-gray-400">Vendors</div>
                            <ul>
                              {suggestions
                                .filter((s) => s.type === "vendor")
                                .map((s, idx) => {
                                  const productCount = suggestions.filter((x) => x.type === "product").length;
                                  const overallIndex = productCount + idx;
                                  return (
                                    <li
                                      key={`vendor-${s.id}`}
                                      onMouseEnter={() => setHighlightIndex(overallIndex)}
                                      onMouseLeave={() => setHighlightIndex(-1)}
                                      onClick={() => onSuggestionClick(s)}
                                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer rounded-md transition ${
                                        highlightIndex === overallIndex ? "bg-[rgba(16,185,129,0.06)]" : "hover:bg-[rgba(0,0,0,0.02)]"
                                      }`}
                                    >
                                      <img src={s.image ?? "/placeholder-avatar.png"} alt={s.name} className="w-10 h-10 object-cover rounded-full" />
                                      <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{s.name}</div>
                                        <div className="text-xs text-gray-400">Vendor</div>
                                      </div>
                                    </li>
                                  );
                                })}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    {!loadingSuggestions && suggestions.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No results — try different keywords.</div>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* right controls */}
          <div className="flex items-center gap-2">
            <div className="flex md:hidden items-center gap-1">
              <Link to="/vendor-dashboard" className="p-2 rounded-full hover:bg-[rgba(0,0,0,0.04)] transition">
                <Store className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </Link>
              <button
                onClick={() => {
                  setIsSearchOpen(true);
                  setTimeout(() => inputRef.current?.focus(), 30);
                }}
                className="p-2 rounded-full hover:bg-[rgba(0,0,0,0.04)] transition"
                title="Search"
              >
                <Search className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
              <Link to="/notifications" className="relative p-2 rounded-full hover:bg-[rgba(0,0,0,0.04)] transition">
                <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded-full">
                    {notificationCount}
                  </span>
                )}
              </Link>
            </div>

            {isVendor && (
              <Link to="/vendor-dashboard" className="hidden md:inline-flex p-2 rounded-md hover:bg-[rgba(0,0,0,0.04)] transition text-gray-700 dark:text-gray-300">
                <Store className="w-5 h-5" />
              </Link>
            )}

            <Link to="/notifications" className="hidden md:inline-flex relative p-2 rounded-md hover:bg-[rgba(0,0,0,0.04)] transition">
              <Bell className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs px-1 py-0.5 rounded-full">
                  {notificationCount}
                </span>
              )}
            </Link>

            {/* More dropdown */}
            <div className="relative">
              <button onClick={() => setIsMoreOpen(!isMoreOpen)} className="text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-emerald-600 transition px-2 py-1 rounded-md">
                More ▾
              </button>
              {isMoreOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-900 backdrop-blur-md border border-[rgba(0,0,0,0.06)] rounded-xl shadow">
                  <Link to="/order-tracking" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                    <Package className="w-4 h-4" />
                    Order Tracking
                  </Link>
                  <Link to="/support" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                    <HelpCircle className="w-4 h-4" />
                    Support
                  </Link>
                  <Link to="/faq" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                    <Info className="w-4 h-4" />
                    FAQ
                  </Link>
                  <Link to="/contact" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                    <Phone className="w-4 h-4" />
                    Contact
                  </Link>
                </div>
              )}
            </div>

            {/* HEADER CART */}
            <div className="relative" ref={cartRef}>
              <button
                onClick={() => setIsCartOpen((s) => !s)}
                aria-haspopup="true"
                aria-expanded={isCartOpen}
                aria-label={`Open cart (${cartCount} items)`}
                className={`relative inline-flex items-center gap-3 rounded-lg px-2 py-1 shadow-sm transition-transform transform ${cartPulse ? "animate-pulse-scale" : "hover:scale-[1.02]"} border border-transparent hover:border-[rgba(16,185,129,0.06)]`}
                style={{ background: "transparent" }}
              >
                {/* unified nav-card used for both logo and cart icon */}
                <span
                  className={`${navCardClass}`}
                  style={{
                    width: 44,
                    height: 44,
                    ...navCardStyle,
                  }}
                >
                  {/* Lottie should be visually centered and not overflow */}
                  <FireLottie size={28} />
                </span>

                <div className="hidden sm:flex flex-col leading-none">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Cart</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{cartCount} items</span>
                </div>

                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] px-1 py-[2px] rounded-full shadow">
                    {cartCount}
                  </span>
                )}
              </button>

              {/* CART POPOVER */}
              {isCartOpen && (
                <div className="absolute right-0 mt-3 w-72 max-w-[90vw] bg-white rounded-lg shadow-2xl border border-[rgba(0,0,0,0.04)] dark:bg-gray-900 dark:border-[rgba(255,255,255,0.02)] overflow-hidden">
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Your cart</h4>
                      <button onClick={() => setIsCartOpen(false)} className="p-1 rounded-md hover:bg-[rgba(0,0,0,0.04)]">
                        <X className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>

                    {cart.length === 0 ? (
                      <div className="py-6 text-center text-sm text-gray-500">Your cart is empty.</div>
                    ) : (
                      <div className="space-y-3 max-h-52 overflow-y-auto pr-2">
                        {cart.slice(0, 4).map((it, i) => (
                          <div key={`${it.product_id ?? it.id}-${i}`} className="flex items-center gap-3">
                            <img src={it.image ?? "/placeholder.jpg"} alt={it.name ?? "item"} className="w-10 h-10 object-cover rounded-md" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{it.name}</div>
                              <div className="text-xs text-gray-500">{it.quantity} × ${(it.price ?? 0).toFixed(2)}</div>
                            </div>
                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">${((it.price ?? 0) * it.quantity).toFixed(2)}</div>
                          </div>
                        ))}

                        {cart.length > 4 && <div className="text-xs text-gray-500">+{cart.length - 4} more items</div>}
                      </div>
                    )}

                    <div className="mt-3 border-t border-[rgba(0,0,0,0.04)] pt-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm text-gray-500">Subtotal</div>
                        <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">${subtotal.toFixed(2)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setIsCartOpen(false);
                            navigate("/cart");
                          }}
                          className="px-3 py-1.5 rounded-md bg-white border border-gray-200 hover:bg-gray-50 text-sm text-gray-800 transition-colors
                                     dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700 dark:text-gray-100"
                        >
                          View Cart
                        </button>
                        <button onClick={() => { setIsCartOpen(false); navigate("/checkout"); }} className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm shadow">
                          Checkout
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* user dropdown */}
            <div className="relative">
              <button onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="p-2 rounded-full hover:bg-[rgba(0,0,0,0.04)] transition">
                <User className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>

              {isDropdownOpen && user && (
                <div className="absolute right-0 mt-2 w-44 bg-white dark:bg-gray-900 backdrop-blur-md border border-[rgba(0,0,0,0.06)] rounded-xl shadow">
                  <span className="block px-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100">Hello, {user}</span>
                  <Link to="/account" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                    <User className="w-4 h-4" />
                    Account
                  </Link>
                  {isAdmin && (
                    <Link to="/admin-dashboard" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                      <User className="w-4 h-4" />
                      Admin Panel
                    </Link>
                  )}
                  {isVendor && (
                    <Link to="/vendor-portal" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(16,185,129,0.04)]">
                      <Store className="w-4 h-4" />
                      Vendor Portal
                    </Link>
                  )}
                  <button onClick={handleLogout} className="w-full text-left flex items-center gap-2 px-4 py-2 text-sm hover:bg-[rgba(255,0,0,0.04)]">
                    <LogOut className="w-4 h-4 text-red-500" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>

            {!user && (
              <Link to="/signin" className="px-3 py-1 border border-[rgba(255,255,255,0.04)] rounded-full text-sm text-gray-800 dark:text-gray-100 hover:bg-[rgba(0,0,0,0.04)] transition">
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* sentinel used by IntersectionObserver to detect when header leaves viewport */}
      <div ref={headerSentinelRef} aria-hidden style={{ position: "absolute", top: 0, left: 0, width: 0, height: 0 }} />

      {/* SUB-NAVBAR */}
      <div
        ref={subnavRef}
        className={`${isSubnavDocked ? "fixed" : "relative"} w-full left-0`}
        style={
          isSubnavDocked
            ? {
                top: headerHeight,
                boxShadow: isSubnavHidden ? "none" : "0 6px 18px rgba(2,6,23,0.08)",
                willChange: "transform, box-shadow, background-color, opacity",
                WebkitTransform: "translate3d(0,0,0)",
                width: "100%",
                left: 0,
                transform: subnavTransform,
                opacity: subnavOpacity,
                transition: subnavTransition,
                borderRadius: isSubnavDocked && !isSubnavHidden ? "0 0 12px 12px" : undefined,
                pointerEvents: isSubnavHidden ? "none" : "auto",
                zIndex: 100,
              }
            : {
                willChange: "transform, background-color, opacity",
                WebkitTransform: "translate3d(0,0,0)",
                transform: subnavTransform,
                opacity: subnavOpacity,
                transition: subnavTransition,
                pointerEvents: isSubnavHidden ? "none" : "auto",
                zIndex: "auto",
              }
        }
      >
        <div
          className={`mx-auto max-w-screen-xl px-3 sm:px-6 py-2 flex items-center justify-between gap-3 bg-slate-50/40 dark:bg-gray-900/40 ${isSubnavDocked ? "rounded-b-lg" : ""}`}
          style={{
            padding: isSubnavDocked ? "6px 12px" : undefined,
          }}
        >
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open categories"
              className={`p-2 rounded-md hover:bg-[rgba(0,0,0,0.04)] transition ${isSubnavDocked ? "" : "rounded-none"}`}
            >
              <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            </button>

            <div className="hidden sm:flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
              {categories.slice(0, 10).map((cat) => (
                <button
                  key={`chip-${cat}`}
                  onClick={() => handleCategoryClick(cat)}
                  className={`text-sm whitespace-nowrap px-3 py-1 rounded-full border ${isSubnavDocked ? "border-gray-200 dark:border-gray-800" : "border-transparent"} bg-white/30 dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900 transition`}
                >
                  {cat}
                </button>
              ))}
              {categories.length > 10 && (
                <button onClick={() => handleCategoryClick("all")} className="text-sm whitespace-nowrap px-3 py-1 rounded-full border border-dashed border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                  More
                </button>
              )}
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            <Link to="/collections" className="hidden sm:inline-flex px-3 py-1 rounded-full text-sm hover:bg-[rgba(0,0,0,0.02)]">
              Collections
            </Link>
          </div>
        </div>
      </div>

      {/* Spacer to preserve layout when subnav is fixed */}
      {isSubnavDocked && <div aria-hidden style={{ height: subnavHeightRef.current ?? subnavHeight }} />}

      {/* MOBILE SEARCH OVERLAY */}
      {isSearchOpen && (
        <div style={{ top: (headerHeightRef.current ?? headerHeight) + 8 }} className="fixed left-0 w-full px-4 py-4 z-50 bg-[rgba(15,23,42,0.02)] dark:bg-[rgba(15,23,42,0.9)] border-b border-[rgba(255,255,255,0.03)] shadow-md transition-all md:hidden">
          <div ref={modalRef} className="relative w-full max-w-lg mx-auto">
            <input
              autoFocus
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onInputKeyDown}
              type="text"
              placeholder="Search products..."
              className="w-full border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 rounded-full py-2 pl-4 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button onClick={() => { setIsSearchOpen(false); setSuggestions([]); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500">
              <X className="w-5 h-5" />
            </button>

            {/* Mobile suggestions */}
            {isSearchOpen && (suggestions.length > 0 || loadingSuggestions) && (
              <div className="mt-3 rounded-lg shadow-lg max-h-72 overflow-auto">
                <div className="p-2 bg-[rgba(15,23,42,0.02)] dark:bg-[rgba(15,23,42,0.95)] rounded-lg">
                  {loadingSuggestions && <div className="px-3 py-2 text-sm text-gray-400">Searching...</div>}
                  {suggestions.map((s) => (
                    <div key={`${s.type}-${s.id}`} onClick={() => onSuggestionClick(s)} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[rgba(16,185,129,0.04)] rounded">
                      <img src={(s as any).image ?? "/placeholder.jpg"} alt={s.name} className="w-10 h-10 object-cover rounded" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate text-gray-900 dark:text-gray-100">{s.name}</div>
                        <div className="text-xs text-gray-400">{s.type === "product" ? "Product" : "Vendor"}</div>
                      </div>
                    </div>
                  ))}
                  {!loadingSuggestions && suggestions.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No results.</div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CATEGORIES DRAWER */}
      {isDrawerOpen && (
        <div className="fixed inset-0 flex" style={{ zIndex: 2000 }}>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setIsDrawerOpen(false)} style={{ zIndex: 2000 }} />

          <aside
            ref={drawerRef}
            className="relative w-80 max-w-full p-4 overflow-auto shadow-2xl border rounded-lg bg-white/50 dark:bg-gray-900/50"
            style={{
              zIndex: 2001,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(0,0,0,0.06)",
              transform: "translateZ(0)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Categories</h3>
              <button onClick={() => setIsDrawerOpen(false)} className="p-2 rounded-md hover:bg-[rgba(0,0,0,0.04)] transition">
                <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>
            </div>

            <div className="relative mb-4">
              <input
                value={drawerSearch}
                onChange={(e) => setDrawerSearch(e.target.value)}
                placeholder="Search categories"
                className="w-full p-2 pr-10 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">Shop by Categories</h4>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {displayedShopByCategories.map((cat) => (
                  <button key={`shopby-${cat}`} onClick={() => handleCategoryClick(cat)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm text-center truncate hover:bg-emerald-50 dark:hover:bg-emerald-900 transition">
                    {cat}
                  </button>
                ))}
              </div>
              {filteredShopByCategories.length > 5 && (
                <button onClick={() => setShowAllShopBy(!showAllShopBy)} className="w-full mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                  {showAllShopBy ? "Show Less" : `Show All (${filteredShopByCategories.length})`}
                </button>
              )}
            </div>

            <div className="mb-6">
              <h4 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">General Categories</h4>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                {displayedGeneralCategories.map((cat) => (
                  <button key={`gen-${cat}`} onClick={() => handleCategoryClick(cat)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-md text-sm text-center truncate hover:bg-emerald-50 dark:hover:bg-emerald-900 transition">
                    {cat}
                  </button>
                ))}
              </div>
              {filteredGeneralCategories.length > 5 && (
                <button onClick={() => setShowAllGeneral(!showAllGeneral)} className="w-full mt-2 text-sm text-emerald-600 dark:text-emerald-400 hover:underline">
                  {showAllGeneral ? "Show Less" : `Show All (${filteredGeneralCategories.length})`}
                </button>
              )}
            </div>

            <div className="mt-4">
              <button onClick={() => handleCategoryClick("all")} className="block w-full text-center py-2 rounded-md bg-emerald-600 text-white font-medium">
                View all categories
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* small helper styles preserved */}
      <style>{`
        @keyframes pulse-scale { 0% { transform: scale(1); } 50% { transform: scale(1.06); } 100% { transform: scale(1); } }
        .animate-pulse-scale { animation: pulse-scale 600ms ease-in-out; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .solid-header {
          background-color: rgba(248,250,252,0.98) !important;
          box-shadow: 0 10px 30px rgba(2,6,23,0.12) !important;
          backdrop-filter: blur(10px);
        }

        .dark .solid-header {
          background-color: rgba(10,11,13,0.95) !important;
          box-shadow: 0 10px 30px rgba(0,0,0,0.6) !important;
          backdrop-filter: blur(10px);
        }
      `}</style>
    </>
  );
};

export default Navbar;
