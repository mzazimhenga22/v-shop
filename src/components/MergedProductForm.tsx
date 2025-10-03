// MergedProductForm.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/types";
import ProductCard from "@/components/ProductCard";
import { Trash, Search, Edit } from "lucide-react";
import { useCategories } from "@/context/CategoryContext";
import { supabase } from "@/lib/supabaseClient";

/**
 * Unified file containing vendor & admin product management UI.
 * Mode: "vendor" | "admin"
 *
 * This version focuses on a glassmorphism aesthetic, improved spacing,
 * clearer layout (left: categories/profile, center: form, right: preview + product list).
 */

type Mode = "vendor" | "admin";

const ALL_PAYMENT_METHODS = ["card", "paypal", "apple_pay", "google_pay", "mpesa", "cod"] as const;

const initialProductState: Product = {
  id: undefined,
  name: "",
  price: 0,
  image: null,
  rating: 0,
  sale: "",
  hot: false,
  new: false,
  lowStock: false,
  category: "Best Sellers",
  stock: 0,
  description: "",
  specifications: "",
  shippingInfo: "",
  returnInfo: "",
  faqs: "",
  thumbnails: [],
};

function computeDiscountedPrice(originalPrice: number, sale: string) {
  const clean = (sale ?? "").toString().trim().toLowerCase();
  if (!clean || !(originalPrice > 0)) {
    return { finalPrice: originalPrice, discountLabel: undefined, isDiscounted: false };
  }

  const percentMatch = clean.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percentMatch) {
    const pct = parseFloat(percentMatch[1]);
    if (!Number.isNaN(pct)) {
      const finalPrice = Math.max(0, +(originalPrice * (1 - pct / 100)).toFixed(2));
      return { finalPrice, discountLabel: `${pct}% OFF`, isDiscounted: finalPrice < originalPrice };
    }
  }

  const dollarMatch = clean.match(/\$?\s*(\d+(?:\.\d+)?)(?:\s*(?:off|discount))?/);
  if (dollarMatch) {
    const amt = parseFloat(dollarMatch[1]);
    if (!Number.isNaN(amt) && amt > 0) {
      if (amt < originalPrice) {
        const finalPrice = Math.max(0, +(originalPrice - amt).toFixed(2));
        return { finalPrice, discountLabel: `$${amt} OFF`, isDiscounted: true };
      }
    }
  }

  const onlyNumberMatch = clean.match(/^(\d+(?:\.\d+)?)$/);
  if (onlyNumberMatch) {
    const num = parseFloat(onlyNumberMatch[1]);
    if (!Number.isNaN(num)) {
      if (num > 0 && num <= 100) {
        const finalPrice = Math.max(0, +(originalPrice * (1 - num / 100)).toFixed(2));
        return { finalPrice, discountLabel: `${num}% OFF`, isDiscounted: finalPrice < originalPrice };
      } else if (num > 100 && num < originalPrice) {
        const finalPrice = Math.max(0, +(originalPrice - num).toFixed(2));
        return { finalPrice, discountLabel: `$${num} OFF`, isDiscounted: true };
      }
    }
  }

  return { finalPrice: originalPrice, discountLabel: undefined, isDiscounted: false };
}

export default function MergedProductForm({
  mode = "vendor",
  onSubmit,
}: {
  mode?: Mode;
  onSubmit?: (product: Product) => void;
}) {
  const { categories, addCategory } = useCategories();

  // State
  const [product, setProduct] = useState<Product>({ ...initialProductState });
  const [mainImageFile, setMainImageFile] = useState<File | null>(null);
  const [thumbnailFiles, setThumbnailFiles] = useState<File[]>([]);
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([]);
  const [mainPreviewUrl, setMainPreviewUrl] = useState<string | null>(null);
  const [objectUrls, setObjectUrls] = useState<string[]>([]);

  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // categories UI
  const [selectedCategory, setSelectedCategory] = useState<string>(product.category ?? "Best Sellers");
  const [newCategory, setNewCategory] = useState("");
  const [searchCatTerm, setSearchCatTerm] = useState("");
  const [showAllCategories, setShowAllCategories] = useState(false);

  // vendor-specific
  const [userData, setUserData] = useState<any>(null);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [bannerPhoto, setBannerPhoto] = useState<string | null>(null);
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  const [vendorProducts, setVendorProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProductId, setEditingProductId] = useState<string | number | null>(null);

  // admin-specific
  const [categoryImageFile, setCategoryImageFile] = useState<File | null>(null);

  // refs
  const profileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const categoryImageRef = useRef<HTMLInputElement | null>(null);

  // previews
  useEffect(() => {
    if (!mainImageFile) {
      setMainPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mainImageFile);
    setMainPreviewUrl(url);
    setObjectUrls((prev) => [...prev, url]);
    return () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    };
  }, [mainImageFile]);

  useEffect(() => {
    thumbnailUrls.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch {}
    });

    if (!thumbnailFiles || thumbnailFiles.length === 0) {
      setThumbnailUrls([]);
      return;
    }
    const urls = thumbnailFiles
      .map((f) => {
        try {
          return URL.createObjectURL(f);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    setThumbnailUrls(urls);
    setObjectUrls((prev) => [...prev, ...urls]);

    return () => {
      urls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnailFiles]);

  useEffect(() => {
    setProduct((p) => ({ ...p, category: selectedCategory }));
  }, [selectedCategory]);

  useEffect(() => {
    return () => {
      objectUrls.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch {}
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auth helpers (same as before)
  async function getSessionToken(): Promise<string | null> {
    try {
      // supabase v2
      // @ts-ignore
      const resp = await supabase.auth.getSession?.();
      if (resp && (resp as any).data?.session?.access_token) return (resp as any).data.session.access_token;
    } catch {}
    try {
      // v1 fallback
      // @ts-ignore
      const s = (supabase.auth as any).session?.();
      if (s?.access_token) return s.access_token;
    } catch {}
    return null;
  }

  async function getUser(): Promise<any | null> {
    try {
      const resp = await supabase.auth.getUser?.();
      if (resp && (resp as any).data?.user) return (resp as any).data.user;
    } catch {}
    try {
      const { data } = await supabase.auth.getSession?.();
      if (data?.session?.user) return data.session.user;
    } catch {}
    try {
      // v1 fallback
      // @ts-ignore
      const s = (supabase.auth as any).session?.();
      if (s?.user) return s.user;
    } catch {}
    return null;
  }

  // payment helpers
  const parsePaymentMethods = (val: any): string[] => {
    if (!val && val !== 0) return [];
    if (Array.isArray(val)) return val.filter(Boolean).map(String);
    if (typeof val === "boolean") return [];
    if (typeof val === "string") {
      const t = val.trim();
      if (!t) return [];
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
      } catch {}
      return t.split(",").map((s) => s.trim()).filter(Boolean);
    }
    try {
      const s = String(val).trim();
      return s ? [s] : [];
    } catch {
      return [];
    }
  };

  const togglePaymentMethod = (method: string) => {
    setPaymentMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  };

  const attachPaymentMethodsToFormData = (fd: FormData, methods: string[]) => {
    fd.append("payment_methods", JSON.stringify(methods));
    methods.forEach((m) => fd.append("payment_methods[]", m));
    fd.append("paymentMethods", JSON.stringify(methods));
  };

  // fetch vendor profile & products (vendor mode)
  useEffect(() => {
    if (mode !== "vendor") return;

    let mounted = true;
    (async () => {
      const user = await getUser();
      if (!mounted) return;
      if (!user) return;
      setUserData({ id: user.id, email: user.email, name: user.user_metadata?.name || "" });

      try {
        const token = await getSessionToken();
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

        // GET vendor profile
        try {
          const profRes = await fetch("/api/vendor/profile", { headers });
          if (profRes.ok) {
            const pb = await profRes.json().catch(() => null);
            if (pb?.profile) {
              setProfilePhoto(pb.profile.photo_url || null);
              setBannerPhoto(pb.profile.banner_url || null);
            }
          }
        } catch (err) {
          console.warn("Profile fetch failed", err);
        }

        // GET vendor products
        try {
          const res = await fetch("/api/vendor/products", { headers });
          if (res.ok) {
            const body = await res.json().catch(() => null);
            const list = (body?.products || []).map((p: any) => ({
              ...p,
              payment_methods: parsePaymentMethods(p.payment_methods),
            }));
            if (mounted) setVendorProducts(list);
          }
        } catch (err) {
          console.error("Failed vendor products", err);
        }
      } catch (err) {
        console.error("Vendor init error", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [mode]);

  // profile & banner upload handlers
  const handleProfileFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setProfileFile(f);
    if (f) {
      const u = URL.createObjectURL(f);
      setProfilePhoto(u);
      setObjectUrls((prev) => [...prev, u]);
    }
  };

  const handleBannerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setBannerFile(f);
    if (f) {
      const u = URL.createObjectURL(f);
      setBannerPhoto(u);
      setObjectUrls((prev) => [...prev, u]);
    }
  };

  const uploadVendorProfileField = async (field: "photo" | "banner") => {
    try {
      const token = await getSessionToken();
      if (!token) {
        alert("Not authenticated");
        return;
      }
      const fd = new FormData();
      if (field === "photo" && profileFile) fd.append("photo", profileFile);
      if (field === "banner" && bannerFile) fd.append("banner", bannerFile);

      const res = await fetch("/api/vendor/profiles", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Upload error");
      }

      const body = await res.json().catch(() => null);
      if (body?.profile) {
        setProfilePhoto(body.profile.photo_url || profilePhoto);
        setBannerPhoto(body.profile.banner_url || bannerPhoto);
        setProfileFile(null);
        setBannerFile(null);
        if (field === "photo" && profileInputRef.current) profileInputRef.current.value = "";
        if (field === "banner" && bannerInputRef.current) bannerInputRef.current.value = "";
        alert("Uploaded profile data");
      } else {
        alert("Upload succeeded but server didn't return profile");
      }
    } catch (err: any) {
      console.error("Profile upload failed", err);
      alert("Upload failed: " + (err?.message || err));
    }
  };

  // category image upload (admin)
  const handleCategoryImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setCategoryImageFile(f);
  };

  const handleCategoryImageSubmit = async () => {
    if (!categoryImageFile || !product.category) return alert("Pick category and file");
    try {
      const fd = new FormData();
      fd.append("categoryImage", categoryImageFile);
      fd.append("categoryName", product.category);

      const res = await fetch("/api/categories/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || "Category upload failed");
      }
      alert("Category image uploaded");
      setCategoryImageFile(null);
      if (categoryImageRef.current) categoryImageRef.current.value = "";
    } catch (err: any) {
      console.error("Category upload error", err);
      alert("Failed: " + (err?.message || err));
    }
  };


  // form-data builder
  const buildFormData = async () => {
    const fd = new FormData();
    if (mainImageFile) fd.append("image", mainImageFile);
    thumbnailFiles.forEach((t) => fd.append("thumbnails", t));

    fd.append("name", product.name || "");
    fd.append("price", String(product.price ?? 0));
    fd.append("original_price", String(product.price ?? 0));
    fd.append("discounted_price", String(product.price ?? 0));
    fd.append("stock", String(product.stock ?? 0));
    fd.append("category", String(product.category ?? ""));
    fd.append("description", String(product.description ?? ""));
    fd.append("specifications", String(product.specifications ?? ""));
    fd.append("shippingInfo", String(product.shippingInfo ?? ""));
    fd.append("returnInfo", String(product.returnInfo ?? ""));
    fd.append("faqs", String(product.faqs ?? ""));
    fd.append("sale", String(product.sale ?? ""));
    fd.append("rating", String(product.rating ?? 0));
    fd.append("hot", String(Boolean(product.hot)));
    fd.append("new", String(Boolean(product.new)));
    fd.append("lowStock", String(Boolean(product.lowStock || (product.stock ?? 0) < 5)));

    attachPaymentMethodsToFormData(fd, paymentMethods);

    // NOTE: vendor_id is intentionally NOT appended from the frontend.
    // The backend will determine vendor identity from the authenticated user (or from
    // a vendor_id supplied explicitly by an admin if required). This prevents
    // requiring manual vendor-id entry in the form.

    if (mode === "admin") {
      fd.append("admin", "true");
      fd.append("is_admin", "true");
      fd.append("created_by", "admin");
      fd.append("created_by_role", "admin");
    } else {
      fd.append("admin", "false");
      fd.append("is_admin", "false");
      fd.append("created_by_role", "vendor");
    }

    return fd;
  };

  const endpointFor = (action: "create" | "update" | "delete") => {
    if (mode === "admin") return action === "delete" ? "/api/products" : "/api/products";
    return action === "delete" ? "/api/vendor/products" : "/api/vendor/products";
  };

  // create / update / delete handlers (unchanged logic)
  const handleCreate = async () => {
    setError(null);
    if (!product.name?.trim()) return setError("Provide product name");
    if (!mainImageFile) return setError("Choose main image");
    if (Number(product.price) <= 0) return setError("Price must be > 0");
    if (paymentMethods.length === 0) return setError("Select at least one payment method");

    setUploading(true);
    try {
      const token = await getSessionToken();
      if (!token) {
        setError("Not authenticated");
        setUploading(false);
        return;
      }

      const fd = await buildFormData();
      const res = await fetch(endpointFor("create"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const ct = res.headers.get("content-type") || "";
      let body: any = null;
      if (ct.includes("application/json")) {
        try {
          body = await res.json();
        } catch {}
      } else {
        try {
          body = await res.text();
        } catch {}
      }

      if (!res.ok) {
        const msg = (body && (body.error || (typeof body === "string" ? body : JSON.stringify(body)))) || `Upload failed (${res.status})`;
        setError(String(msg));
        setUploading(false);
        return;
      }

      const returned = (body && body.product) ? body.product : body;
      if (mode === "vendor") {
        setVendorProducts((prev) => [...prev, returned]);
      }
      if (onSubmit && returned) onSubmit(returned);

      setProduct({ ...initialProductState });
      setMainImageFile(null);
      setThumbnailFiles([]);
      setPaymentMethods([]);
      setError(null);
    } catch (err: any) {
      console.error("Create error", err);
      setError(err?.message || String(err) || "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdate = async () => {
    if (!product.id) return setError("No product selected for update");
    setUploading(true);
    setError(null);

    try {
      const token = await getSessionToken();
      if (!token) {
        setError("Not authenticated");
        setUploading(false);
        return;
      }

      const fd = await buildFormData();
      const res = await fetch(`${endpointFor("update")}/${product.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const ct = res.headers.get("content-type") || "";
      let body: any = null;
      if (ct.includes("application/json")) {
        try {
          body = await res.json();
        } catch {}
      } else {
        try {
          body = await res.text();
        } catch {}
      }

      if (!res.ok) {
        setError((body && (body.error || JSON.stringify(body))) || `Update failed (${res.status})`);
        setUploading(false);
        return;
      }

      const returned = (body && body.product) ? body.product : body;
      if (mode === "vendor") {
        setVendorProducts((prev) => prev.map((p) => (String(p.id) === String(returned.id) ? returned : p)));
      }
      if (onSubmit && returned) onSubmit(returned);

      setProduct({ ...initialProductState });
      setMainImageFile(null);
      setThumbnailFiles([]);
      setPaymentMethods([]);
      setEditingProductId(null);
    } catch (err: any) {
      console.error("Update error", err);
      setError(err?.message || String(err) || "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (productId?: string | number) => {
    const id = productId ?? product.id;
    if (!id) return alert("No product selected");
    if (!confirm("Delete product?")) return;
    setUploading(true);
    setError(null);

    try {
      const token = await getSessionToken();
      if (!token) {
        setError("Not authenticated");
        setUploading(false);
        return;
      }

      const res = await fetch(`${endpointFor("delete")}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Delete failed (${res.status})`);
      }

      if (mode === "vendor") {
        setVendorProducts((prev) => prev.filter((p) => String(p.id) !== String(id)));
      }
      if (String(product.id) === String(id)) {
        setProduct({ ...initialProductState });
        setMainImageFile(null);
        setThumbnailFiles([]);
        setPaymentMethods([]);
        setEditingProductId(null);
      }
      if (onSubmit) onSubmit({ ...initialProductState });
      alert("Deleted");
    } catch (err: any) {
      console.error("Delete error", err);
      setError(err?.message || String(err) || "Unknown error");
    } finally {
      setUploading(false);
    }
  };

  const startEditingVendorProduct = (p: any) => {
    setEditingProductId(p.id);
    setProduct({
      ...initialProductState,
      ...p,
    });
    setMainImageFile(null);
    setMainPreviewUrl(p.image || null);
    setThumbnailFiles([]);
    setThumbnailUrls(Array.isArray(p.thumbnails) ? p.thumbnails : []);
    setPaymentMethods(parsePaymentMethods(p.payment_methods));
  };

  const preview = useMemo(() => computeDiscountedPrice(Number(product.price || 0), product.sale || ""), [product.price, product.sale]);

  const filteredCategories = useMemo(() => categories.filter((c) => c.toLowerCase().includes(searchCatTerm.toLowerCase())), [categories, searchCatTerm]);
  const displayedCategories = showAllCategories ? filteredCategories : filteredCategories.slice(0, 8);

  // -------------------------
  // UI (glassmorphism + layout)
  // -------------------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white/60 dark:from-slate-900 dark:to-slate-900/60 p-6">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100"> {mode === "admin" ? "Admin Dashboard — Products" : "Vendor Portal"} </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage products, categories, images and vendor profile</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">Signed in as</div>
            <div className="px-3 py-2 rounded-full bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-900 dark:to-emerald-800 text-emerald-800 dark:text-emerald-200">{userData?.name ?? userData?.email ?? "—"}</div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column - categories + vendor profile */}
          <aside className="lg:col-span-3">
            <div className="sticky top-6 space-y-4">
              {/* Categories card */}
              <section className="rounded-2xl bg-white/6 dark:bg-white/3 backdrop-blur-md border border-white/6 shadow-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Categories</h3>
                  <Search className="w-4 h-4 text-slate-400" />
                </div>

                <input
                  className="w-full px-3 py-2 rounded-lg bg-white/30 dark:bg-black/20 placeholder:text-slate-400 outline-none border border-transparent focus:border-emerald-300"
                  placeholder="Search categories"
                  value={searchCatTerm}
                  onChange={(e) => setSearchCatTerm(e.target.value)}
                />

                <div className="mt-3 flex flex-wrap gap-2 max-h-52 overflow-y-auto pr-1">
                  {displayedCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-sm transition-shadow ${
                        selectedCategory === cat
                          ? "bg-emerald-400 text-black shadow-sm"
                          : "bg-white/6 dark:bg-black/20 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {filteredCategories.length > 8 && (
                  <button className="mt-3 text-sm text-emerald-500" onClick={() => setShowAllCategories(!showAllCategories)}>
                    {showAllCategories ? "Show less" : `Show all (${filteredCategories.length})`}
                  </button>
                )}

                <div className="mt-3 flex gap-2">
                  <input
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Add new category"
                    className="flex-1 px-3 py-2 rounded-lg bg-transparent border border-white/6 focus:border-emerald-300 outline-none"
                  />
                  <button
                    onClick={() => {
                      if (newCategory.trim()) {
                        addCategory(newCategory.trim());
                        setSelectedCategory(newCategory.trim());
                        setNewCategory("");
                        setSearchCatTerm("");
                      }
                    }}
                    className="px-3 py-2 rounded-lg bg-emerald-500 text-black font-medium"
                  >
                    Add
                  </button>
                </div>

                {/* NOTE: Vendor ID input removed. vendor_id is determined on the backend from the authenticated user. */}

              </section>

              {/* Vendor profile card */}
              <section className="rounded-2xl bg-white/6 dark:bg-white/3 backdrop-blur-md border border-white/6 shadow-lg p-4">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <img src={profilePhoto ?? "https://via.placeholder.com/80"} alt="profile" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{userData?.name ?? "Vendor"}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{userData?.email ?? "—"}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs mb-1">Profile Photo</label>
                  <input ref={profileInputRef} type="file" accept="image/*" onChange={handleProfileFileSelect} className="text-sm" />
                  <div className="mt-2 flex gap-2">
                    <button disabled={!profileFile} onClick={() => uploadVendorProfileField("photo")} className="px-3 py-1 rounded bg-emerald-500 text-black">Save</button>
                    <button disabled={!profileFile} onClick={() => { setProfileFile(null); if (profileInputRef.current) profileInputRef.current.value = ""; }} className="px-3 py-1 rounded bg-gray-200">Cancel</button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-xs mb-1">Banner</label>
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerFileSelect} className="text-sm" />
                  <div className="mt-2">
                    <div className="w-full h-20 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img src={bannerPhoto ?? "/placeholder-banner.jpg"} alt="banner" className="w-full h-full object-cover" />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button disabled={!bannerFile} onClick={() => uploadVendorProfileField("banner")} className="px-3 py-1 rounded bg-emerald-500 text-black">Save</button>
                      <button disabled={!bannerFile} onClick={() => { setBannerFile(null); if (bannerInputRef.current) bannerInputRef.current.value = ""; }} className="px-3 py-1 rounded bg-gray-200">Cancel</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </aside>

          {/* Center column - main form */}
          <main className="lg:col-span-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                product.id ? handleUpdate() : handleCreate();
              }}
              className="rounded-3xl p-6 bg-white/6 dark:bg-black/30 backdrop-blur-md border border-white/6 shadow-2xl"
            >
              <div className="flex items-start gap-6">
                <div className="flex-1">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1">Product Name</label>
                      <input
                        value={product.name}
                        onChange={(e) => setProduct((p) => ({ ...p, name: e.target.value }))}
                        className="w-full px-4 py-2 rounded-lg bg-transparent border border-white/6 focus:border-emerald-300 outline-none"
                        placeholder="Awesome sneakers..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Price ($)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={product.price}
                        onChange={(e) => setProduct((p) => ({ ...p, price: +(e.target.value || 0) }))}
                        className="w-full px-4 py-2 rounded-lg bg-transparent border border-white/6 focus:border-emerald-300 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm mb-1">Stock Quantity</label>
                      <input type="number" value={product.stock} onChange={(e) => setProduct((p) => ({ ...p, stock: Number(e.target.value) }))} className="w-full px-4 py-2 rounded-lg bg-transparent border border-white/6 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Rating</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button key={s} type="button" onClick={() => setProduct((p) => ({ ...p, rating: s }))} className={`text-2xl ${s <= (product.rating || 0) ? "text-yellow-400" : "text-slate-400"}`}>★</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm mb-1">Description</label>
                    <textarea value={product.description} onChange={(e) => setProduct((p) => ({ ...p, description: e.target.value }))} rows={4} className="w-full p-3 rounded-lg bg-transparent border border-white/6 outline-none" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm mb-1">Specifications</label>
                      <textarea value={product.specifications} onChange={(e) => setProduct((p) => ({ ...p, specifications: e.target.value }))} rows={3} className="w-full p-3 rounded-lg bg-transparent border border-white/6 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">Shipping Info</label>
                      <textarea value={product.shippingInfo} onChange={(e) => setProduct((p) => ({ ...p, shippingInfo: e.target.value }))} rows={3} className="w-full p-3 rounded-lg bg-transparent border border-white/6 outline-none" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm mb-1">Return Info</label>
                      <textarea value={product.returnInfo} onChange={(e) => setProduct((p) => ({ ...p, returnInfo: e.target.value }))} rows={3} className="w-full p-3 rounded-lg bg-transparent border border-white/6 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm mb-1">FAQs (raw)</label>
                      <textarea value={product.faqs} onChange={(e) => setProduct((p) => ({ ...p, faqs: e.target.value }))} rows={3} placeholder="Store plain text; backend saves raw string" className="w-full p-3 rounded-lg bg-transparent border border-white/6 outline-none" />
                    </div>
                  </div>

                  {/* Images */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm mb-1">Main Image</label>
                      <input type="file" accept="image/*" onChange={(e) => setMainImageFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
                      <div className="mt-3 flex items-center gap-3">
                        <div className="w-28 h-20 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800">
                          {mainPreviewUrl ? <img src={mainPreviewUrl} alt="Main preview" className="w-full h-full object-cover" /> : product.image ? <img src={product.image as string} alt="existing" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">No image</div>}
                        </div>
                        {mainPreviewUrl && <button type="button" onClick={() => { setMainImageFile(null); setMainPreviewUrl(null); }} className="px-2 py-1 rounded bg-red-500 text-white">Remove</button>}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm mb-1">Thumbnails</label>
                      <input type="file" accept="image/*" multiple onChange={(e) => setThumbnailFiles((prev) => [...prev, ...Array.from(e.target.files || [])])} className="block w-full text-sm" />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {thumbnailUrls.map((u, i) => (
                          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden">
                            <img src={u} alt={`thumb-${i}`} className="w-full h-full object-cover" />
                            <button onClick={() => setThumbnailFiles((prev) => prev.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 p-1 rounded-full text-white"><Trash size={12} /></button>
                          </div>
                        ))}
                        {!thumbnailUrls.length && Array.isArray(product.thumbnails) && product.thumbnails.map((t: any, i: number) => (
                          <div key={i} className="w-20 h-20 rounded-lg overflow-hidden"><img src={t} alt={`existing-thumb-${i}`} className="w-full h-full object-cover" /></div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm mb-1">Sale (Optional)</label>
                    <input value={product.sale} onChange={(e) => setProduct((p) => ({ ...p, sale: e.target.value }))} placeholder="e.g. 30% Off or $30 off" className="w-full px-3 py-2 rounded-lg bg-transparent border border-white/6 outline-none" />
                    <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">Preview price: <strong>${preview.finalPrice.toFixed(2)}</strong> {preview.discountLabel && <span className="ml-2 text-sm text-emerald-500">• {preview.discountLabel}</span>}</div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 mt-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={product.hot} onChange={(e) => setProduct((p) => ({ ...p, hot: e.target.checked }))} />
                      <span className="text-sm">Hot</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={product.new} onChange={(e) => setProduct((p) => ({ ...p, new: e.target.checked }))} />
                      <span className="text-sm">New</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={product.lowStock} onChange={(e) => setProduct((p) => ({ ...p, lowStock: e.target.checked }))} />
                      <span className="text-sm">Low stock</span>
                    </label>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm mb-2">Payment Methods <span className="text-xs text-slate-400">(required)</span></label>
                    <div className="flex flex-wrap gap-2">
                      {ALL_PAYMENT_METHODS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => togglePaymentMethod(m)}
                          className={`px-3 py-1 rounded-full text-sm transition ${
                            paymentMethods.includes(m) ? "bg-emerald-400 text-black" : "bg-white/6 dark:bg-black/20 text-slate-700 dark:text-slate-200"
                          }`}
                        >
                          {m === "card" ? "Card" : m === "mpesa" ? "M-Pesa" : m.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">Select at least one payment method so checkout can process orders for this product.</div>
                  </div>
                </div>

                {/* Right small column inside the form: SKU preview / quick stats */}
                <div className="w-44 hidden md:block">
                  <div className="rounded-xl p-3 bg-white/4 dark:bg-black/20 border border-white/6">
                    <div className="text-xs text-slate-400 mb-2">Quick Preview</div>
                    <div className="w-full h-28 rounded-md overflow-hidden bg-slate-100 dark:bg-slate-800">
                      <img src={mainPreviewUrl ?? (product.image as string | null) ?? "/placeholder.png"} alt="quick" className="w-full h-full object-cover" />
                    </div>
                    <div className="mt-3">
                      <div className="text-sm font-medium">{product.name || "Untitled"}</div>
                      <div className="text-xs text-slate-500">${preview.finalPrice.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center gap-3">
                {error && <div className="text-red-500 text-sm px-3 py-2 rounded bg-red-50 dark:bg-red-900/10">{error}</div>}
                <div className="flex-1" />
                {product.id ? (
                  <>
                    <button type="button" onClick={handleUpdate} disabled={uploading} className="px-4 py-2 rounded-full bg-yellow-500 text-white shadow"> {uploading ? "Saving..." : "Save changes"} </button>
                    <button type="button" onClick={() => handleDelete(product.id)} disabled={uploading} className="px-4 py-2 rounded-full bg-red-500 text-white">Delete</button>
                    <button type="button" onClick={() => { setProduct({ ...initialProductState }); setMainImageFile(null); setThumbnailFiles([]); setPaymentMethods([]); setEditingProductId(null); }} className="px-4 py-2 rounded-full bg-gray-200 text-slate-700">Clear</button>
                  </>
                ) : (
                  <button type="button" onClick={handleCreate} disabled={uploading} className="px-6 py-2 rounded-full bg-emerald-500 text-black shadow-lg"> {uploading ? "Uploading..." : "Add Product"} </button>
                )}

                {mode === "admin" && (
                  <button type="button" onClick={handleCategoryImageSubmit} className="px-3 py-2 rounded bg-sky-600 text-white ml-2">Upload Cat Image</button>
                )}
              </div>
            </form>
          </main>

          {/* Right column - preview + product list */}
          <aside className="lg:col-span-3">
            <div className="sticky top-6 space-y-4">
              {/* Live preview */}
              <div className="rounded-2xl p-4 bg-white/6 dark:bg-black/30 backdrop-blur-md border border-white/6 shadow-lg">
                <h4 className="text-sm font-semibold mb-3 text-center">📦 Live Preview</h4>
                <div className="flex justify-center">
                  <ProductCard
                    product={{
                      id: product.id ?? 0,
                      name: product.name || "Untitled",
                      price: preview.finalPrice,
                      image: mainPreviewUrl ?? (product.image as string | null),
                      thumbnails: thumbnailUrls.length ? thumbnailUrls : (Array.isArray(product.thumbnails) ? product.thumbnails : []),
                      rating: product.rating ?? 0,
                      stock: product.stock ?? 0,
                      category: product.category ?? "",
                      lowStock: Boolean(product.stock && product.stock < 5),
                      hot: Boolean(product.hot),
                      new: Boolean(product.new),
                      payment_methods: paymentMethods,
                    } as Product}
                    onEdit={() => {}}
                    onDelete={() => {}}
                  />
                </div>
              </div>

              {/* Product list */}
              <div className="rounded-2xl p-4 bg-white/6 dark:bg-black/30 backdrop-blur-md border border-white/6 shadow-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-lg font-semibold">Product List</h4>
                  <div className="text-xs text-slate-400">Manage</div>
                </div>

                <input type="text" placeholder="Search products..." className="w-full p-2 rounded-lg bg-transparent border border-white/6 mb-3 outline-none" onChange={(e) => setSearchQuery(e.target.value)} />

                <div className="max-h-[380px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="py-2 text-left">Name</th>
                        <th className="py-2 text-left">Price</th>
                        <th className="py-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(vendorProducts || [])
                        .filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                        .map((p) => (
                          <tr key={String(p.id)} className="border-t border-white/6">
                            <td className="py-2">
                              <div className="flex items-center gap-2">
                                <div className="w-10 h-10 rounded overflow-hidden bg-slate-100 dark:bg-slate-800">
                                  {p.image ? <img src={p.image as string} alt={p.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">No img</div>}
                                </div>
                                <div>
                                  <div className="text-sm font-medium">{p.name}</div>
                                  <div className="text-xs text-slate-400">{p.category}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2">${p.price}</td>
                            <td className="py-2">
                              <div className="flex gap-2">
                                <button onClick={() => startEditingVendorProduct(p)} className="p-2 rounded bg-yellow-200"><Edit size={14} /></button>
                                <button onClick={() => handleDelete(p.id)} className="p-2 rounded bg-red-200"><Trash size={14} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
