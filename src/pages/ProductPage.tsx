import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import {
  Star,
  Heart,
  Minus,
  Plus,
  Facebook,
  Twitter,
  ShoppingBag,
  Share2,
  Tag,
  Truck,
  ShieldCheck,
  Zap,
  Clock,
  X,
} from "lucide-react";
import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabaseClient";

/* ---------- unchanged UI helpers ---------- */
const tabs = ["Description", "Customer Reviews", "Specifications", "Shipping & Returns", "FAQs"];

const GlassCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <div
    className={clsx(
      "bg-white/6 dark:bg-black/30 backdrop-blur-md border border-white/6 dark:border-white/6 rounded-2xl p-6",
      className
    )}
  >
    {children}
  </div>
);

const IconBadge: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-2 text-sm text-gray-400">
    <div className="p-2 rounded-md bg-white/3 dark:bg-black/40">{icon}</div>
    <div>{text}</div>
  </div>
);

const QuantityControl: React.FC<{ value: number; onChange: (n: number) => void; max?: number }> = ({ value, onChange, max }) => (
  <div className="inline-flex items-center rounded-md overflow-hidden border dark:border-gray-700">
    <button
      onClick={() => onChange(Math.max(1, value - 1))}
      className="px-3 py-2 hover:bg-white/5"
      aria-label="decrement"
    >
      <Minus className="w-4 h-4" />
    </button>
    <div className="px-4 py-2 min-w-[48px] text-center">{value}</div>
    <button
      onClick={() => onChange(max ? Math.min(max, value + 1) : value + 1)}
      className="px-3 py-2 hover:bg-white/5"
      aria-label="increment"
    >
      <Plus className="w-4 h-4" />
    </button>
  </div>
);

const RatingStars: React.FC<{ rating?: number }> = ({ rating = 0 }) => (
  <div className="flex items-center gap-1">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} className={clsx("w-4 h-4", i < Math.round(rating) ? "fill-yellow-400 text-yellow-400" : "text-gray-400")} />
    ))}
  </div>
);

/* ---------- helper: normalize payment methods (kept) ---------- */
function normalizePaymentMethods(v: any) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      if (Array.isArray(p)) return p.map(String);
    } catch {}
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  if (typeof v === "object") return Object.values(v).map(String).filter(Boolean);
  return [];
}

/* ---------- Main component with authoritative fetch/merge ---------- */
export default function ProductPageSleek() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();

  // productData holds the authoritative product object used by UI
  const initialFromState = (location.state as any)?.product ?? null;
  const [productData, setProductData] = useState<any>(initialFromState);
  const [loading, setLoading] = useState<boolean>(false);

  const { addToCart } = useCart();

  // local UI state (same as before)
  const [selectedImage, setSelectedImage] = useState<string | null>(initialFromState?.image ?? null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<string | null>(initialFromState?.variants?.[0] ?? null);
  const [wishlisted, setWishlisted] = useState(false);
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [showReviews, setShowReviews] = useState(false);
  const [pmOnPage, setPmOnPage] = useState<string[] | null>(
    Array.isArray(initialFromState?.payment_methods) ? initialFromState.payment_methods : null
  );
  const [deliveryZip, setDeliveryZip] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState<string | null>(null);

  // vendor name state (new)
  const [vendorName, setVendorName] = useState<string | null>(initialFromState?.vendor_name ?? null);

  // thumbnails builder
  const thumbnails = (productData?.thumbnails && Array.isArray(productData.thumbnails)
    ? productData.thumbnails
    : productData?.image ? [productData.image] : [])
    .filter(Boolean) as string[];

  // If the current productData is partial (or missing) fetch authoritative data.
  useEffect(() => {
    let mounted = true;

    async function fetchProductById(id: string | number) {
      setLoading(true);
      try {
        // Try vendor_product first (if your app uses it), then products table
        const tryTables = ["vendor_product", "products"];
        let fetched: any = null;
        for (const tbl of tryTables) {
          try {
            const { data, error } = await supabase.from(tbl).select("*").eq("id", id).maybeSingle();
            if (!error && data) {
              fetched = data;
              break;
            }
          } catch (err) {
            // continue to next table
          }
        }

        if (!fetched) {
          // As a fallback try your public API endpoint if you have one:
          try {
            const resp = await fetch(`/api/products/${encodeURIComponent(String(id))}`);
            if (resp.ok) {
              const json = await resp.json();
              if (json?.product) fetched = json.product;
            }
          } catch {}
        }

        if (!fetched) {
          // nothing found
          if (mounted) {
            // redirect to listing — keep behavior similar to original code
            navigate("/products");
          }
          return;
        }

        // Normalize some commonly-named fields (so UI is consistent)
        const normalized = {
          ...fetched,
          // support both snake_case and camelCase from different tables/APIs:
          description: fetched.description ?? fetched.desc ?? fetched.details ?? null,
          specifications: fetched.specifications ?? fetched.specs ?? fetched.spec ?? null,
          shippingInfo: fetched.shippingInfo ?? fetched.shipping_info ?? fetched.shipping ?? null,
          returnInfo: fetched.returnInfo ?? fetched.return_info ?? null,
          faqs: fetched.faqs ?? fetched.FAQs ?? null,
          thumbnails: Array.isArray(fetched.thumbnails) ? fetched.thumbnails : (fetched.thumbnail ? [fetched.thumbnail] : (fetched.images ? fetched.images : null)),
          payment_methods: normalizePaymentMethods(fetched.payment_methods ?? fetched.paymentMethods ?? fetched.payment_methods_json),
        };

        if (mounted) {
          setProductData(normalized);
          // set selected image to fetched image if not already selected
          setSelectedImage((s) => s ?? (normalized.image ?? null));
          // set pmOnPage if not set
          setPmOnPage((p) => (p !== null ? p : normalized.payment_methods ?? []));
          setSelectedVariant((v) => v ?? (Array.isArray(normalized.variants) ? normalized.variants[0] ?? null : null));
        }
      } catch (err) {
        console.error("Product fetch failed:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    const idFromParams = params?.id ?? (initialFromState?.id ?? null);
    if (!productData && idFromParams) {
      fetchProductById(idFromParams);
    } else if (productData) {
      // If we have partial product from state, but some important fields are missing,
      // fetch authoritative copy (merge) — avoid refetching when complete.
      const needsFetch =
        (productData.description === undefined || productData.specifications === undefined || productData.stock === undefined || productData.rating === undefined)
          && (productData.id !== undefined);
      if (needsFetch) {
        fetchProductById(productData.id);
      }
    }

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  // fetch authoritative payment_methods if pmOnPage is null (silent)
// inside ProductPage component
useEffect(() => {
  if (!productData) return;
  if (productData.vendor_name) {
    setVendorName(productData.vendor_name);
    return;
  }

  const vendorId = productData.vendor_id ?? productData.vendor ?? null;
  if (!vendorId) return;

  let mounted = true;
  (async () => {
    try {
      // 1) Try the view that contains vendor_name (preferred)
      try {
        // vendor_profiles_with_user exposes vendor_name and user_id
        const { data: vpw, error: vpwErr } = await supabase
          .from("vendor_profiles_with_user")
          .select("vendor_name, user_id, photo_url")
          // try both user_id and id (some setups might use id)
          .or(`user_id.eq.${vendorId},id.eq.${vendorId}`)
          .maybeSingle();

        if (!vpwErr && vpw && (vpw as any).vendor_name) {
          if (mounted) setVendorName((vpw as any).vendor_name);
          return;
        }
      } catch (err) {
        console.warn("vendor_profiles_with_user query failed:", err);
      }

      // 2) Try vendor_profiles directly (profile table)
      try {
        const { data: vp, error: vpErr } = await supabase
          .from("vendor_profiles")
          .select("id, user_id")
          .or(`id.eq.${vendorId},user_id.eq.${vendorId}`)
          .maybeSingle();

        if (!vpErr && vp) {
          // If we found a profile, try to read vendor_name from the view by user_id
          const uid = (vp as any).user_id ?? (vp as any).id;
          if (uid) {
            const { data: vpw2 } = await supabase
              .from("vendor_profiles_with_user")
              .select("vendor_name")
              .eq("user_id", uid)
              .maybeSingle();

            if (vpw2 && (vpw2 as any).vendor_name) {
              if (mounted) setVendorName((vpw2 as any).vendor_name);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("vendor_profiles query failed:", err);
      }

      // 3) last resort: use product-provided fields
      const fallback = productData.vendor_name ?? productData.seller_name ?? productData.vendorName ?? null;
      if (mounted) setVendorName(fallback ?? null);
    } catch (err) {
      console.warn("Unexpected error resolving vendor name:", err);
    }
  })();

  return () => {
    mounted = false;
  };
}, [productData]);


  // redirect if no product id available after attempts
  useEffect(() => {
    // If there is no productData and we are not loading, navigate to products
    if (!productData && !loading) {
      // If there's no id param either, follow original behavior
      if (!params?.id) navigate("/products");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productData, loading]);

  // quantity helpers remain same
  const increment = () => setQuantity((q) => Math.min((productData?.stock ?? 9999), q + 1));
  const decrement = () => setQuantity((q) => Math.max(1, q - 1));

  // Helper: resolve vendor id & name consistently
  const resolvedVendorId = productData ? (productData.vendor_id ?? (productData.vendor !== undefined ? String(productData.vendor) : undefined)) : undefined;
  const resolvedVendorName = vendorName ?? productData?.vendor_name ?? productData?.seller_name ?? null;

  const handleAddToCart = () => {
    if (!productData) return;

    // Build cart item with vendor info
    const cartItem: any = {
      id: String(productData.id ?? Date.now()),
      name: productData.name,
      price: productData.price,
      quantity,
      image: (selectedImage ?? productData.image) ?? undefined,
      variant: selectedVariant ?? undefined,
      vendor: Boolean(resolvedVendorId),
      vendor_id: resolvedVendorId ?? undefined,
      vendor_name: resolvedVendorName ?? undefined,
      payment_methods: pmOnPage ?? [],
    };

    addToCart(cartItem);
    toastAdd("Added to cart");
  };

  const handleBuyNow = () => {
    if (!productData) return;

    // Add to cart first (keeps cart consistent)
    handleAddToCart();

    // Pass vendor information to checkout page via router state
    // Checkout can read location.state.vendor and location.state.vendor_id (optional)
    navigate("/checkout", {
      state: {
        fromProductId: String(productData.id ?? ""),
        vendor_name: resolvedVendorName ?? undefined,
        vendor_id: resolvedVendorId ?? undefined,
      },
    });
  };

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const toastAdd = (t: string) => {
    setToast(t);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200) as unknown as number;
  };

  // delivery estimator (unchanged)
  useEffect(() => {
    if (!deliveryZip) return setEstimatedDelivery(null);
    const eta = Math.random() > 0.5 ? "2–3 business days" : "3–5 business days";
    setEstimatedDelivery(eta);
  }, [deliveryZip]);

  if (!productData) return null;

  // safe src helper
  const safeSrc = (s: string | null | undefined) => (s ?? undefined);

  /* ---------- UI: identical to your original code but using productData instead of product ---------- */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/40 dark:from-black/20 to-transparent py-12 px-4 sm:px-6 lg:px-20">
      <div className="max-w-7xl mx-auto grid lg:grid-cols-12 gap-10 items-start">
        {/* Left: Gallery */}
        <div className="lg:col-span-6">
          <div className="rounded-2xl overflow-hidden shadow-2xl">
            <div className="relative bg-gradient-to-br from-white/40 to-white/10 dark:from-black/40 dark:to-black/20 p-6 rounded-2xl">
              <img
                src={safeSrc(selectedImage ?? productData.image)}
                alt={productData.name}
                className="w-full h-[520px] object-cover rounded-xl transform transition-transform duration-300 hover:scale-105 cursor-zoom-in"
                onClick={() => setLightboxOpen(true)}
              />
              <div className="mt-4 flex gap-3 overflow-auto">
                {thumbnails.map((t: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(t)}
                    className={clsx(
                      "w-16 h-16 rounded-md overflow-hidden border-2 transition-transform",
                      selectedImage === t ? "scale-105 border-green-400" : "border-transparent hover:scale-105"
                    )}
                  >
                    <img src={safeSrc(t)} alt={`thumb-${i}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* small features row */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <GlassCard className="flex items-center justify-center gap-3">
              <ShieldCheck className="w-5 h-5 text-green-400" />
              <div className="text-xs">Secure checkout</div>
            </GlassCard>
            <GlassCard className="flex items-center justify-center gap-3">
              <Truck className="w-5 h-5 text-blue-400" />
              <div className="text-xs">Free returns 30d</div>
            </GlassCard>
            <GlassCard className="flex items-center justify-center gap-3">
              <Zap className="w-5 h-5 text-yellow-400" />
              <div className="text-xs">Fast shipping</div>
            </GlassCard>
          </div>
        </div>

        {/* Right: Details */}
        <div className="lg:col-span-6 space-y-6 sticky top-24">
          <GlassCard>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold">{productData.name}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <RatingStars rating={productData.rating ?? 0} />
                  <div className="text-sm text-gray-400">{productData.reviews ?? 0} reviews</div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-bold text-green-600">${productData.price}</div>
                {productData.compare_at && (
                  <div className="text-sm text-gray-400 line-through">${productData.compare_at}</div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm text-gray-400">Availability</div>
                <div className="mt-1 text-sm font-medium">{(productData.stock ?? 0) > 0 ? `In stock (${productData.stock})` : "Out of stock"}</div>
                <div className="w-full bg-white/6 rounded-full h-2 mt-2 overflow-hidden">
                  <div className="h-2 bg-green-400 rounded-full" style={{ width: `${(productData.stock ?? 0) > 0 ? 60 : 0}%` }} />
                </div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <button
                  title="Add to Wishlist"
                  onClick={() => setWishlisted(!wishlisted)}
                  className={clsx(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-md transition",
                    wishlisted ? "bg-red-600 text-white" : "bg-white/3 text-gray-200"
                  )}
                >
                  <Heart className="w-4 h-4" />
                  {wishlisted ? "Saved" : "Wishlist"}
                </button>

                <div className="text-xs text-gray-400">Vendor: <Link to={`/vendor/${resolvedVendorId ?? ""}`} className="text-green-400 hover:underline">{productData.vendor_name ?? vendorName ?? "Seller"}</Link></div>
              </div>
            </div>

            {productData.variants?.length > 0 && (
              <div className="mt-4">
                <div className="text-sm text-gray-400 mb-2">Choose variant</div>
                <div className="flex gap-2 flex-wrap">
                  {productData.variants.map((v: string) => (
                    <button
                      key={v}
                      onClick={() => setSelectedVariant(v)}
                      className={clsx(
                        "px-4 py-2 rounded-md border text-sm",
                        selectedVariant === v ? "bg-green-600 text-white border-green-600" : "bg-white/3 text-gray-200 border-transparent"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex items-center gap-4 justify-between">
              <QuantityControl value={quantity} onChange={setQuantity} max={productData.stock ?? 9999} />

              <div className="flex gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={(productData.stock ?? 0) === 0}
                  className={clsx(
                    "px-5 py-3 rounded-lg font-medium shadow-md transition",
                    (productData.stock ?? 0) === 0 ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white"
                  )}
                >
                  <ShoppingBag className="inline-block w-4 h-4 mr-2" />
                  Add to cart
                </button>

                <button
                  onClick={handleBuyNow}
                  disabled={(productData.stock ?? 0) === 0}
                  className={clsx(
                    "px-4 py-3 rounded-lg font-medium border transition",
                    (productData.stock ?? 0) === 0 ? "border-gray-400 text-gray-400" : "border-white/6 text-white/90 bg-white/3 hover:bg-white/6"
                  )}
                >
                  Buy now
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <div className="text-sm text-gray-400">Delivery estimate</div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={deliveryZip}
                    onChange={(e) => setDeliveryZip(e.target.value)}
                    placeholder="ZIP / Postal code"
                    className="flex-1 px-3 py-2 rounded-md bg-white/5"
                  />
                  <button onClick={() => setEstimatedDelivery("2–4 business days")} className="px-3 py-2 rounded-md bg-white/3">Check</button>
                </div>
                {estimatedDelivery && <div className="mt-2 text-sm text-gray-300">Estimated: <strong>{estimatedDelivery}</strong></div>}
              </div>

              <div className="flex flex-col gap-2">
                <IconBadge icon={<ShieldCheck className="w-4 h-4 text-green-400" />} text="2-year warranty" />
                <IconBadge icon={<Clock className="w-4 h-4 text-gray-300" />} text="Ships 1–2 days" />
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                {tabs.map((t) => (
                  <button key={t} onClick={() => setActiveTab(t)} className={clsx("pb-2 font-medium transition", activeTab === t ? "border-b-2 border-green-400 text-green-500" : "text-gray-400")}>{t}</button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => setShowReviews(true)} className="text-sm px-3 py-2 rounded-md bg-white/4">Read reviews</button>
                <button className="text-sm px-3 py-2 rounded-md border">Compare</button>
              </div>
            </div>

            <div className="mt-4 text-sm text-gray-300 leading-relaxed">
              {activeTab === "Description" && <div dangerouslySetInnerHTML={{ __html: productData.description ?? "<p>No description provided.</p>" }} />}
              {activeTab === "Customer Reviews" && <div>{productData.reviews_list ? productData.reviews_list : "No reviews yet. Be the first!"}</div>}
              {activeTab === "Specifications" && (
                <table className="w-full text-sm">
                  <tbody>
                    <tr><td className="py-2 text-gray-400">Brand</td><td className="py-2">{productData.brand ?? "—"}</td></tr>
                    <tr><td className="py-2 text-gray-400">Material</td><td className="py-2">{productData.material ?? "—"}</td></tr>
                    <tr><td className="py-2 text-gray-400">Dimensions</td><td className="py-2">{productData.dimensions ?? "—"}</td></tr>
                    <tr><td className="py-2 text-gray-400">Warranty</td><td className="py-2">{productData.warranty ?? "1 year"}</td></tr>
                    {productData.specifications && (
                      <tr><td className="py-2 text-gray-400">Specifications</td><td className="py-2"><pre className="whitespace-pre-wrap text-xs">{typeof productData.specifications === "string" ? productData.specifications : JSON.stringify(productData.specifications, null, 2)}</pre></td></tr>
                    )}
                  </tbody>
                </table>
              )}
              {activeTab === "Shipping & Returns" && <div>{productData.shippingInfo ?? "Ships within 1-3 business days. Free returns within 30 days."}</div>}
              {activeTab === "FAQs" && (
                <div className="space-y-3">
                  {Array.isArray(productData.faqs) ? (
                    productData.faqs.map((f: any, i: number) => (
                      <details key={i} className="bg-white/3 p-3 rounded-md"><summary className="cursor-pointer font-medium">{f.q ?? `Question ${i+1}`}</summary><div className="mt-2 text-sm">{f.a ?? f.answer ?? "—"}</div></details>
                    ))
                  ) : (
                    <>
                      <details className="bg-white/3 p-3 rounded-md"><summary className="cursor-pointer font-medium">Is this item returnable?</summary><div className="mt-2 text-sm">Yes, within 30 days.</div></details>
                      <details className="bg-white/3 p-3 rounded-md"><summary className="cursor-pointer font-medium">Does it have a warranty?</summary><div className="mt-2 text-sm">Yes — {productData.warranty ?? "1 year"} limited warranty.</div></details>
                    </>
                  )}
                </div>
              )}
            </div>
          </GlassCard>

          {/* Related & social */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassCard className="flex items-center justify-between">
              <div>
                <div className="text-xs text-gray-400">Share</div>
                <div className="flex gap-2 mt-2">
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-md bg-white/4"><Facebook className="w-4 h-4" /></a>
                  <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(window.location.href)}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-md bg-white/4"><Twitter className="w-4 h-4" /></a>
                  <button onClick={() => navigator.share?.({ title: productData.name, url: window.location.href })} className="p-2 rounded-md bg-white/4"><Share2 className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-400">Tags</div>
                <div className="mt-2 flex gap-2">
                  {(productData.tags ?? ["featured"]).slice(0, 3).map((t: string) => <div key={t} className="px-3 py-1 rounded-md bg-white/3 text-sm">{t}</div>)}
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <div className="text-sm text-gray-400">Trust</div>
              <div className="mt-3 flex gap-3">
                <IconBadge icon={<ShieldCheck className="w-4 h-4 text-green-400" />} text="Secure payments" />
                <IconBadge icon={<Tag className="w-4 h-4 text-gray-300" />} text="Best price" />
              </div>
            </GlassCard>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="relative max-w-4xl w-full">
            <button onClick={() => setLightboxOpen(false)} className="absolute top-3 right-3 p-2 rounded-full bg-white/6"><X className="w-5 h-5" /></button>
            <img src={safeSrc(selectedImage ?? productData.image)} alt={productData.name} className="w-full h-[80vh] object-contain rounded-md bg-white/3" />
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 bg-green-600 text-white px-5 py-3 rounded-lg shadow-lg z-60">{toast}</div>
      )}

      {/* Mobile sticky bar */}
      <div className="fixed left-0 right-0 bottom-4 sm:bottom-8 flex justify-center lg:hidden z-40">
        <div className="w-[95%] rounded-xl p-3 backdrop-blur-md bg-white/6 border border-white/6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={safeSrc(selectedImage ?? productData.image)} alt="mini" className="w-12 h-12 object-cover rounded-md" />
            <div>
              <div className="text-sm font-medium">{productData.name}</div>
              <div className="text-sm text-green-400 font-semibold">${productData.price}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleAddToCart} className="px-4 py-2 rounded-md bg-green-600 text-white">Add</button>
            <button onClick={handleBuyNow} className="px-4 py-2 rounded-md border">Buy</button>
          </div>
        </div>
      </div>
    </div>
  );
}
