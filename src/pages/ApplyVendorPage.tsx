// src/pages/ApplyVendorPage.tsx
import { useState } from "react";
import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

type FormState = {
  businessName: string;
  category: string;
  email: string;
  phone: string;
  description: string;
  website: string;
  instagram: string;
  facebook: string;
  registrationNumber: string;
  vatNumber: string;
  paymentMethods: string[]; // e.g. ["mpesa","bank","paypal"]
  address: string;
  city: string;
  county: string;
  country: string;
  postalCode: string;
  lat?: number | null;
  lng?: number | null;
};

const initialState: FormState = {
  businessName: "",
  category: "",
  email: "",
  phone: "",
  description: "",
  website: "",
  instagram: "",
  facebook: "",
  registrationNumber: "",
  vatNumber: "",
  paymentMethods: [],
  address: "",
  city: "",
  county: "",
  country: "",
  postalCode: "",
  lat: null,
  lng: null,
};

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NominatimEmail = (import.meta.env.VITE_NOMINATIM_EMAIL as string) || "";

const ApplyVendorPage = () => {
  const [formData, setFormData] = useState<FormState>(initialState);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as any;
    // payment method toggles use data-pm attribute
    if (type === "checkbox" && (e.target as HTMLInputElement).dataset?.pm) {
      const pm = (e.target as HTMLInputElement).value;
      setFormData((prev) => {
        const next = { ...prev };
        if ((e.target as HTMLInputElement).checked) {
          next.paymentMethods = Array.from(new Set([...next.paymentMethods, pm]));
        } else {
          next.paymentMethods = next.paymentMethods.filter((p) => p !== pm);
        }
        return next;
      });
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, files } = e.target;
    if (!files || files.length === 0) return;
    const f = files[0];
    if (name === "logo") setLogoFile(f);
    if (name === "idDoc") setIdFile(f);
  };

  // Use browser geolocation + Nominatim reverse geocode (OpenStreetMap)
  const useCurrentLocation = async () => {
    setErrorMsg("");
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not available in this browser.");
      return;
    }
    setLoading(true);
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            setFormData((prev) => ({ ...prev, lat, lng }));

            // reverse geocode via Nominatim
            try {
              await reverseGeocode(lat, lng);
            } catch (err) {
              console.warn("reverse geocode failed", err);
            }
            resolve();
          },
          (err) => {
            console.warn("geolocation error", err);
            setErrorMsg("Could not get current location (permission denied or unavailable).");
            reject(err);
          },
          { timeout: 10000 }
        );
      });
    } finally {
      setLoading(false);
    }
  };

  // Reverse geocode coords -> fills address fields
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const q = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${encodeURIComponent(
        String(lat)
      )}&lon=${encodeURIComponent(String(lon))}&addressdetails=1${
        NominatimEmail ? `&email=${encodeURIComponent(NominatimEmail)}` : ""
      }`;

      const { data } = await axios.get(q, {
        // browsers disallow setting User-Agent header; Nominatim suggests an email param instead
        timeout: 12_000,
      });

      if (data && data.address) {
        const addr = data.address;
        // map Nominatim address parts to our fields (best-effort)
        setFormData((prev) => ({
          ...prev,
          address:
            prev.address ||
            [addr.road, addr.house_number, addr.neighbourhood, addr.suburb]
              .filter(Boolean)
              .join(", "),
          city: prev.city || addr.city || addr.town || addr.village || addr.hamlet || "",
          county: prev.county || addr.county || addr.state || "",
          country: prev.country || "",
          postalCode: prev.postalCode || addr.postcode || "",
          lat,
          lng: lon,
        }));
      } else {
        console.warn("nominatim reverse returned no address", data);
      }
    } catch (err) {
      console.warn("reverseGeocode error", err);
      throw err;
    }
  };

  // Lookup address string -> geocode (fill coords + structured address)
  const geocodeAddress = async () => {
    setErrorMsg("");
    const qText = [formData.address, formData.city, formData.country].filter(Boolean).join(", ");
    if (!qText) {
      setErrorMsg("Please enter an address or city before lookup.");
      return;
    }
    setLoading(true);
    try {
      const q = `${NOMINATIM_BASE}/search?format=jsonv2&q=${encodeURIComponent(
        qText
      )}&addressdetails=1&limit=1${NominatimEmail ? `&email=${encodeURIComponent(NominatimEmail)}` : ""}`;
      const { data } = await axios.get(q, { timeout: 12_000 });

      if (Array.isArray(data) && data.length > 0) {
        const hit = data[0];
        const lat = Number(hit.lat);
        const lon = Number(hit.lon);
        // fill structured address using address details if present
        const addr = hit.address || {};
        setFormData((prev) => ({
          ...prev,
          address: prev.address || [
            addr.road,
            addr.house_number,
            addr.neighbourhood,
            addr.suburb,
          ]
            .filter(Boolean)
            .join(", "),
          city: prev.city || addr.city || addr.town || addr.village || "",
          county: prev.county || addr.county || addr.state || "",
          country: prev.country || addr.country || "",
          postalCode: prev.postalCode || addr.postcode || "",
          lat,
          lng: lon,
        }));
      } else {
        setErrorMsg("Address not found.");
      }
    } catch (err) {
      console.warn("geocodeAddress error", err);
      setErrorMsg("Address lookup failed.");
    } finally {
      setLoading(false);
    }
  };

  const uploadToStorage = async (file: File, bucket: string, userId: string) => {
    if (!file) return null;
    try {
      setUploading(true);
      const key = `${userId}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;
      const { error } = await supabase.storage.from(bucket).upload(key, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        console.warn("storage upload error", error);
        return null;
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(key);
      return data.publicUrl || null;
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");
    setDialogMessage(null);

    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        setErrorMsg("User not authenticated.");
        setLoading(false);
        return;
      }
      const userId = userData.user.id;

      // check if already vendor
      const { data: existing } = await supabase
        .from("vendor")
        .select("id")
        .eq("user_id", userId)
        .limit(1);

      if (existing && existing.length > 0) {
        setDialogMessage("You have already submitted a vendor application. We will contact you once it's reviewed.");
        setDialogOpen(true);
        setLoading(false);
        return;
      }

      // Upload optional files to Supabase storage (if provided)
      let logoUrl: string | null = null;
      let idDocUrl: string | null = null;

      if (logoFile) {
        const uploaded = await uploadToStorage(logoFile, "vendor-logos", userId);
        if (uploaded) logoUrl = uploaded;
        else console.warn("logo upload failed, continuing without logo");
      }

      if (idFile) {
        const uploadedId = await uploadToStorage(idFile, "vendor-ids", userId);
        if (uploadedId) idDocUrl = uploadedId;
        else console.warn("id upload failed, continuing without id doc");
      }

      // Build payload
      const payload = {
        user_id: userId,
        name: formData.businessName,
        email: formData.email,
        phone: formData.phone,
        category: formData.category,
        message: formData.description,
        website: formData.website || null,
        instagram: formData.instagram || null,
        facebook: formData.facebook || null,
        registration_number: formData.registrationNumber || null,
        vat_number: formData.vatNumber || null,
        payment_methods: formData.paymentMethods,
        address: formData.address || null,
        city: formData.city || null,
        county: formData.county || null,
        country: formData.country || null,
        postal_code: formData.postalCode || null,
        lat: formData.lat ?? null,
        lng: formData.lng ?? null,
        logo_url: logoUrl,
        id_doc_url: idDocUrl,
      };

      // Submit to backend endpoint
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE ?? "http://localhost:4000"}/api/vendors/vendor-applications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setDialogMessage("You already have an application in review.");
          setDialogOpen(true);
        } else {
          setErrorMsg(result.error || "Failed to submit vendor application.");
        }
      } else {
        setDialogMessage("Application received — we'll review it and contact you soon.");
        setDialogOpen(true);
      }
    } catch (err: any) {
      console.error("submit error", err);
      setErrorMsg("An unexpected error occurred while submitting your application.");
    } finally {
      setLoading(false);
    }
  };

  const osmMapUrl = formData.lat && formData.lng
    ? `https://www.openstreetmap.org/?mlat=${formData.lat}&mlon=${formData.lng}#map=18/${formData.lat}/${formData.lng}`
    : null;

  return (
    <div className="min-h-screen px-6 py-12 bg-transparent text-gray-900 dark:text-white transition-colors">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-4 text-center">Join as a Vendor</h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          Enter your details to become a vendor on our platform. Provide accurate info so customers can find and trust you.
        </p>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 bg-transparent p-6 rounded-xl border border-gray-300 dark:border-gray-700 backdrop-blur-sm"
        >
          {/* ... (same fields as before) ... */}
          <div>
            <label className="block text-sm font-medium mb-1">Business Name</label>
            <input
              name="businessName"
              required
              value={formData.businessName}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
              placeholder="Vshop Solutions"
            />
          </div>

          {/* category + website */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <input
                name="category"
                required
                value={formData.category}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="e.g. Fashion, Electronics"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Website (optional)</label>
              <input
                name="website"
                type="url"
                value={formData.website}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="https://yourshop.example"
              />
            </div>
          </div>

          {/* contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="vendor@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Phone</label>
              <input
                type="tel"
                name="phone"
                required
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="+254712345678"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Brief Description</label>
            <textarea
              name="description"
              rows={4}
              required
              value={formData.description}
              onChange={handleChange}
              className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
              placeholder="Tell us more about your business..."
            />
          </div>

          {/* registration & VAT */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Registration Number (optional)</label>
              <input
                name="registrationNumber"
                value={formData.registrationNumber}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="Company/Business Reg No."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">VAT/Tax Number (optional)</label>
              <input
                name="vatNumber"
                value={formData.vatNumber}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="VAT / Tax ID"
              />
            </div>
          </div>

          {/* social */}
          <div>
            <label className="block text-sm font-medium mb-1">Social handles (optional)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                name="instagram"
                value={formData.instagram}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="@yourhandle"
              />
              <input
                name="facebook"
                value={formData.facebook}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="facebook.com/yourpage"
              />
            </div>
          </div>

          {/* payment methods */}
          <div>
            <label className="block text-sm font-medium mb-1">Payment methods you accept</label>
            <div className="flex flex-wrap gap-3 mt-2">
              {["mpesa", "bank", "paypal", "card", "cash"].map((m) => (
                <label key={m} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    value={m}
                    data-pm="1"
                    checked={formData.paymentMethods.includes(m)}
                    onChange={handleChange}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">{m}</span>
                </label>
              ))}
            </div>
          </div>

          {/* address & location */}
          <div>
            <label className="block text-sm font-medium mb-1">Business address & location</label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="Street address"
              />
              <input
                name="city"
                value={formData.city}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="City"
              />
              <input
                name="county"
                value={formData.county}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="County / State"
              />
              <input
                name="country"
                value={formData.country}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="Country"
              />
              <input
                name="postalCode"
                value={formData.postalCode}
                onChange={handleChange}
                className="w-full px-4 py-2 rounded-md border dark:bg-gray-900 dark:border-gray-700"
                placeholder="Postal code"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={useCurrentLocation}
                  disabled={loading}
                  className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800"
                >
                  Use my current location
                </button>

                <button
                  type="button"
                  onClick={geocodeAddress}
                  disabled={loading}
                  className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800"
                >
                  Lookup address
                </button>

                <div className="text-sm text-gray-500">
                  {formData.lat && formData.lng ? (
                    <>
                      Lat: {formData.lat.toFixed(4)}, Lng: {formData.lng.toFixed(4)}
                    </>
                  ) : (
                    <span>No coords</span>
                  )}
                </div>
              </div>
            </div>

            {osmMapUrl && (
              <div className="mt-2">
                <a
                  href={osmMapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View location on OpenStreetMap
                </a>
              </div>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Location lookup uses OpenStreetMap / Nominatim (not Google). If you plan heavy automated lookups, set <code>VITE_NOMINATIM_EMAIL</code> to your contact email in .env to identify your requests.
            </p>
          </div>

          {/* uploads */}
          <div>
            <label className="block text-sm font-medium mb-1">Upload business logo (optional)</label>
            <input name="logo" type="file" accept="image/*" onChange={handleFileChange} />
            <p className="text-xs text-gray-500 mt-1">Recommended size: 400x400px. Will be stored securely.</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Upload ID document (optional)</label>
            <input name="idDoc" type="file" accept="image/*,application/pdf" onChange={handleFileChange} />
            <p className="text-xs text-gray-500 mt-1">Optional — helps speed up verification.</p>
          </div>

          {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}

          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-md transition"
          >
            {loading ? "Submitting..." : uploading ? "Uploading files..." : "Submit Application"}
          </button>
        </form>
      </div>

      {/* Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl w-full max-w-md text-center">
            <h2 className="text-2xl font-semibold mb-3">Application In Review</h2>
            <p className="text-gray-600 dark:text-gray-300 mb-5">
              {dialogMessage ??
                "Thank you for applying! Your application has been received and is now under review. We will contact you once it’s approved."}
            </p>
            <button
              onClick={() => setDialogOpen(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition"
            >
              Okay
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplyVendorPage;
