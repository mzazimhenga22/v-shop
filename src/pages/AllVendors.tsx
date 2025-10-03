// src/pages/AllVendors.tsx  (replace existing AllVendors implementation)
import { useEffect, useState } from "react";
import { Star, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import type { VendorProfile } from "@/types";

const pickVendorId = (raw: any, fallbackIndex?: number) => {
  // order of precedence for common id fields used in your DBs/views
  const candidates = [
    raw?.id,
    raw?.vendor_id,
    raw?.user_id,
    raw?.uid,
    raw?.uuid,
    raw?.vendor_uuid,
    raw?.profile_id,
    // nested vendor object (e.g. vendor: { id: '...' })
    (raw?.vendor && raw.vendor.id) || undefined,
    // fallbacks
    raw?.email,
    raw?.vendor_email,
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== "") {
      return String(c);
    }
  }

  // last resort: use index to avoid undefined paths
  return `unknown-${fallbackIndex ?? Math.random().toString(36).slice(2, 8)}`;
};

const AllVendors = () => {
  const [vendors, setVendors] = useState<VendorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchVendors = async () => {
      const { data, error } = await supabase.from("vendor_profiles_with_user").select("*");

      if (error) {
        console.error("Supabase error:", error.message);
        setLoading(false);
        return;
      }

      console.log("Raw vendor data:", data);
      setVendors(data as VendorProfile[]);
      setLoading(false);
    };

    fetchVendors();
  }, []);

  // small diagnostic helper you can open the console to inspect
  useEffect(() => {
    if (!loading && vendors.length) {
      const ids = vendors.map((v, i) => pickVendorId(v, i));
      console.log("Normalized vendor ids:", ids);
    }
  }, [vendors, loading]);

  return (
    <section className="px-6 py-10 transition-colors duration-300">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">All Vendors</h2>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 dark:text-gray-400">Loading vendors...</p>
      ) : vendors.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">No vendors found.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {vendors.map((vendor, idx) => {
            const safeId = pickVendorId(vendor, idx);

            return (
              <div
                key={safeId}
                onClick={() => navigate(`/vendor/${encodeURIComponent(safeId)}`, { state: { vendor } })}
                className="cursor-pointer border border-gray-200 dark:border-gray-700 p-4 rounded-lg shadow-sm bg-transparent hover:shadow-md transition"
              >
                <div className="relative w-fit mx-auto mb-3">
                  <img
                    src={vendor.photo_url || "/placeholder.jpg"}
                    alt={vendor.vendor_name || "Vendor"}
                    className="h-16 w-16 object-cover rounded-full border-2 border-green-500"
                  />
                  {vendor.verified && (
                    <span className="absolute -bottom-1 -right-1 bg-white dark:bg-gray-900 rounded-full p-0.5 shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-blue-500" />
                    </span>
                  )}
                </div>

                <h3 className="text-center text-sm font-semibold text-gray-900 dark:text-white">
                  {vendor.vendor_name}
                </h3>
                <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                  {vendor.category || "General"}
                </p>

                <div className="flex justify-center mt-2 text-yellow-500">
                  {[...Array(vendor.rating || 0)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400" />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default AllVendors;
