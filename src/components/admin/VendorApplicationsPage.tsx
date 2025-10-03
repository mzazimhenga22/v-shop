// src/pages/VendorApplicationsPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/axios";
import {
  Mail,
  Loader2,
  MapPin,
  Globe,
  Phone,
  Calendar,
  Check,
  UserPlus,
  X,
  ImageIcon,
  FileText,
  CreditCard,
} from "lucide-react";

type VendorApplication = {
  id: string;
  user_id?: string | null;
  email?: string | null;
  name?: string | null;
  message?: string | null;
  submittedAt?: string | null; // inserted_at
  reviewed?: boolean;
  status?: string | null;
  phone?: string | null;
  category?: string | null;
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  payment_methods?: string[] | null;
  address?: string | null;
  city?: string | null;
  county?: string | null;
  country?: string | null;
  postal_code?: string | null;
  lat?: number | null;
  lng?: number | null;
  logo_url?: string | null;
  id_doc_url?: string | null;
  inserted_at?: string | null;
  updated_at?: string | null;
};

const VendorApplicationsPage = () => {
  const [applications, setApplications] = useState<VendorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<VendorApplication | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const fetchApplications = async () => {
      try {
        const res = await api.get("http://localhost:4000/api/vendors/vendor-applications");
        // backend returns { applications: [...] }
        const raw = res.data?.applications ?? [];
        if (!mounted) return;
        // normalize keys if necessary (inserted_at -> submittedAt)
        const normalized: VendorApplication[] = (raw || []).map((r: any) => ({
          id: String(r.id),
          user_id: r.user_id ?? r.user_id,
          email: r.email ?? r.email,
          name: r.name ?? r.name,
          message: r.message ?? r.message,
          submittedAt: r.inserted_at ?? r.submittedAt ?? r.submitted_at ?? r.submittedAt,
          reviewed: !!r.reviewed,
          status: r.status ?? r.status,
          phone: r.phone ?? r.phone,
          category: r.category ?? r.category,
          website: r.website ?? r.website,
          instagram: r.instagram ?? r.instagram,
          facebook: r.facebook ?? r.facebook,
          registration_number: r.registration_number ?? r.registrationNumber,
          vat_number: r.vat_number ?? r.vatNumber,
          payment_methods: r.payment_methods ?? r.paymentMethods ?? [],
          address: r.address ?? r.address,
          city: r.city ?? r.city,
          county: r.county ?? r.county,
          country: r.country ?? r.country,
          postal_code: r.postal_code ?? r.postalCode,
          lat: r.lat ?? (r.location?.lat ?? null),
          lng: r.lng ?? (r.location?.lng ?? null),
          logo_url: r.logo_url ?? r.logoUrl ?? null,
          id_doc_url: r.id_doc_url ?? r.idDocUrl ?? null,
          inserted_at: r.inserted_at ?? r.insertedAt,
          updated_at: r.updated_at ?? r.updatedAt,
        }));
        setApplications(normalized);
      } catch (err: any) {
        console.error("Fetch vendor apps error:", err);
        setError(err?.response?.data?.error || err?.message || "Failed to fetch applications");
      } finally {
        setLoading(false);
      }
    };

    fetchApplications();
    return () => {
      mounted = false;
    };
  }, []);

  const openApplication = (app: VendorApplication) => {
    setSelected(app);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelected(null);
  };

  const markAsReviewed = async (id: string) => {
    setActionLoading(true);
    try {
      await api.patch(`http://localhost:4000/api/vendors/vendor-applications/${id}/review`);
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, reviewed: true, status: "reviewed" } : a)));
      if (selected?.id === id) {
        setSelected((s) => (s ? { ...s, reviewed: true, status: "reviewed" } : s));
      }
    } catch (err: any) {
      console.error("Mark review error:", err?.response?.data || err);
      alert("Error marking as reviewed: " + (err?.response?.data?.error || err?.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const promoteToVendor = async (id: string) => {
    if (!confirm("Promote this applicant to vendor? This will create their vendor profile.")) return;
    setActionLoading(true);
    try {
      await api.patch(`http://localhost:4000/api/vendors/vendor-applications/${id}/promote`);
      // After success, we can update UI or navigate
      setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: "promoted", reviewed: true } : a)));
      if (selected?.id === id) {
        setSelected((s) => (s ? { ...s, status: "promoted", reviewed: true } : s));
      }
      alert("User promoted to vendor.");
      navigate("/admin-dashboard");
    } catch (err: any) {
      console.error("Promote error:", err?.response?.data || err);
      alert("Error promoting user: " + (err?.response?.data?.error || err?.message || err));
    } finally {
      setActionLoading(false);
    }
  };

  const osmMapUrl = (app: VendorApplication | null) =>
    app?.lat && app?.lng ? `https://www.openstreetmap.org/?mlat=${app.lat}&mlon=${app.lng}#map=18/${app.lat}/${app.lng}` : null;

  if (loading)
    return (
      <div className="flex justify-center mt-10">
        <Loader2 className="animate-spin h-6 w-6 text-gray-500" />
      </div>
    );

  if (error) return <p className="text-center text-red-500 mt-4">{error}</p>;

  if (applications.length === 0) return <p className="text-center text-gray-500 mt-4">No vendor applications found.</p>;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Vendor Applications</h2>
        <div className="text-sm text-gray-500">Total: {applications.length}</div>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        {applications.map((app) => (
          <div
            key={app.id}
            onClick={() => openApplication(app)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && openApplication(app)}
            className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 border rounded-xl p-4 shadow-sm hover:shadow-md transition cursor-pointer flex gap-4"
          >
            <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
              {app.logo_url ? (
                // logo preview
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.logo_url} alt={`${app.name} logo`} className="object-cover w-full h-full" />
              ) : (
                <div className="text-gray-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="truncate">
                  <p className="font-semibold text-lg truncate">{app.name ?? "—"}</p>
                  <p className="text-sm text-gray-500 truncate">{app.email ?? "—"}</p>
                </div>

                <div className="text-right">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        app.reviewed ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {app.reviewed ? "Reviewed" : app.status ? app.status : "Pending"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    <Calendar className="inline-block w-3 h-3 mr-1 align-text-bottom" />
                    {new Date(app.submittedAt ?? app.inserted_at ?? Date.now()).toLocaleString()}
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-300 mt-3 line-clamp-3 whitespace-pre-wrap">
                {app.message ?? "No message."}
              </p>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!app.reviewed) markAsReviewed(app.id);
                  }}
                  disabled={app.reviewed}
                  className={`text-xs px-3 py-1 rounded ${app.reviewed ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700"}`}
                >
                  {app.reviewed ? "Reviewed" : "Mark as reviewed"}
                </button>

                {app.reviewed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      promoteToVendor(app.id);
                    }}
                    className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Promote to vendor
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal / Drawer */}
      {modalOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={closeModal} />

          <div className="relative bg-white dark:bg-gray-900 w-[min(96vw,900px)] max-h-[90vh] overflow-auto rounded-2xl shadow-2xl p-6 z-60">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                  {selected.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.logo_url} alt={`${selected.name} logo`} className="object-cover w-full h-full" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-gray-400" />
                  )}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{selected.name ?? "—"}</h3>
                  <p className="text-sm text-gray-500">{selected.email ?? "—"}</p>
                  <div className="flex gap-2 mt-2 text-xs text-gray-400 items-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                      <Mail className="w-3 h-3" /> {selected.category ?? "Category"}
                    </span>

                    {selected.phone && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                        <Phone className="w-3 h-3" /> {selected.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <section>
                  <h4 className="text-sm font-semibold mb-2">About the business</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selected.message ?? "—"}</p>
                </section>

                <section>
                  <h4 className="text-sm font-semibold mb-2">Contact & web</h4>
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    {selected.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-400" /> <span>{selected.phone}</span>
                      </div>
                    )}
                    {selected.website && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-gray-400" />{" "}
                        <a href={selected.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {selected.website}
                        </a>
                      </div>
                    )}
                    {selected.instagram && <div className="flex items-center gap-2">@{selected.instagram.replace(/^@/, "")}</div>}
                    {selected.facebook && (
                      <div className="flex items-center gap-2">
                        <a href={selected.facebook} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                          {selected.facebook}
                        </a>
                      </div>
                    )}
                    {selected.registration_number && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">Reg No.</span> <span>{selected.registration_number}</span>
                      </div>
                    )}
                    {selected.vat_number && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">VAT</span> <span>{selected.vat_number}</span>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-semibold mb-2">Payment methods</h4>
                  <div className="flex flex-wrap gap-2">
                    {(selected.payment_methods ?? []).length > 0 ? (
                      (selected.payment_methods ?? []).map((m) => (
                        <span key={m} className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800">
                          <CreditCard className="w-3 h-3" /> {m}
                        </span>
                      ))
                    ) : (
                      <div className="text-sm text-gray-400">No payment methods provided.</div>
                    )}
                  </div>
                </section>
              </div>

              <div className="space-y-4">
                <section>
                  <h4 className="text-sm font-semibold mb-2">Address & location</h4>
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      <div>
                        <div>{selected.address ?? "—"}</div>
                        <div className="text-xs text-gray-400">
                          {([selected.city, selected.county, selected.postal_code, selected.country].filter(Boolean) || [""]).join(", ")}
                        </div>
                      </div>
                    </div>

                    {selected.lat && selected.lng && (
                      <div className="text-xs mt-2">
                        <a href={osmMapUrl(selected) ?? "#"} target="_blank" rel="noreferrer" className="underline text-blue-600">
                          View on OpenStreetMap
                        </a>{" "}
                        • Lat: {selected.lat}, Lng: {selected.lng}
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-semibold mb-2">Documents</h4>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-md bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                        {selected.id_doc_url ? <FileText className="w-5 h-5 text-gray-500" /> : <FileText className="w-5 h-5 text-gray-300" />}
                      </div>
                      <div className="flex-1 text-sm">
                        {selected.id_doc_url ? (
                          <>
                            <div className="truncate">{selected.id_doc_url}</div>
                            <div className="mt-2 flex gap-2">
                              <a
                                href={selected.id_doc_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                              >
                                Open document
                              </a>
                              <a
                                href={selected.id_doc_url}
                                download
                                className="text-xs px-3 py-1 rounded bg-gray-100 hover:bg-gray-200"
                              >
                                Download
                              </a>
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-gray-400">No ID document uploaded.</div>
                        )}
                      </div>
                    </div>

                    {selected.logo_url && (
                      <div>
                        <h5 className="text-xs font-medium mb-2">Logo</h5>
                        <div className="w-full rounded-md overflow-hidden border">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={selected.logo_url} alt="logo" className="w-full object-contain max-h-40" />
                        </div>
                      </div>
                    )}
                  </div>
                </section>

                <section>
                  <h4 className="text-sm font-semibold mb-2">Meta</h4>
                  <div className="text-sm text-gray-500">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />{" "}
                        <div>{new Date(selected.inserted_at ?? selected.submittedAt ?? Date.now()).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4" /> <div>{selected.reviewed ? "Reviewed" : "Not reviewed"}</div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              {!selected.reviewed && (
                <button
                  onClick={() => selected && markAsReviewed(selected.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700"
                >
                  {actionLoading ? "Processing..." : "Mark as reviewed"}
                </button>
              )}

              {selected.reviewed && (
                <button
                  onClick={() => selected && promoteToVendor(selected.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                >
                  {actionLoading ? "Processing..." : "Promote to vendor"}
                </button>
              )}

              <button onClick={closeModal} className="px-4 py-2 rounded-md border dark:border-gray-700">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorApplicationsPage;
