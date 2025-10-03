// src/components/TopVendors.tsx
import { useEffect, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import type { VendorProfile } from "@/types";
import clsx from "clsx";

const PLACEHOLDER = "/placeholder.jpg";
const SLOTS = 8;

/** Compute a stable id for vendor rows (tries many common fields) */
const pickVendorId = (raw: any, fallbackIndex?: number) => {
  const candidates = [
    raw?.id,
    raw?.vendor_id,
    raw?.user_id,
    raw?.uid,
    raw?.uuid,
    raw?.vendor_uuid,
    raw?.profile_id,
    (raw?.vendor && raw.vendor.id) || undefined,
    raw?.email,
    raw?.vendor_email,
  ];
  for (const c of candidates) {
    if (c !== undefined && c !== null) {
      const s = String(c).trim();
      if (s !== "") return s;
    }
  }
  return `unknown-${fallbackIndex ?? Math.random().toString(36).slice(2, 8)}`;
};

const TopVendors = () => {
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const fetchVendors = async () => {
      setLoading(true);
      try {
        let res = await supabase
          .from("vendor_profiles_with_user")
          .select("*")
          .order("inserted_at", { ascending: false })
          .limit(SLOTS);

        if (res.error) {
          res = await supabase
            .from("vendor_profiles_with_user")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(SLOTS);
        }

        if (mounted && !res.error) {
          setVendors((res.data as VendorProfile[]) || []);
        }
      } catch (err) {
        if (mounted) setVendors([]);
        console.warn("TopVendors fetch error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchVendors();
    return () => {
      mounted = false;
    };
  }, []);

  const renderSkeleton = (key: number) => (
    <article
      key={`skel-${key}`}
      className="animate-pulse border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm bg-transparent"
      aria-hidden
    >
      <div className="w-fit mx-auto mb-3">
        <div className="h-16 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mx-auto mb-2" />
      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mx-auto" />
    </article>
  );

  // Always render SLOTS elements to avoid grid reflow when loading -> content
  const slotsToRender = loading ? Array.from({ length: SLOTS }).fill(null) : vendors;

  return (
    <section className="px-6 py-10 transition-colors duration-300">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-white">Top Vendors</h2>
        <button
          className="text-sm text-green-700 dark:text-green-400 hover:underline"
          onClick={() => navigate("/vendors")}
          aria-label="See all vendors"
        >
          See All Vendors →
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        {slotsToRender.length === 0 && !loading && (
          <div className="col-span-full text-center text-gray-500 dark:text-gray-400">No vendors found.</div>
        )}

        {slotsToRender.map((v, i) => {
          if (loading || !v) return renderSkeleton(i);

          const vendor = v as VendorProfile;
          const safeId = pickVendorId(vendor, i);
          const rawRating = vendor?.rating ?? 0;
          let ratingCount = Number.isFinite(Number(rawRating)) ? Math.floor(Number(rawRating)) : 0;
          ratingCount = Math.max(0, Math.min(5, ratingCount));
          const displayName = vendor.vendor_name || vendor.vendor_email || "Unnamed Vendor";

          const imgSrc =
            vendor.photo_url && typeof vendor.photo_url === "string" && vendor.photo_url.trim() !== ""
              ? vendor.photo_url
              : PLACEHOLDER;

          return (
            <article
              key={safeId}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate(`/vendor/${encodeURIComponent(safeId)}`, { state: { vendor } });
                }
              }}
              onClick={() => navigate(`/vendor/${encodeURIComponent(safeId)}`, { state: { vendor } })}
              className={clsx(
                "cursor-pointer border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm bg-white/30 dark:bg-gray-900/30 hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-green-500",
              )}
              aria-label={`Open vendor ${displayName}`}
            >
              <div className="relative w-fit mx-auto mb-3">
                <img
                  src={imgSrc}
                  alt={`Photo of ${displayName}`}
                  className="h-16 w-16 object-cover rounded-full border-2 border-green-500"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
                  }}
                />
                {vendor.verified && (
                  <span
                    className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow-sm"
                    title="Verified vendor"
                    aria-hidden
                  >
                    <CheckCircle2 className="w-4 h-4 text-blue-500" />
                  </span>
                )}
              </div>

              <h3 className="text-center text-sm font-semibold text-gray-900 dark:text-white">{displayName}</h3>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">{vendor.category || "General"}</p>

              <div className="flex justify-center mt-2 text-yellow-500" aria-hidden>
                {Array.from({ length: ratingCount }).map((_, idx) => (
                  <Star key={idx} className="w-4 h-4 fill-yellow-400" />
                ))}
                {ratingCount === 0 && <span className="text-xs text-gray-400 ml-2">No rating</span>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="text-center">
        <button
          onClick={() => navigate("/apply-vendor")}
          className="px-6 py-3 rounded-full bg-green-700 hover:bg-green-800 text-white text-sm font-semibold shadow-md transition focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          Join as a Vendor
        </button>
      </div>
    </section>
  );
};

export default TopVendors;
