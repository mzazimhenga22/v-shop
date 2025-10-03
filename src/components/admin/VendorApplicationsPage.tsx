import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ correct for App Router
import api from "@/lib/axios";
import { Mail, Loader2 } from "lucide-react";

interface VendorApplication {
  id: string;
  email: string;
  name: string;
  message: string;
  submittedAt: string;
  reviewed: boolean;
}

const VendorApplicationsPage = () => {
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const res = await api.get("http://localhost:4000/api/vendors/vendor-applications");
        setApplications(res.data.applications || []);
      } catch (err: any) {
        setError(err?.response?.data?.error || err?.message || "Failed to fetch applications");
      } finally {
        setLoading(false);
      }
    };

    fetchApplications();
  }, []);

  const markAsReviewed = async (id: string) => {
    try {
      await api.patch(`http://localhost:4000/api/vendors/vendor-applications/${id}/review`);
      setApplications((prev) =>
        prev.map((app) => (app.id === id ? { ...app, reviewed: true } : app))
      );
    } catch (err: any) {
      console.error("Mark review error:", err.response?.data);
      alert("Error marking as reviewed: " + (err.response?.data?.error || err.message));
    }
  };

  const promoteToVendor = async (id: string) => {
    try {
      await api.patch(`http://localhost:4000/api/vendors/vendor-applications/${id}/promote`);
      navigate("/admin-dashboard");
    } catch (err: any) {
      console.error("Promote error:", err.response?.data);
      alert("Error promoting user: " + (err.response?.data?.error || err.message));
    }
  };

  if (loading)
    return (
      <div className="flex justify-center mt-10">
        <Loader2 className="animate-spin h-6 w-6 text-gray-500" />
      </div>
    );

  if (error)
    return <p className="text-center text-red-500 mt-4">{error}</p>;

  if (applications.length === 0)
    return <p className="text-center text-gray-500 mt-4">No vendor applications found.</p>;

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h2 className="text-3xl font-bold mb-6">Vendor Applications</h2>
      <div className="bg-white dark:bg-gray-900 border rounded-xl shadow-sm divide-y">
        {applications.map((app) => (
          <div
            key={app.id}
            className="p-4 flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <div className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-full p-2">
              <Mail className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold text-lg">{app.name}</p>
                  <p className="text-sm text-gray-500">{app.email}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(app.submittedAt).toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 whitespace-pre-line">
                {app.message}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className={`text-xs px-3 py-1 rounded ${
                    app.reviewed
                      ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                      : "bg-green-600 text-white hover:bg-green-700"
                  }`}
                  disabled={app.reviewed}
                  onClick={() => markAsReviewed(app.id)}
                >
                  {app.reviewed ? "Reviewed" : "Mark as Reviewed"}
                </button>

                {app.reviewed && (
                  <button
                    className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => promoteToVendor(app.id)}
                  >
                    Promote to Vendor
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default VendorApplicationsPage;
