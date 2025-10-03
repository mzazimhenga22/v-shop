import { useEffect, useState } from "react";
import axios from "axios";
import { UserCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

interface User {
  id: string;
  email?: string;
  user_metadata?: { name?: string } | any;
}

interface Vendor {
  id: string;
  user_id: string;
  business_name?: string;
  created_at?: string;
  user_email?: string;
  user_name?: string;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

const normalizeUsersResponse = (raw: any): User[] => {
  // support several shapes: { users: [...] }, { data: [...] }, or an array
  const arr = Array.isArray(raw) ? raw : raw?.users ?? raw?.data ?? [];
  if (!Array.isArray(arr)) return [];
  return arr.map((u: any) => ({
    id: String(u.id ?? u.user_id ?? u.uid ?? ""),
    email: u.email ?? u.user_email ?? u.email_address,
    user_metadata: u.user_metadata ?? u.raw_user_meta_data ?? u.user_metadata,
  })).filter((x: User) => !!x.id);
};

const UsersTab = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const usersReq = api.get("/admin/users");

        const tryVendorViews = async (): Promise<Vendor[]> => {
          const candidates = ["vendor_profiles_with_user", "vendor_profile_with_user"];
          for (const name of candidates) {
            const res = await supabase.from(name).select("*");
            if (res.error) {
              console.warn(`Supabase view "${name}" query error:`, res.error);
              if (String(res.error?.code) === "42P01" || String(res.error?.message || "").toLowerCase().includes("does not exist")) {
                continue;
              } else {
                throw res.error;
              }
            }
            const rows = (res.data || []) as any[];
            return rows.map((r) => ({
              id: String(r.id),
              user_id: String(r.user_id ?? r.user_id_uuid ?? ""),
              business_name: r.business_name || r.business_name_normalized || r.display_name || r.vendor_name || r.name || "",
              created_at: r.created_at,
              user_email: r.email ?? r.user_email,
              user_name: r.user_name ?? r.name ?? r.user_metadata?.name ?? r.vendor_name ?? undefined,
            })).filter((v) => !!v.user_id); // keep rows with user_id only
          }
          throw new Error("vendor_profiles view not found in DB");
        };

        const [usersRes, vendorsArr] = await Promise.all([usersReq, tryVendorViews()]);

        const normalizedUsers = normalizeUsersResponse(usersRes.data ?? usersRes);
        setUsers(normalizedUsers);
        setVendors(vendorsArr || []);
      } catch (err: any) {
        console.error("Error loading users/vendors:", err);

        // fallback path
        try {
          const fallbackUsers = await api.get("/admin/users");
          const fallbackVendors = await api.get("/api/vendors/vendor-applications");
          setUsers(normalizeUsersResponse(fallbackUsers.data ?? fallbackUsers));
          setVendors((fallbackVendors.data?.applications || fallbackVendors.data || []) as Vendor[]);
          setError("Loaded vendors from fallback API (Supabase view missing). See console for details.");
        } catch (fallbackErr: any) {
          console.error("Fallback vendor API also failed:", fallbackErr);
          setError(
            err?.message ||
              err?.response?.data?.error ||
              fallbackErr?.message ||
              "Failed to load vendors from Supabase and fallback API"
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <p className="text-center">Loading users...</p>;
  if (error) return <p className="text-center text-red-500">Error: {error}</p>;

  // build set of vendor user IDs — normalize to strings and ignore falsy
  const vendorUserIds = new Set(vendors.map((v) => String(v.user_id).trim()).filter(Boolean));

  // debug helpful log: uncomment if you need to inspect mismatches
  // console.debug("users", users.map(u => u.id).slice(0,20));
  // console.debug("vendorUserIds", Array.from(vendorUserIds).slice(0,20));

  if (users.length === 0) return <p className="text-center text-gray-500">No users found.</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Users & Vendors</h2>

      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-2">🧑 Regular Users</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {users
            .filter((user) => !vendorUserIds.has(String(user.id)))
            .map((user) => (
              <UserCard key={user.id} user={user} />
            ))}
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-2">🏪 Vendors</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {vendors.map((vendor) => {
            const user = users.find((u) => String(u.id) === String(vendor.user_id));
            if (!user) {
              return (
                <div
                  key={vendor.id}
                  className="bg-[#d3d2d2] dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-2xl shadow-sm flex flex-col gap-4 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-500 text-white rounded-full p-3">
                      <UserCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{vendor.user_name || "Unnamed"}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{vendor.user_email || "no-email@unknown"}</p>
                      <p className="text-xs text-gray-400 mt-1">Vendor ID: {vendor.id}</p>
                    </div>
                  </div>

                  <div className="mt-2 p-2 rounded bg-yellow-100 text-yellow-800 text-sm">Vendor: {vendor.business_name || "Unnamed business"}</div>
                </div>
              );
            }

            return <UserCard key={user.id} user={user} vendor={vendor} />;
          })}
        </div>
      </div>
    </div>
  );
};

const UserCard = ({ user, vendor }: { user: User; vendor?: Vendor }) => (
  <div className="bg-[#d3d2d2] dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-2xl shadow-sm flex flex-col gap-4 hover:shadow-md transition">
    <div className="flex items-center gap-4">
      <div className="bg-indigo-500 text-white rounded-full p-3">
        <UserCircle2 className="w-6 h-6" />
      </div>
      <div>
        <p className="text-lg font-semibold">{user.user_metadata?.name || vendor?.user_name || "Unnamed"}</p>
        <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
        <p className="text-xs text-gray-400 mt-1">ID: {user.id}</p>
      </div>
    </div>

    {vendor && <div className="mt-2 p-2 rounded bg-yellow-100 text-yellow-800 text-sm">Vendor: {vendor.business_name || "Unnamed business"}</div>}
  </div>
);

export default UsersTab;
