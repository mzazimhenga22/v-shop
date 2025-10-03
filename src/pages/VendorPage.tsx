import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { JSX } from "react";
import { Star, ShoppingCart, MessageCircle, Share2 } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { supabase } from "@/lib/supabaseClient";
import type { Product, Vendor } from "@/types";
import { useCart } from "@/context/CartContext";

const TABS = [
  "About",
  "Products",
  "Collections",
  "Featured",
  "Flash Sales",
  "Deals",
  "Reviews",
  "Q&A",
  "Policies",
  "Shipping",
  "Contact & Location",
  "Gallery",
];

// sanitize id strings coming from params or db (strip surrounding quotes)
const stripQuotes = (v: any) => {
  if (v === null || v === undefined) return v;
  return String(v).replace(/^['"]+|['"]+$/g, "");
};

type VendorProduct = Product & {
  discount?: string;
  specifications?: string;
  description?: string;
  shippingInfo?: string;
  returnInfo?: string;
  payment_methods?: string[] | string | boolean | null;
  vendor?: boolean;
  vendor_id?: string | null;
};

export default function VendorPage(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();

  // If navigation included vendor in state, use that initially
  const stateVendor = (location.state as any)?.vendor as Vendor | undefined;
  const [vendor, setVendor] = useState<Vendor | undefined>(stateVendor);
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const [following, setFollowing] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  const [products, setProducts] = useState<VendorProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"newest" | "price_low" | "price_high">("newest");
  const [priceMin, setPriceMin] = useState<number | "">("");
  const [priceMax, setPriceMax] = useState<number | "">("");
  const [cartOpen, setCartOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const featuredRef = useRef<HTMLDivElement | null>(null);

  // use cart context instead of local state
  const { cart, addToCart: cartContextAddToCart, removeFromCart: cartContextRemoveFromCart, updateQuantity } = useCart();

  const inputClass =
    "px-3 py-2 border rounded w-full sm:w-auto bg-white/60 dark:bg-gray-800/60 text-gray-900 dark:text-white border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400 backdrop-blur-sm";

  // API base and optional prefix
  const API_BASE = (import.meta.env.VITE_API_BASE as string) || "http://localhost:4000";
  const API_PREFIX = (import.meta.env.VITE_API_PREFIX as string) || "";

  // ------------------------
  // The following helpers and data normalization are unchanged except for minor cosmetic improvements
  // ------------------------
  const quoteForFilter = (val: any) => {
    if (val === null || val === undefined) return "''";
    const s = String(val);
    const escaped = s.replace(/'/g, "''");
    return `'${escaped}'`;
  };

  const normalizeVendor = (raw: any): Vendor => {
    const galleryArr: string[] = raw?.gallery
      ? Array.isArray(raw.gallery)
        ? (raw.gallery as string[])
        : typeof raw.gallery === "string"
        ? [raw.gallery]
        : []
      : [];

    const ensureUrl = (u: any): string | null => {
      if (!u && u !== 0) return null;
      try {
        const s = String(u);
        if (s.startsWith("http://") || s.startsWith("https://")) return s;
        if (s.startsWith("/")) return `${API_BASE}${s}`;
        return s;
      } catch {
        return null;
      }
    };

    return {
      id: raw?.id ?? raw?.vendor_id ?? raw?.user_id ?? raw?._id,
      vendor_name:
        raw?.vendor_name ?? raw?.vendor_name ?? raw?.name ?? raw?.display_name ?? raw?.company_name ?? raw?.username ?? raw?.email ?? "Unnamed Vendor",
      name:
        raw?.vendor_name ?? raw?.name ?? raw?.display_name ?? raw?.company_name ?? raw?.username ?? raw?.email ?? "Unnamed Vendor",
      banner_url: ensureUrl(
        raw?.banner_url ??
          raw?.banner ??
          raw?.bannerUrl ??
          raw?.bannerImage ??
          raw?.banner_image ??
          raw?.bannerPath ??
          raw?.banner_path ??
          null
      ),
      photo_url: ensureUrl(
        raw?.photo_url ??
          raw?.photo ??
          raw?.logo ??
          raw?.logo_url ??
          raw?.avatar ??
          raw?.avatar_url ??
          null
      ),
      logo: ensureUrl(raw?.logo ?? raw?.photo_url ?? raw?.logo_url ?? raw?.avatar ?? raw?.photo ?? null),
      rating: raw?.rating ?? Number(raw?.rating ?? 0),
      reviews: raw?.reviews ?? raw?.review_count ?? 0,
      followers: raw?.followers ?? 0,
      sales: raw?.sales ?? 0,
      promo: raw?.promo ?? null,
      email: raw?.vendor_email ?? raw?.email ?? null,
      description: raw?.description ?? raw?.message ?? "",
      policies: raw?.policies ?? null,
      shipping_info: raw?.shipping_info ?? raw?.shippingInfo ?? null,
      address: raw?.address ?? null,
      hours: raw?.hours ?? null,
      gallery: galleryArr.map((g: string) => ensureUrl(g) || ""),
      isVerified: raw?.verified ?? raw?.isVerified ?? raw?.reviewed ?? false,
      topSeller: raw?.topSeller ?? false,
      category: raw?.category ?? "General",
      inserted_at: raw?.inserted_at ?? raw?.created_at ?? null,
      __raw: raw,
    } as Vendor;
  };

  const doFetch = async (url: string, options: RequestInit = {}, timeoutMs = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, headers: { ...(options.headers || {}), Accept: "application/json" } });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  const parsePaymentMethods = (val: any): string[] => {
    if (val === null || val === undefined) return [];
    if (Array.isArray(val)) {
      const out: string[] = [];
      for (const v of val) {
        if (typeof v === "string") {
          const s = v.trim();
          if (!s) continue;
          if (s.startsWith("[") && s.endsWith("]")) {
            try {
              const parsed = JSON.parse(s);
              if (Array.isArray(parsed)) {
                parsed.forEach((x) => x && out.push(String(x)));
                continue;
              }
            } catch {}
          }
          out.push(s);
        } else if (v) {
          out.push(String(v));
        }
      }
      return Array.from(new Set(out.map((s) => s.trim()).filter(Boolean)));
    }

    if (typeof val === "boolean") return [];
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch (e) {
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    try {
      const s = String(val).trim();
      return s ? [s] : [];
    } catch {
      return [];
    }
  };

  const normalizeVendorProductRow = (p: any, candidateVendorId: string): VendorProduct => {
    const image =
      p.image ??
      p.image_url ??
      p.photo ??
      p.photo_url ??
      p.main_image ??
      p.imageUrl ??
      (p.images && Array.isArray(p.images) && p.images[0]) ??
      null;

    const thumbs = Array.isArray(p.thumbnails ?? p.images ?? p.gallery ?? p.photos)
      ? (p.thumbnails ?? p.images ?? p.gallery ?? p.photos).map((t: any) => (t ? String(t) : ""))
      : [];

    const foundVendorId =
      stripQuotes(p.vendor_id ?? p.seller_id ?? p.vendor ?? p.merchant_id ?? candidateVendorId) || null;

    const numericPrice = (() => {
      try {
        if (p.price === null || p.price === undefined) return 0;
        return Number(p.price);
      } catch {
        return 0;
      }
    })();

    return {
      ...p,
      id: p.id ?? p.product_id ?? p.uuid ?? p._id ?? Math.random().toString(36).slice(2, 9),
      name: p.name ?? p.title ?? "Untitled",
      image,
      thumbnails: thumbs,
      price: Number.isFinite(numericPrice) ? numericPrice : 0,
      payment_methods: parsePaymentMethods(p.payment_methods ?? p.payment_methods ?? p.payment_methods),
      description: p.description ?? p.specifications ?? p.description ?? "",
      specifications: p.specifications ?? "",
      shippingInfo: p.shippinginfo ?? p.shipping_info ?? p.shippingInfo ?? p.shippingInfo,
      returnInfo: p.returninfo ?? p.return_info ?? p.returnInfo ?? p.returnInfo,
      key: p.id ? `product-${p.id}` : `product-${Math.random()}`,
      vendor: true,
      vendor_id: foundVendorId,
    } as VendorProduct;
  };

  // ------------------------
  // Vendor & products loading logic (unchanged behaviorally)
  // ------------------------
  useEffect(() => {
    if (stateVendor) return;
    const vId = params.id;
    if (!vId) {
      navigate("/");
      return;
    }

    let mounted = true;
    const loadVendor = async () => {
      try {
        const rawId = stripQuotes(vId);
        const base = API_BASE.replace(/\/$/, "");
        const prefix = API_PREFIX || "";
        const url = `${base}${prefix}/api/vendors/${encodeURIComponent(rawId)}`;

        const res = await doFetch(url, {}, 10000).catch((e) => {
          return null;
        });

        if (!mounted) return;

        if (!res) {
          try {
            const viewQuery = `id.eq.${rawId},vendor_id.eq.${rawId},user_id.eq.${rawId},email.eq.${rawId}`;
            const { data: profileData } = await supabase.from("vendor_profiles_with_user").select("*").or(viewQuery).maybeSingle();
            if (profileData && mounted) {
              setVendor(normalizeVendor(profileData));
              return;
            }
          } catch {}
          return;
        }

        if (!res.ok) {
          if (res.status === 404) {
            navigate("/vendors");
            return;
          }

          try {
            const viewQuery = `id.eq.${rawId},vendor_id.eq.${rawId},user_id.eq.${rawId},email.eq.${rawId}`;
            const { data: profileData } = await supabase.from("vendor_profiles_with_user").select("*").or(viewQuery).maybeSingle();
            if (profileData && mounted) {
              setVendor(normalizeVendor(profileData));
              return;
            }
          } catch {}
          return;
        }

        const json = await res.json().catch(() => null);
        const vendorPayload = json?.vendor ?? json;
        if (!vendorPayload) {
          navigate("/vendors");
          return;
        }

        const rawData = vendorPayload.raw ?? vendorPayload;
        if (mounted) setVendor(normalizeVendor(rawData));
      } catch (err) {
        navigate("/");
      }
    };

    loadVendor();
    return () => {
      mounted = false;
    };
  }, [params.id, navigate, stateVendor]);

  useEffect(() => {
    if (!vendor && !params.id) return;
    const candidateVendorId = stripQuotes(vendor?.id ?? vendor?.vendor_id ?? vendor?.user_id ?? params.id);
    if (!candidateVendorId) return;

    async function probeTableForVendor(tbl: string, idValue: string): Promise<any[] | null> {
      try {
        const { data: byVendorId } = await supabase.from(tbl).select("*").eq("vendor_id", idValue).limit(1000);
        if (Array.isArray(byVendorId) && byVendorId.length > 0) return byVendorId;
        const { data: byVendorCol } = await supabase.from(tbl).select("*").eq("vendor", idValue).limit(1000);
        if (Array.isArray(byVendorCol) && byVendorCol.length > 0) return byVendorCol;
        return null;
      } catch {
        return null;
      }
    }

    let mounted = true;
    const fetchProducts = async () => {
      setProducts([]);
      setLoadingProducts(true);
      try {
        const encoded = encodeURIComponent(candidateVendorId);
        const base = API_BASE.replace(/\/$/, "");
        const prefix = API_PREFIX || "";

        const publicUrl = `${base}${prefix}/api/vendors/${encoded}/products`;
        const protectedUrl = `${base}${prefix}/vendor/products`;

        let res: Response | null = null;

        try {
          res = await doFetch(publicUrl, {}, 10000);
        } catch (err) {
          res = null;
        }

        if (!res || !res.ok) {
          try {
            const sessionResp = await supabase.auth.getSession();
            const token = (sessionResp as any)?.data?.session?.access_token ?? null;
            const headers: Record<string, string> = { Accept: "application/json" };
            if (token) headers.Authorization = `Bearer ${token}`;
            res = await doFetch(protectedUrl, { headers }, 10000);
          } catch (err) {
            res = null;
          }
        }

        if (!res) {
          setProducts([]);
          return;
        }

        const textBody = await res.text().catch(() => "<no-body>");
        let parsedBody: any = null;
        try {
          parsedBody = JSON.parse(textBody);
        } catch {}

        if (!res.ok) {
          try {
            let sbProducts: any[] | null = null;
            try {
              const rows = await probeTableForVendor("products", candidateVendorId);
              if (rows && rows.length > 0) sbProducts = rows;
            } catch {}

            if (!sbProducts) {
              const candidateTables = ["vendor_product", "vendor_products"];
              for (const tbl of candidateTables) {
                const rows = await probeTableForVendor(tbl, candidateVendorId);
                if (rows && rows.length > 0) {
                  sbProducts = rows;
                  break;
                }
              }
            }

            if (sbProducts && sbProducts.length > 0) {
              const seen = new Set<string>();
              const unique = sbProducts.filter((r: any) => {
                const id = String(r.id ?? r.product_id ?? r.uuid ?? r._id ?? "");
                if (!id) return true;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
              });

              const normalizedFallback: VendorProduct[] = unique.map((p: any) => normalizeVendorProductRow(p, candidateVendorId));
              if (mounted) setProducts(normalizedFallback);
              return;
            }
          } catch {}

          if (mounted) setProducts([]);
          return;
        }

        const data = parsedBody ?? {};
        const rawList = Array.isArray(data?.products) ? data.products : Array.isArray(data) ? data : data?.items ?? [];

        const normalized: VendorProduct[] = (rawList || []).map((p: any) => normalizeVendorProductRow(p, candidateVendorId));

        if (mounted) setProducts(normalized);
      } catch (err) {
        if (mounted) setProducts([]);
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    };

    fetchProducts();
    return () => {
      mounted = false;
    };
  }, [vendor?.id, params.id, API_BASE, API_PREFIX]);

  const categories = React.useMemo(() => {
    const s = new Set<string>();
    products.forEach((p) => {
      s.add((p as any).category ?? "Uncategorized");
    });
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const applyClientFilters = (list: VendorProduct[]) => {
    let out = list.slice();

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((p) => (p.name ?? "").toLowerCase().includes(q));
    }

    if (priceMin !== "") {
      const min = Number(priceMin);
      if (!Number.isNaN(min)) out = out.filter((p) => (p.price ?? 0) >= min);
    }
    if (priceMax !== "") {
      const max = Number(priceMax);
      if (!Number.isNaN(max)) out = out.filter((p) => (p.price ?? 0) <= max);
    }

    if (sortBy === "price_low") out.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sortBy === "price_high") out.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (sortBy === "newest") {
      out.sort((a, b) => {
        const ta = (a as any).created_at ? new Date((a as any).created_at).getTime() : 0;
        const tb = (b as any).created_at ? new Date((b as any).created_at).getTime() : 0;
        return tb - ta;
      });
    }

    return out;
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.title;
    const name = vendor?.name ?? (vendor as any)?.vendor_name;
    document.title = name ? `${name} | Vshop` : "Vendor | Vshop";
    return () => {
      document.title = prev;
    };
  }, [vendor]);

  const filtered = React.useMemo(() => {
    const base =
      categoryFilter && categoryFilter !== ""
        ? products.filter((p) => ((p as any).category ?? "Uncategorized") === categoryFilter)
        : products.slice();
    return applyClientFilters(base);
  }, [products, search, priceMin, priceMax, sortBy, categoryFilter]);

  const productToCartItem = (prod: VendorProduct, qty = 1) => {
    const payment_methods = Array.isArray(prod.payment_methods) ? prod.payment_methods.map(String) : [];

    const vendorId =
      prod.vendor_id !== undefined && prod.vendor_id !== null
        ? String(prod.vendor_id)
        : vendor?.id !== undefined && vendor?.id !== null
        ? String(vendor.id)
        : undefined;

    return {
      id: String(prod.id),
      name: prod.name ?? "Untitled",
      price: Number(prod.price ?? 0),
      quantity: qty,
      image: prod.image ?? null,
      product_id: prod.id,
      vendor: !!prod.vendor,
      vendor_id: vendorId,
      payment_methods: (payment_methods as any),
    } as const;
  };

  const handleAddToCart = (prod: VendorProduct, qty = 1) => {
    const item = productToCartItem(prod, qty);
    cartContextAddToCart(item as any);
  };

  const handleRemoveFromCart = (prodId: string | number | undefined) => {
    if (prodId === undefined || prodId === null) return;
    cartContextRemoveFromCart(String(prodId));
  };

  const handleClearCart = () => {
    cart.forEach((it) => cartContextRemoveFromCart(it.id));
  };

  const cartCount = cart.reduce((s, it) => s + it.quantity, 0);

  const buyNow = (prod: VendorProduct) => {
    handleAddToCart(prod, 1);
    setCartOpen(true);
  };

  const anyProductsAfterClientFilters = React.useMemo(() => {
    if (categoryFilter && categoryFilter !== "") {
      return filtered.length > 0;
    }
    return categories.some((cat) =>
      applyClientFilters(products.filter((p) => ((p as any).category ?? "Uncategorized") === cat)).length > 0
    );
  }, [categories, categoryFilter, products, filtered, search, priceMin, priceMax, sortBy]);

  // Sticky header effect
  useEffect(() => {
    const onScroll = () => setIsSticky(window.scrollY > 80);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!vendor) {
    return (
      <div className="px-4 py-10 sm:px-6 lg:px-20 min-h-screen flex items-center justify-center bg-gradient-to-b from-transparent to-white/30 dark:to-black/30">
        <p className="text-gray-500 dark:text-gray-400">Loading vendor...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 sm:px-6 lg:px-20 min-h-screen bg-transparent text-gray-900 dark:text-white">
      <nav className="text-sm text-gray-500 mb-6">
        <Link to="/" className="hover:underline">
          Home
        </Link>{" "}
        / <Link to="/vendors" className="hover:underline">Vendors</Link> / <span className="font-medium">{vendor.name}</span>
      </nav>

      <div className="max-w-7xl mx-auto">
        <div className="relative rounded-xl overflow-hidden">
          {/* Banner image with subtle gradient and a glass info card */}
          <div className="relative h-64 w-full overflow-hidden rounded-xl">
            <img src={vendor.banner_url ?? "/placeholder-banner.jpg"} alt="banner" className="absolute inset-0 w-full h-full object-cover transition-transform transform scale-100 hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

            <div className={`absolute left-6 bottom-6 p-4 rounded-2xl border backdrop-blur-md bg-white/30 dark:bg-gray-900/40 border-white/20 dark:border-gray-800/30 shadow-lg transition-all ${isSticky ? 'translate-y-0 scale-95' : 'translate-y-0'}`}>
              <div className="flex items-center gap-4">
                <img src={vendor.photo_url ?? "/placeholder-avatar.png"} alt="photo" className="w-20 h-20 rounded-full border-2 border-white object-cover shadow" />
                <div>
                  <h1 className="text-2xl sm:text-3xl font-semibold leading-tight">{vendor.name}</h1>
                  <div className="flex items-center gap-3 text-yellow-400 mt-1">
                    {Array.from({ length: Math.round(vendor.rating ?? 0) }).map((_, i) => (
                      <Star key={i} className="w-4 h-4" />
                    ))}
                    <span className="text-sm text-gray-200">({vendor.reviews ?? 0} reviews)</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-200 flex gap-4">
                    <span>{vendor.followers ?? 0} followers</span>
                    <span>{products.length} products</span>
                    <span>{vendor.sales ?? 0} sales</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute right-6 top-6 flex flex-col gap-3 z-30">
              <button onClick={() => setFollowing((s) => !s)} className={`px-4 py-2 rounded-md font-medium transition ${following ? "bg-gray-200/80 dark:bg-gray-700/60" : "bg-green-600 text-white"}`}>
                {following ? "Following" : "Follow"}
              </button>
              <button onClick={() => setChatOpen(true)} className="px-3 py-2 rounded-md border bg-white/40 dark:bg-gray-800/40">
                <MessageCircle className="inline-block mr-2" /> Message
              </button>
              <button onClick={() => setCartOpen(true)} className="px-3 py-2 rounded-md bg-gray-900 text-white">
                <ShoppingCart className="inline-block mr-2" /> Cart ({cartCount})
              </button>
            </div>
          </div>
        </div>

        {vendor.promo && <div className="bg-yellow-50 text-yellow-800 mt-5 p-4 rounded-lg text-center font-semibold">{vendor.promo}</div>}

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            {/* Tabs bar — sticky and glass */}
            <div className={`sticky top-20 z-40 mb-4 transition-all ${isSticky ? 'backdrop-blur-md bg-white/30 dark:bg-gray-900/40 border border-white/10 shadow-sm rounded-xl p-3' : ''}`}>
              <div className="flex flex-wrap gap-3">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 py-2 rounded-md text-sm transition ${activeTab === t ? "bg-green-600 text-white" : "bg-white/60 dark:bg-gray-800/50 text-gray-700 dark:text-gray-200 border"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white/40 dark:bg-gray-900/50 rounded-xl p-6 shadow-sm border border-white/10 backdrop-blur-sm">
              {activeTab === "About" && (
                <div className="space-y-4">
                  <p className="text-gray-800 dark:text-gray-200">{vendor.description ?? "No description provided."}</p>
                  <div className="flex gap-4 items-center">
                    <button className="px-4 py-2 rounded bg-blue-600 text-white">Visit Storefront</button>
                    <button className="px-4 py-2 rounded border" onClick={() => navigator.clipboard.writeText(window.location.href)}>Share</button>
                    <button className="px-4 py-2 rounded border" onClick={() => alert("Subscribed!")}>Subscribe</button>
                  </div>
                </div>
              )}

              {activeTab === "Products" && (
                <div>
                  <div className="flex flex-wrap gap-3 items-center mb-4">
                    <input className={`${inputClass} sm:w-1/3`} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <select className={inputClass} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                      <option value="">All categories</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className={inputClass} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
                      <option value="newest">Newest</option>
                      <option value="price_low">Price low → high</option>
                      <option value="price_high">Price high → low</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <input type="number" placeholder="min" className={`${inputClass} w-20`} value={priceMin as any} onChange={(e) => setPriceMin(e.target.value === "" ? "" : Number(e.target.value))} />
                      <input type="number" placeholder="max" className={`${inputClass} w-20`} value={priceMax as any} onChange={(e) => setPriceMax(e.target.value === "" ? "" : Number(e.target.value))} />
                    </div>
                  </div>

                  <div ref={featuredRef} className="mb-5 overflow-x-auto flex gap-3 py-2">
                    {products.filter((p) => (p as any).featured).slice(0, 6).map((p) => (
                      <div key={p.id} className="min-w-[220px] rounded-lg p-3 shadow-md border bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm">
                        <img src={p.image ?? "/placeholder.jpg"} alt={p.name} className="h-36 w-full object-cover rounded" />
                        <div className="mt-2">
                          <div className="font-semibold text-sm truncate">{p.name}</div>
                          <div className="text-sm text-gray-500">${(p.price ?? 0).toFixed(2)}</div>
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => handleAddToCart(p)} className="px-3 py-1 rounded bg-green-600 text-white text-xs">Add</button>
                            <button onClick={() => buyNow(p)} className="px-3 py-1 rounded border text-xs">Buy</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {loadingProducts ? (
                    <p>Loading products...</p>
                  ) : !anyProductsAfterClientFilters ? (
                    <p>No products found.</p>
                  ) : (
                    <>
                      {categoryFilter === "" ? (
                        <div className="space-y-8">
                          {categories.map((cat) => {
                            const itemsForCat = applyClientFilters(products.filter((p) => ((p as any).category ?? "Uncategorized") === cat));
                            if (!itemsForCat || itemsForCat.length === 0) return null;
                            return (
                              <section key={cat}>
                                <div className="flex items-center justify-between mb-4">
                                  <h3 className="text-xl font-semibold">{cat}</h3>
                                  <div className="text-sm text-gray-500">{itemsForCat.length} items</div>
                                </div>
                                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                                  {itemsForCat.map((p) => (
                                    <ProductCard key={p.id} product={p} onAddToCart={() => handleAddToCart(p)} onBuyNow={() => buyNow(p)} />
                                  ))}
                                </div>
                              </section>
                            );
                          })}
                        </div>
                      ) : (
                        <section>
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold">{categoryFilter}</h3>
                            <div className="text-sm text-gray-500">{filtered.length} items</div>
                          </div>
                          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                            {filtered.map((p) => (
                              <ProductCard key={p.id} product={p} onAddToCart={() => handleAddToCart(p)} onBuyNow={() => buyNow(p)} />
                            ))}
                          </div>
                        </section>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* other tabs omitted for brevity (you can copy the pattern above to add content for them) */}
            </div>
          </div>

          <aside className="lg:col-span-1">
            <div className="p-4 rounded-xl shadow-sm space-y-4 border bg-white/40 dark:bg-gray-900/50 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <img src={vendor.photo_url ?? "/placeholder-avatar.png"} alt="photo" className="w-14 h-14 rounded-full object-cover" />
                <div>
                  <div className="font-semibold">{vendor.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{vendor.category ?? "General"}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <a href={`mailto:${vendor.email ?? ""}`} className="flex-1 px-3 py-2 rounded border text-center">Contact</a>
                <button onClick={() => setChatOpen(true)} className="px-3 py-2 rounded bg-blue-600 text-white">Chat</button>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs text-gray-400">Seller badges</div>
                <div className="flex gap-2 mt-2">
                  {vendor.isVerified && <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">Verified</span>}
                  {vendor.topSeller && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">Top seller</span>}
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs text-gray-400">Quick links</div>
                <div className="flex flex-col gap-2 mt-2">
                  <Link to={`/vendors/${vendor.id}`} className="text-sm">View storefront</Link>
                  <Link to={`/vendors/${vendor.id}/reviews`} className="text-sm">All reviews</Link>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl shadow-sm border bg-white/40 dark:bg-gray-900/50 backdrop-blur-sm">
              <div className="text-sm font-semibold">Get deals from this vendor</div>
              <div className="mt-2 flex gap-2">
                <input className={`${inputClass} flex-1`} placeholder="Email address" />
                <button className="px-3 py-2 rounded bg-green-600 text-white">Join</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Cart drawer - overlay */}
      <div className={`${cartOpen ? "translate-x-0" : "translate-x-full"} fixed right-0 top-0 h-full w-full sm:w-96 bg-white/95 dark:bg-gray-900/95 shadow-2xl transition-transform z-50`} role="dialog" aria-modal="true">
        <div className="p-4 flex items-center justify-between border-b">
          <div className="font-semibold">Your Cart ({cartCount})</div>
          <div className="flex gap-2">
            <button onClick={() => { handleClearCart(); }} className="px-3 py-1 rounded border">Clear</button>
            <button onClick={() => setCartOpen(false)} className="px-3 py-1 rounded border">Close</button>
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-160px)]">
          {cart.length === 0 ? <p className="text-gray-500 dark:text-gray-400">Cart is empty</p> : cart.map((item) => (
            <div key={String(item.id)} className="flex items-center gap-3">
              <img src={item.image ?? "/placeholder.jpg"} className="w-16 h-16 object-cover rounded" alt={item.name} />
              <div className="flex-1">
                <div className="font-medium text-sm">{item.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{item.quantity} × ${Number(item.price ?? 0).toFixed(2)}</div>
                {item.vendor && <div className="text-xs text-gray-400 mt-1">Vendor item</div>}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <div className="flex gap-1">
                  <button onClick={() => updateQuantity(item.id, -1)} className="px-2 py-1 text-xs rounded border">-</button>
                  <button onClick={() => updateQuantity(item.id, +1)} className="px-2 py-1 text-xs rounded border">+</button>
                </div>
                <div>
                  <button onClick={() => handleRemoveFromCart(item.product_id ?? item.id)} className="px-2 py-1 text-xs rounded border">Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t">
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm">Total</div>
            <div className="font-semibold">${cart.reduce((s, it) => s + (it.price ?? 0) * it.quantity, 0).toFixed(2)}</div>
          </div>
          <div className="flex gap-2">
            <button className="flex-1 px-3 py-2 rounded bg-green-600 text-white">Checkout</button>
            <button onClick={() => setCartOpen(false)} className="px-3 py-2 rounded border">Continue</button>
          </div>
        </div>
      </div>

      {/* Chat modal (glassy) */}
      {chatOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50">
          <div className="w-full sm:w-[520px] rounded-xl p-4 border bg-white/30 dark:bg-gray-900/40 backdrop-blur-md">
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">Message {vendor.name}</div>
              <button onClick={() => setChatOpen(false)} className="px-2 py-1 rounded border">Close</button>
            </div>
            <div className="mb-3 text-sm text-gray-500 dark:text-gray-400">This is a chat stub — wire your real chat here.</div>
            <textarea className={`${inputClass} w-full h-28 mb-3 resize-none`} placeholder="Write a message..." />
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded bg-blue-600 text-white">Send</button>
              <button onClick={() => alert("Email sent (stub)")} className="px-4 py-2 rounded border">Email</button>
            </div>
          </div>
        </div>
      )}

      {/* Floating buttons */}
      <div className="fixed right-6 bottom-6 flex flex-col gap-3 z-40">
        <button onClick={() => setCartOpen(true)} className="p-3 rounded-full bg-gradient-to-br from-green-500 to-green-700 text-white shadow-lg transform transition hover:-translate-y-1"><ShoppingCart /></button>
        <button onClick={() => setChatOpen(true)} className="p-3 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-lg transform transition hover:-translate-y-1"><MessageCircle /></button>
        <button onClick={() => navigator.share?.({ title: vendor.name ?? "", url: window.location.href })} className="p-3 rounded-full bg-gray-800 text-white shadow-lg transform transition hover:-translate-y-1"><Share2 /></button>
      </div>
    </div>
  );
}
