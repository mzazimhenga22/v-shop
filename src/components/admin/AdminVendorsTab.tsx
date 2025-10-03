import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { UserCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface User {
  id: string;
  email: string;
  user_metadata?: {
    name?: string;
    isAdmin?: boolean;
    isVendor?: boolean;
  };
}

const AdminVendorsTab = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // per-user action loading map { [userId]: boolean }
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  const setUserLoading = (userId: string, v: boolean) =>
    setActionLoading((s) => ({ ...s, [userId]: v }));

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data.users || []);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const promoteToAdmin = async (userId: string) => {
    if (!confirm("Promote this user to Admin?")) return;
    setUserLoading(userId, true);
    try {
      await api.post("/promote", { userId });
      alert("User promoted to admin successfully.");
      await fetchUsers();
    } catch (err: any) {
      alert("Failed to promote user: " + (err?.response?.data?.error || err?.message));
    } finally {
      setUserLoading(userId, false);
    }
  };

  const promoteToVendor = async (userId: string) => {
    if (!confirm("Promote this user to Vendor?")) return;
    setUserLoading(userId, true);
    try {
      // prefer relative path through your axios instance -- adjust path if your backend differs
      await api.post(`/api/vendors/vendor-applications/${encodeURIComponent(userId)}/promote`);
      alert("User promoted to vendor successfully.");
      await fetchUsers();
    } catch (err: any) {
      alert("Failed to promote vendor: " + (err?.response?.data?.error || err?.message));
    } finally {
      setUserLoading(userId, false);
    }
  };

  const removeVendor = async (userId: string) => {
    if (!confirm("Remove vendor role for this user? This will demote the vendor and may delete vendor data. Proceed?")) return;
    setUserLoading(userId, true);
    try {
      // Common patterns:
      // - DELETE /api/vendors/:userId  (remove vendor record)
      // - PATCH /api/vendors/:userId/demote (mark as not vendor)
      // Change the path below to match your backend.
      const res = await api.delete(`/api/vendor/${encodeURIComponent(userId)}`);
      // If backend returns success flag/message, you can show it.
      alert(res?.data?.message ?? "Vendor removed/demoted successfully.");
      await fetchUsers();
    } catch (err: any) {
      // try a fallback demote endpoint if delete isn't available
      try {
        const fallback = await api.patch(`/api/vendor/${encodeURIComponent(userId)}/demote`);
        alert(fallback?.data?.message ?? "Vendor demoted successfully (fallback).");
        await fetchUsers();
      } catch (err2: any) {
        alert("Failed to remove/demote vendor: " + (err2?.response?.data?.error || err2?.message || err?.response?.data?.error || err?.message));
      }
    } finally {
      setUserLoading(userId, false);
    }
  };

  if (loading) return <p className="text-center">Loading users...</p>;
  if (error) return <p className="text-center text-red-500">Error: {error}</p>;
  if (users.length === 0) return <p className="text-center text-gray-500">No users found.</p>;

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Admin & Vendor Management</h2>

      <div className="mb-6">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded shadow"
          onClick={() => navigate("/admin/vendor-applications")}
        >
          Applications from Vendors
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => {
          const isAdmin = user.user_metadata?.isAdmin;
          const isVendor = user.user_metadata?.isVendor;
          const uLoading = !!actionLoading[user.id];

          return (
            <div
              key={user.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 rounded-2xl shadow-sm flex flex-col gap-4 hover:shadow-md transition"
            >
              <div className="flex items-center gap-4">
                <div className="bg-indigo-500 text-white rounded-full p-3">
                  <UserCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-lg font-semibold">{user.user_metadata?.name || "Unnamed"}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                  <p className="text-xs text-gray-400 mt-1">ID: {user.id}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  disabled={isAdmin || uLoading}
                  onClick={() => promoteToAdmin(user.id)}
                  className={`text-sm font-medium py-2 px-3 rounded ${
                    isAdmin
                      ? "bg-gray-400 text-white cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }`}
                >
                  {uLoading ? "Working…" : isAdmin ? "Already an Admin" : "Promote to Admin"}
                </button>

                <div className="flex gap-2">
                  <button
                    disabled={isVendor || uLoading}
                    onClick={() => promoteToVendor(user.id)}
                    className={`flex-1 text-sm font-medium py-2 px-3 rounded ${
                      isVendor
                        ? "bg-gray-400 text-white cursor-not-allowed"
                        : "bg-yellow-600 hover:bg-yellow-700 text-white"
                    }`}
                  >
                    {uLoading ? "Working…" : isVendor ? "Already a Vendor" : "Promote to Vendor"}
                  </button>

                  {isVendor && (
                    <button
                      disabled={uLoading}
                      onClick={() => removeVendor(user.id)}
                      className="text-sm font-medium py-2 px-3 rounded bg-red-600 hover:bg-red-700 text-white"
                      title="Remove vendor role / demote"
                    >
                      {uLoading ? "Working…" : "Remove Vendor"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminVendorsTab;
