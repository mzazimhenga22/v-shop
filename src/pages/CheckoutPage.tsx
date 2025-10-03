// client/src/pages/CheckoutPage.tsx
import React, { useEffect, useRef, useState } from "react";
import { useCart } from "@/context/CartContext";
import type { CartItem as CartItemType } from "@/context/CartContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import OnlineReceipt from "@/components/OnlineReceipt";
import confetti from "canvas-confetti";
import clsx from "clsx";

// Stripe imports
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

/* ----------------------------- Types & constants ----------------------------- */
const ALL_METHODS = ["card", "paypal", "mpesa", "cod"] as const;
type Method = (typeof ALL_METHODS)[number];

const CANONICAL_FRONT_MAP: Record<string, Method | undefined> = {
  card: "card",
  "credit card": "card",
  credit_card: "card",
  creditcard: "card",
  paypal: "paypal",
  mpesa: "mpesa",
  "m-pesa": "mpesa",
  "m pesa": "mpesa",
  "m_pesa": "mpesa",
  cod: "cod",
  "cash on delivery": "cod",
  "cash_on_delivery": "cod",
  cashondelivery: "cod",
};

function canonicalizeOneFront(raw: any): Method | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).toLowerCase().trim().replace(/[_\s\-]+/g, " ");
  return CANONICAL_FRONT_MAP[s] ?? (ALL_METHODS.includes(s as Method) ? (s as Method) : undefined);
}
function canonicalizeArrayFront(raw: any): string[] {
  if (raw === null || raw === undefined) return [];
  if (Array.isArray(raw)) return Array.from(new Set(raw.map((r) => canonicalizeOneFront(r)).filter(Boolean))) as string[];
  if (typeof raw === "object") return Array.from(new Set(Object.values(raw).map((r) => canonicalizeOneFront(r)).filter(Boolean))) as string[];

  const trimmed = String(raw).trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return Array.from(new Set(parsed.map((p) => canonicalizeOneFront(p)).filter(Boolean))) as string[];
  } catch {}
  return Array.from(new Set(trimmed.split(",").map((s) => canonicalizeOneFront(s)).filter(Boolean))) as string[];
}

/* ----------------------------- Helpers ----------------------------- */
const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

/* ----------------------------- idempotency helper ----------------------------- */
function makeIdempotencyKey() {
  const S4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
  return `${S4()}${S4()}-${S4()}-${S4()}-${S4()}-${S4()}${S4()}${S4()}` + `-${Date.now()}`;
}

/* ----------------------------- API base & Stripe setup ----------------------------- */
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const STRIPE_PUBLISHABLE = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
const stripePromise = STRIPE_PUBLISHABLE ? loadStripe(STRIPE_PUBLISHABLE) : null;

/* ----------------------------- Utility: ensure canonical id ----------------------------- */
const withCanonicalId = (normalized: any) => {
  if (!normalized || typeof normalized !== "object") return normalized;
  const canonicalId =
    normalized.id ??
    normalized.order?.id ??
    normalized.order_id ??
    normalized._id ??
    (normalized.data && (normalized.data.id ?? normalized.data.order_id)) ??
    String(Date.now());
  return { ...normalized, id: canonicalId };
};

/* ----------------------------- Nominatim config ----------------------------- */
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const NominatimEmail = (import.meta.env.VITE_NOMINATIM_EMAIL as string) || "";

/* ----------------------------- Component ----------------------------- */
const CheckoutPage: React.FC = () => {
  const { cart } = useCart();
  const navigate = useNavigate();

  // user
  const [userData, setUserData] = useState({ id: "", email: "", name: "", created_at: "" });

  // address (Photon)
  const [addressQuery, setAddressQuery] = useState("");
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [shippingAddress, setShippingAddress] = useState<any>(null);
  const suggestionsRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);

  // auto-location states
  const [locationAttempted, setLocationAttempted] = useState(false);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // payments & policy
  const [paymentMethod, setPaymentMethod] = useState<Method>("card");
  const [allowedMethods, setAllowedMethods] = useState<Method[]>([...ALL_METHODS]);
  const [productPaymentMap, setProductPaymentMap] = useState<Record<string, string[]>>({});
  const [loadingPolicies, setLoadingPolicies] = useState(false);

  // payment fields (non-card)
  const [mpesaPhone, setMpesaPhone] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [saveCard, setSaveCard] = useState(false);

  // UI state
  const [showSuccess, setShowSuccess] = useState(false);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string | null>(null);
  const [mpesaCheckoutId, setMpesaCheckoutId] = useState<string | null>(null);

  // Stripe clientSecret for PaymentElement
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // store provisional order and access token (returned by create-payment-intent)
  const [provisionalOrder, setProvisionalOrder] = useState<any | null>(null);
  const [stripeAccessToken, setStripeAccessToken] = useState<string | null>(null);

  // idempotency key for the whole checkout
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  // misc
  const [orderNote, setOrderNote] = useState("");
  const [deliveryOption, setDeliveryOption] = useState<"standard" | "express">("standard");

  // errors shown in UI (replace alerts)
  const [error, setError] = useState<{ message: string; details?: string | null } | null>(null);

  const canUseStripe = Boolean(STRIPE_PUBLISHABLE && stripePromise);

  /* ----------------------------- helpers for UI errors ----------------------------- */
  const showError = (message: string, details?: string | null) => {
    setError({ message, details: details ?? null });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setLoading(false);
  };

  const clearError = () => setError(null);

  /* ----------------------------- fetch user ----------------------------- */
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = (data as any)?.user;
        if (user) {
          setUserData({
            id: user.id,
            email: user.email || "",
            name: (user.user_metadata as any)?.name || "",
            created_at: user.created_at,
          });
          const phone = (user.user_metadata as any)?.phone;
          if (phone) setMpesaPhone(phone);
        }
      } catch (err) {
        console.warn("Failed to fetch logged in user", err);
      }
    };
    fetchUser();
  }, []);

  /* ----------------------------- Photon (address autocomplete) ----------------------------- */
  useEffect(() => {
    if (!addressQuery || addressQuery.length < 2) {
      setSuggestions([]);
      setHighlightIndex(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const q = encodeURIComponent(addressQuery);
        const url = `https://photon.komoot.io/api/?q=${q}&limit=8&lang=en`;
        const res = await fetch(url);
        if (!res.ok) {
          setSuggestions([]);
          setHighlightIndex(null);
          return;
        }
        const body = await res.json();
        setSuggestions(Array.isArray(body.features) ? body.features : []);
        setHighlightIndex(null);
      } catch (err) {
        console.error("Photon lookup failed", err);
        setSuggestions([]);
        setHighlightIndex(null);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [addressQuery]);

  const buildLabelFromFeature = (f: any) => {
    const p = f?.properties || {};
    const parts: string[] = [];
    if (p.name) parts.push(p.name);
    const street = p.street ? (p.housenumber ? `${p.street} ${p.housenumber}` : p.street) : null;
    if (street) parts.push(street);
    if (p.city) parts.push(p.city);
    else if (p.county) parts.push(p.county);
    else if (p.state) parts.push(p.state);
    if (p.country) parts.push(p.country);
    return parts.join(", ");
  };

  const handleSelectSuggestion = (f: any) => {
    const label = buildLabelFromFeature(f) || f.properties?.name || "";
    setShippingAddress({ label, coordinates: f.geometry?.coordinates || null, raw: f });
    setAddressQuery(label);
    setSuggestions([]);
    setHighlightIndex(null);
    inputRef.current?.blur();
    clearError();
  };

  const onAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => (i === null ? 0 : Math.min(suggestions.length - 1, i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => (i === null ? suggestions.length - 1 : Math.max(0, i - 1)));
    } else if (e.key === "Enter") {
      if (highlightIndex !== null && suggestions[highlightIndex]) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setHighlightIndex(null);
    }
  };

  /* ----------------------------- Nominatim reverse-geocode (fetch, no axios) ----------------------------- */
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const emailParam = NominatimEmail ? `&email=${encodeURIComponent(NominatimEmail)}` : "";
      const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(
        String(lon)
      )}&addressdetails=1${emailParam}`;
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      if (!res.ok) throw new Error(`Reverse geocode failed (${res.status})`);
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const labelParts = [
          addr.road ? (addr.house_number ? `${addr.road} ${addr.house_number}` : addr.road) : null,
          addr.neighbourhood || addr.suburb || null,
          addr.city || addr.town || addr.village || null,
          addr.state || null,
          addr.country || null,
        ].filter(Boolean);
        const label = labelParts.join(", ");
        setShippingAddress({ label, coordinates: [Number(lon), Number(lat)], raw: data });
        setAddressQuery(label);
        clearError();
      } else {
        throw new Error("No address data from reverse geocode");
      }
    } catch (err: any) {
      console.warn("reverseGeocode error", err);
      showError("Location lookup failed", err?.message ?? String(err));
    }
  };

  /* ----------------------------- Detect location (onFocus auto+manual) ----------------------------- */
  const detectLocation = async () => {
    if (!navigator.geolocation) {
      showError("Geolocation is not available", null);
      setLocationAttempted(true);
      return;
    }
    // prevent repeated prompts
    setLocationAttempted(true);
    setDetectingLocation(true);
    try {
      await new Promise<void>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const lat = pos.coords.latitude;
              const lon = pos.coords.longitude;
              await reverseGeocode(lat, lon);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
          (err) => {
            console.warn("geolocation error", err);
            // don't spam the user; surface friendly message
            if (err && err.code === 1) {
              showError("Location permission denied", "Allow location access to auto-fill your address.");
            } else {
              showError("Could not retrieve location", "Try the address search or click 'Detect location'.");
            }
            reject(err);
          },
          { timeout: 12_000 }
        );
      });
    } catch {
      // already handled with showError
    } finally {
      setDetectingLocation(false);
    }
  };

  /* Try to auto-detect location when address input is focused for the first time */
  const onAddressFocus = () => {
    // auto-run only once, and only if user hasn't typed anything yet
    if (!locationAttempted && !addressQuery && !shippingAddress) {
      // small delay so focus isn't interrupted by permission prompt in some browsers
      setTimeout(() => {
        detectLocation();
      }, 250);
    }
  };

  /* ----------------------------- totals ----------------------------- */
  const total = cart.reduce<number>((sum, item: CartItemType) => sum + Number(item.price) * Number(item.quantity), 0);

  /* ----------------------------- payment policy lookup ----------------------------- */
  useEffect(() => {
    const fetchPaymentPolicies = async () => {
      if (cart.length === 0) {
        setAllowedMethods([...ALL_METHODS].filter((m) => (m !== "card" ? true : canUseStripe)));
        return;
      }
      setLoadingPolicies(true);
      try {
        const idsSet = new Set<string>();
        for (const it of cart) {
          const candidate = it.product_id ?? it.id;
          if (candidate !== undefined && candidate !== null) idsSet.add(String(candidate));
        }
        const ids = Array.from(idsSet);
        const fetchedMap: Record<string, string[]> = {};

        if (ids.length > 0) {
          try {
            const { data: prodData, error: prodErr } = await supabase.from("products").select("id, payment_methods").in("id", ids);
            if (!prodErr && Array.isArray(prodData)) {
              for (const row of prodData as any[]) {
                const key = String(row.id);
                fetchedMap[key] = canonicalizeArrayFront(row.payment_methods);
              }
            } else {
              if (prodErr) console.warn("products lookup error:", prodErr);
            }
          } catch (err) {
            console.warn("Error querying products table:", err);
          }

          try {
            const { data: vProdData, error: vProdErr } = await supabase.from("vendor_product").select("id, payment_methods").in("id", ids);
            if (!vProdErr && Array.isArray(vProdData)) {
              for (const row of vProdData as any[]) {
                const key = String(row.id);
                fetchedMap[key] = canonicalizeArrayFront(row.payment_methods);
              }
            } else {
              if (vProdErr) console.warn("vendor_product lookup error:", vProdErr);
            }
          } catch (err) {
            console.warn("Error querying vendor_product table:", err);
          }
        }

        for (const it of cart) {
          const key = String(it.product_id ?? it.id);
          if (!it.vendor && Array.isArray(it.payment_methods) && it.payment_methods.length) {
            fetchedMap[key] = canonicalizeArrayFront(it.payment_methods);
          } else if (!fetchedMap[key]) {
            fetchedMap[key] = canonicalizeArrayFront(ALL_METHODS);
          }
        }

        setProductPaymentMap(fetchedMap);

        const intersectTwo = (a: string[], b: string[]) => a.filter((x) => b.includes(x));
        let intersect: string[] = canonicalizeArrayFront(ALL_METHODS);
        for (const it of cart) {
          const key = String(it.product_id ?? it.id);
          const methodsForItem: string[] = fetchedMap[key] ?? canonicalizeArrayFront(ALL_METHODS);
          const normalizedForItem = methodsForItem.map((m) => String(m).toLowerCase()).filter((m) => (ALL_METHODS as readonly string[]).includes(m));
          intersect = intersectTwo(intersect, normalizedForItem);
          if (intersect.length === 0) break;
        }

        let validIntersect = intersect.filter((m) => (ALL_METHODS as readonly string[]).includes(m)) as Method[];

        // Remove 'card' if Stripe publishable key missing
        if (!canUseStripe) validIntersect = validIntersect.filter((m) => m !== "card");

        setAllowedMethods(validIntersect.length ? validIntersect : ([] as Method[]));
        setPaymentMethod((prev) => (validIntersect.includes(prev as Method) ? prev : validIntersect[0] || (canUseStripe ? "card" : "cod")));
      } catch (err) {
        console.error("Error fetching payment policies", err);
        setAllowedMethods([] as Method[]);
        setProductPaymentMap({});
      } finally {
        setLoadingPolicies(false);
      }
    };
    fetchPaymentPolicies();
  }, [cart, canUseStripe]);

  /* ----------------------------- vendor validation ----------------------------- */
  const ensureValidVendorIds = async (cartItems: CartItemType[]) => {
    try {
      const vendorIds = Array.from(new Set(cartItems.map((ci) => (ci.vendor ? ci.vendor_id : null)).filter(Boolean).map(String)));
      if (vendorIds.length === 0) return {};
      const url = `${API_BASE}/api/vendor/validate-vendors`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds }),
      });
      if (!res.ok) {
        console.warn("Vendor validation endpoint returned non-OK:", res.status);
        return {};
      }
      const body = await res.json();
      const existing: string[] = Array.isArray(body.existing) ? body.existing.map(String) : [];
      const map: Record<string, boolean> = {};
      for (const id of vendorIds) map[id] = existing.includes(id);
      return map;
    } catch (err) {
      console.warn("Failed to validate vendor_ids:", err);
      return {};
    }
  };

  /* ----------------------------- Payment helper: MPESA (Daraja STK Push) ----------------------------- */
  const initiateMpesa = async (order: any) => {
    try {
      setLoading(true);
      setPaymentStatus("initiating-mpesa");
      clearError();
      const body = { phone: mpesaPhone, amount: order.total_amount, accountRef: `ORD-${Date.now()}`, description: `Order ${Date.now()}`, userId: userData.id };
      const res = await fetch(`${API_BASE}/api/payments/mpesa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch (err) {
        const txt = await res.text();
        console.error("MPesa initiation returned non-JSON:", txt);
        showError("M-Pesa initiation returned unexpected response", txt);
        return { success: false, error: "Mpesa initiation returned unexpected response" };
      }

      if (!res.ok || !json?.ok || !json?.checkoutId) {
        const errMsg = json?.error || json?.message || "M-Pesa initiation failed (no checkoutId)";
        showError("M-Pesa initiation failed", errMsg);
        return { success: false, error: errMsg };
      }

      const checkoutId = String(json.checkoutId);
      setMpesaCheckoutId(checkoutId);
      setPaymentStatus("mpesa-pending");
      return { success: true, checkoutId };
    } catch (err: any) {
      console.error("Mpesa init error:", err);
      showError("Failed to initiate M-Pesa", String(err?.message || err));
      setPaymentStatus("mpesa-failed");
      return { success: false, error: err?.message || String(err) };
    } finally {
      setLoading(false);
    }
  };

  const pollMpesaStatus = async (checkoutId: string | null | undefined, onUpdate?: (s: string) => void) => {
    if (!checkoutId) {
      console.warn("pollMpesaStatus called without checkoutId; aborting poll");
      return { success: false, error: "checkoutId required" };
    }
    const qId = encodeURIComponent(String(checkoutId));
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${API_BASE}/api/payments/mpesa/status?checkoutId=${qId}`);
        if (!res.ok) {
          if (res.status === 404) {
            onUpdate?.("not_found");
            await new Promise((r) => setTimeout(r, 2000));
            continue;
          }
          onUpdate?.("pending");
        } else {
          const json = await res.json();
          if (json?.ok) {
            onUpdate?.(json.status);
            if (json.status === "success") return { success: true, receipt: json.receipt || null };
            if (json.status === "failed") return { success: false, error: json.error || "Payment failed" };
          } else {
            onUpdate?.("pending");
          }
        }
      } catch (err) {
        console.warn("Mpesa poll error:", err);
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    return { success: false, error: "Timed out waiting for M-Pesa confirmation" };
  };

  /* ----------------------------- Normalizer for receipts ----------------------------- */
  const normalizeOrderForReceipt = (o: any) => {
    if (!o) return null;
    const id = o.id ?? o.order_id ?? o._id ?? (o?.data?.id) ?? String(Date.now());
    const date = o.created_at ?? o.createdAt ?? o.created ?? o.date ?? new Date().toISOString();

    const customer = {
      name: o.name ?? o.customer?.name ?? userData.name ?? "Customer",
      email: o.email ?? o.customer?.email ?? userData.email ?? "N/A",
      address:
        o.shipping_address ??
        o.customer?.address ??
        shippingAddress?.label ??
        (o.shipping?.address ?? ""),
    };

    let itemsRaw: any[] = [];
    try {
      if (Array.isArray(o.items)) itemsRaw = o.items;
      else if (typeof o.items === "string") {
        itemsRaw = JSON.parse(o.items || "[]");
      } else if (Array.isArray(o.order_items)) itemsRaw = o.order_items;
      else if (typeof o.order_items === "string") itemsRaw = JSON.parse(o.order_items || "[]");
      else if (Array.isArray(o.data?.items)) itemsRaw = o.data.items;
      else itemsRaw = o.items ?? o.order_items ?? [];
    } catch {
      itemsRaw = [];
    }

    const items = (itemsRaw || []).map((it: any, idx: number) => ({
      id: it.id ?? it.product_id ?? it._id ?? String(idx),
      name: it.name ?? it.title ?? it.product_name ?? "Item",
      quantity: Number(it.quantity ?? it.qty ?? 1),
      price: Number(it.price ?? it.unit_price ?? it.amount ?? 0),
      image: it.image ?? it.product_image ?? it.image_url ?? null,
      vendor_name: it.vendor_name ?? it.vendorName ?? null,
    }));

    const subtotal = items.reduce((s: number, it: any) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);
    const totalFromOrder = Number(o.total_amount ?? o.total ?? o.amount ?? o.payment?.total ?? 0);
    const total = totalFromOrder || subtotal;

    const payment = {
      method: o.payment_method ?? o.payment?.method ?? (o.payment_details?.method ?? "Card"),
      status: o.payment_status ?? o.status ?? o.payment?.status ?? "pending",
      total,
    };

    return {
      id,
      date,
      customer,
      payment,
      items,
      subtotal,
    };
  };

  /* ----------------------------- submit handler (UPDATED with idempotency) ----------------------------- */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    clearError();

    if (!shippingAddress || !shippingAddress.label) {
      showError("Please select a shipping address.", null);
      return;
    }
    if (!allowedMethods.includes(paymentMethod)) {
      showError("Selected payment method is not available for your cart items.", null);
      return;
    }
    if (paymentMethod === "mpesa" && mpesaPhone.trim().length < 7) {
      showError("Please enter a valid M-Pesa phone number.", null);
      return;
    }
    if (paymentMethod === "paypal" && !paypalEmail.includes("@")) {
      showError("Please enter a valid PayPal email.", null);
      return;
    }

    setLoading(true);

    let sessionResp;
    try {
      sessionResp = await supabase.auth.getSession();
    } catch (err) {
      setLoading(false);
      console.error("Failed to get session:", err);
      showError("Authentication error", "Unable to verify your session. Please log in again.");
      return;
    }

    const session = (sessionResp.data as any)?.session;
    if (!session) {
      setLoading(false);
      showError("Please log in to place an order", null);
      return;
    }
    const accessToken = (session as any).access_token;

    const ik = idempotencyKey ?? makeIdempotencyKey();
    setIdempotencyKey(ik);

    const vendorValidity = await ensureValidVendorIds(cart);
    const items = cart.map((c: CartItemType) => {
      const productKey = String(c.product_id ?? c.id);
      const vendorOk = !!(c.vendor && c.vendor_id && vendorValidity && vendorValidity[String(c.vendor_id)]);
      return {
        product_id: c.product_id ?? c.id,
        id: c.id,
        name: c.name,
        quantity: c.quantity,
        price: Number(c.price),
        image: c.image ?? null,
        vendor: vendorOk ? true : false,
        vendor_id: vendorOk ? c.vendor_id : null,
        vendor_name: (c as any).vendor_name ?? null,
        payment_methods: c.vendor ? (productPaymentMap[productKey] ?? []) : (productPaymentMap[productKey] ?? (c.payment_methods ?? [...ALL_METHODS])),
      };
    });

    const order = {
      user_id: userData.id,
      name: userData.name || "Customer",
      email: userData.email,
      shipping_address: shippingAddress?.label || "",
      shipping_coordinates: shippingAddress?.coordinates || null,
      total_amount: total + (deliveryOption === "express" ? 8 : 0),
      items,
      payment_method: paymentMethod,
      payment_details: {},
      meta: { ...(orderNote ? { note: orderNote } : {}), client_ts: new Date().toISOString(), deliveryOption, idempotency_key: ik },
    };

    try {
      if (paymentMethod === "card") {
        if (!canUseStripe) {
          setLoading(false);
          setPaymentStatus("card-config-missing");
          showError("Stripe publishable key is not configured for the client.", "Set VITE_STRIPE_PUBLISHABLE_KEY in the client .env and restart the dev server.");
          return;
        }

        setPaymentStatus("starting-card");
        setLoading(true);
        clearError();

        const createResp = await fetch(`${API_BASE}/stripe/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": ik },
          body: JSON.stringify({
            amount: order.total_amount,
            currency: "usd",
            metadata: { userId: userData.id, note: order.meta?.note || "", idempotency_key: ik },
            order,
          }),
        });

        let createJson: any = null;
        try {
          createJson = await createResp.json();
        } catch (err) {
          const txt = await createResp.text().catch(() => "");
          console.error("Create payment intent returned non-JSON:", txt);
          showError("Payment setup failed", "Unexpected server response when creating payment intent.");
          setLoading(false);
          return;
        }

        if (!createResp.ok || !createJson?.ok || !createJson?.clientSecret) {
          console.error("create payment intent error payload:", createJson);
          const errMsg = createJson?.error || createJson?.message || "Failed to create payment intent";
          showError("Payment setup failed", errMsg);
          setLoading(false);
          return;
        }
        const cs = createJson.clientSecret;
        setClientSecret(cs);

        if (createJson.order) {
          setProvisionalOrder(createJson.order);
        } else {
          setProvisionalOrder(order);
        }
        setStripeAccessToken(accessToken);
        setPaymentStatus("card-ready");
        setLoading(false);

        return;
      }

      if (paymentMethod === "mpesa") {
        setPaymentStatus("starting-mpesa");
        clearError();
        const init = await initiateMpesa({ ...order });
        if (!init.success) {
          return;
        }
        const checkoutId = init.checkoutId;
        if (!checkoutId) {
          showError("M-Pesa initiation did not return a valid checkoutId.", null);
          return;
        }
        setPaymentStatus("mpesa-waiting");
        const pollRes = await pollMpesaStatus(checkoutId, (s) => setPaymentStatus(`mpesa-${s}`));
        if (!pollRes.success) {
          showError("M-Pesa payment failed or timed out", pollRes.error ?? "unknown");
          return;
        }
        const orderRes = await fetch(`${API_BASE}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "Idempotency-Key": ik },
          body: JSON.stringify({ ...order, payment_details: { mpesaReceipt: pollRes.receipt } }),
        });
        if (!orderRes.ok) {
          const text = await orderRes.text().catch(() => "");
          showError("Order creation failed after M-Pesa", text || String(orderRes.status));
          return;
        }
        const responseData = await orderRes.json();

        const normalized = normalizeOrderForReceipt(responseData) ?? {
          id: responseData.id || Date.now().toString(),
          date: new Date().toISOString(),
          customer: { name: userData.name || "Customer", email: userData.email, address: shippingAddress?.label || "" },
          payment: { method: "M-Pesa", status: "confirmed", total: order.total_amount },
          items: items.map((c) => ({ id: c.id, name: c.name, quantity: c.quantity, price: c.price, image: c.image, vendor_name: c.vendor_name ?? null })),
        };

        const withId = withCanonicalId(normalized);
        setOrderDetails(withId);
        setShowSuccess(true);
        confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } });
        setTimeout(() => navigate(`/orders/view/${encodeURIComponent(String(withId.id))}`), 180000);
        return;
      }

      const orderRes = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, "Idempotency-Key": ik },
        body: JSON.stringify({ ...order, payment_details: paymentMethod === "paypal" ? { email: paypalEmail } : {} }),
      });
      if (!orderRes.ok) {
        const text = await orderRes.text().catch(() => "");
        showError("Order creation failed", text || String(orderRes.status));
        return;
      }
      const responseData = await orderRes.json();

      const normalized = normalizeOrderForReceipt(responseData) ?? {
        id: responseData.id || Date.now().toString(),
        date: new Date().toISOString(),
        customer: { name: userData.name || "Customer", email: userData.email, address: shippingAddress?.label || "" },
        payment: { method: pmLabel(paymentMethod), status: "pending", total: order.total_amount },
        items: items.map((c) => ({ id: c.id, name: c.name, quantity: c.quantity, price: c.price, image: c.image, vendor_name: c.vendor_name ?? null })),
      };

      const withId = withCanonicalId(normalized);
      setOrderDetails(withId);
      setShowSuccess(true);
      confetti({ particleCount: 80, spread: 50, origin: { y: 0.6 } });
      setTimeout(() => navigate(`/orders/view/${encodeURIComponent(String(withId.id))}`), 180000);
    } catch (err: any) {
      console.error("Order submit error", err);
      showError("Something went wrong when placing the order.", String(err?.message || err));
      setPaymentStatus("error");
      setLoading(false);
    }
  };

  const pmLabel = (m: string) => (m === "card" ? "Card" : m === "paypal" ? "PayPal" : m === "mpesa" ? "M-Pesa" : m === "cod" ? "Cash on Delivery" : m);

  /* ----------------------------- MPesa UI helper ----------------------------- */
  const MpesaPendingBox = ({ checkoutId }: { checkoutId: string }) => {
    const [localStatus, setLocalStatus] = useState<string | null>(null);

    useEffect(() => {
      if (!checkoutId) return;
      let mounted = true;
      const id = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/api/payments/mpesa/status?checkoutId=${encodeURIComponent(checkoutId)}`);
          if (!mounted) return;
          if (!res.ok) {
            if (res.status === 404) {
              setLocalStatus("not_found");
              return;
            }
            setLocalStatus("pending");
            return;
          }
          const json = await res.json();
          if (mounted) setLocalStatus(json?.status || "pending");
        } catch (err) {
          // ignore
        }
      }, 2500);
      return () => {
        mounted = false;
        clearInterval(id);
      };
    }, [checkoutId]);

    return (
      <div className="p-3 rounded-md bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
        <div className="text-sm">M-Pesa: waiting for confirmation on your phone</div>
        <div className="text-xs text-gray-400">Status: {localStatus ?? "pending"}</div>
      </div>
    );
  };

  /* ----------------------------- Success view (receipt) ----------------------------- */
  if (showSuccess && orderDetails) {
    const orderId = String(orderDetails.id ?? orderDetails.order_id ?? orderDetails._id ?? Date.now());

    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 py-12">
        <div id="receipt" className="max-w-3xl w-full">
          <OnlineReceipt orderId={orderId} />
        </div>

        <div className="flex gap-4 mt-6">
          <button onClick={() => navigate(`/orders/view/${encodeURIComponent(orderId)}`)} className="px-6 py-3 rounded-full bg-[rgba(16,185,129,0.95)] text-black">Open order page</button>
          <button onClick={() => navigate("/")} className="px-6 py-3 rounded-full bg-[rgba(16,185,129,0.15)] text-[rgba(16,185,129,0.95)]">Continue Shopping</button>
        </div>

        <div className="text-xs text-gray-400 mt-3">This page will redirect to your order page in 3 minutes.</div>
      </div>
    );
  }

  /* ----------------------------- Render checkout form ----------------------------- */
  const unavailable = ALL_METHODS.filter((m) => !allowedMethods.includes(m as Method));

  const renderCardElements = () => {
    if (!clientSecret || !stripePromise || !provisionalOrder) return null;
    return (
      <div className="mt-4">
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CardElementWrapper
            order={provisionalOrder}
            onSettled={(result: any) => {
              if (result?.order) {
                const finalOrder = result.order;
                const normalized = normalizeOrderForReceipt(finalOrder) ?? {
                  id: finalOrder.id ?? String(Date.now()),
                  date: finalOrder.created_at ?? new Date().toISOString(),
                  customer: { name: userData.name || "Customer", email: userData.email, address: shippingAddress?.label || "" },
                  payment: { method: finalOrder.payment_method ?? "Card", status: finalOrder.payment_status ?? "paid", total: finalOrder.total_amount ?? 0 },
                  items: Array.isArray(finalOrder.items) ? finalOrder.items.map((it: any) => ({ id: it.id, name: it.name, quantity: it.quantity, price: it.price, image: it.image })) : [],
                };
                const withId = withCanonicalId(normalized);
                setOrderDetails(withId);
                setShowSuccess(true);
                confetti({ particleCount: 100, spread: 60, origin: { y: 0.6 } });
                setTimeout(() => navigate(`/orders/view/${encodeURIComponent(String(withId.id))}`), 180000);
              }
            }}
            onError={(err: any) => {
              console.error("Card confirm error (outer):", err);
              showError("Payment failed", err?.message ?? String(err));
              setPaymentStatus("card-failed");
            }}
            sessionAccessToken={stripeAccessToken || ""}
          />
        </Elements>
      </div>
    );
  };

  return (
    <div className="min-h-screen px-6 py-10 bg-[linear-gradient(180deg,rgba(15,23,42,0.02),rgba(15,23,42,0.01))]">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7">
          <div className="rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)" }}>
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Checkout</h2>

            {/* Error banner (UI) */}
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{error.message}</div>
                    {error.details && <div className="text-xs mt-1 text-red-700 whitespace-pre-wrap">{error.details}</div>}
                  </div>
                  <div>
                    <button onClick={() => clearError()} className="text-sm px-2 py-1 rounded bg-red-100 hover:bg-red-200">Dismiss</button>
                  </div>
                </div>
              </div>
            )}

            {/* Stripe missing banner */}
            {!canUseStripe && (
              <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                Stripe publishable key not configured for the client. To enable card payments:
                <div className="mt-1">
                  Add <code>VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...</code> to your client <code>.env</code> and restart the dev server.
                </div>
              </div>
            )}

            {/* Order summary */}
            <div className="mb-6 p-4 rounded-lg bg-[rgba(0,0,0,0.02)] border border-[rgba(255,255,255,0.02)]">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-500">Items ({cart.length})</div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(total)}</div>
              </div>
              <div className="max-h-48 overflow-auto pr-2">
                <ul className="divide-y divide-[rgba(255,255,255,0.02)]">
                  {cart.map((item: CartItemType) => (
                    <li key={item.id} className="py-3 flex items-center gap-3">
                      {item.image && <img src={item.image} alt={item.name} className="w-14 h-14 object-cover rounded-md" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.name}</div>
                        <div className="text-xs text-gray-500">Qty {item.quantity} • {formatCurrency(Number(item.price))}</div>
                        {(item as any).vendor_name && <div className="text-xs text-gray-400 mt-1">Seller: {(item as any).vendor_name}</div>}
                      </div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{formatCurrency(Number(item.price) * Number(item.quantity))}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Shipping address</label>
                <div className="flex gap-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={addressQuery}
                    onChange={(e) => { setAddressQuery(e.target.value); setShippingAddress(null); }}
                    onFocus={onAddressFocus}
                    onKeyDown={onAddressKeyDown}
                    placeholder="Search your address..."
                    aria-autocomplete="list"
                    aria-expanded={suggestions.length > 0}
                    className="flex-1 px-4 py-2 rounded-md border bg-[rgba(0,0,0,0.02)] text-gray-900 dark:bg-[rgba(255,255,255,0.02)] dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => { if (!detectingLocation) detectLocation(); }}
                    disabled={detectingLocation}
                    className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800"
                    title="Detect my location"
                  >
                    {detectingLocation ? "Detecting…" : "Detect location"}
                  </button>
                </div>

                {suggestions.length > 0 && (
                  <ul ref={suggestionsRef} role="listbox" aria-label="Address suggestions" className="mt-2 rounded-md max-h-56 overflow-auto border bg-[rgba(0,0,0,0.02)] dark:bg-[rgba(255,255,255,0.02)]">
                    {suggestions.map((s, idx) => {
                      const label = buildLabelFromFeature(s) || s.properties?.name || "";
                      const isHighlighted = idx === highlightIndex;
                      return (
                        <li
                          key={idx}
                          role="option"
                          aria-selected={isHighlighted}
                          onPointerDown={(ev) => { ev.preventDefault(); handleSelectSuggestion(s); }}
                          onMouseEnter={() => setHighlightIndex(idx)}
                          className={clsx("px-4 py-2 cursor-pointer", isHighlighted ? "bg-[rgba(16,185,129,0.06)]" : "hover:bg-[rgba(0,0,0,0.02)]")}
                        >
                          <div className="text-sm text-gray-900 dark:text-gray-100">{label}</div>
                          {s.properties?.osm_value && <div className="text-xs text-gray-500 mt-0.5">{s.properties.osm_value}</div>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {shippingAddress?.label && <p className="mt-2 text-sm text-gray-500">Selected: {shippingAddress.label}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Order note (optional)</label>
                  <input value={orderNote} onChange={(e) => setOrderNote(e.target.value)} placeholder="Delivery instructions, gift note..." className="w-full px-3 py-2 rounded-md bg-[rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </div>

                <div>
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Delivery</label>
                  <select value={deliveryOption} onChange={(e) => setDeliveryOption(e.target.value as any)} className="w-full px-3 py-2 rounded-md bg-[rgba(0,0,0,0.02)] focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="standard">Standard (2–5 business days)</option>
                    <option value="express">Express (1–2 business days, +$8)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1 text-gray-700 dark:text-gray-200">Payment method</label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {allowedMethods.map((m) => (
                    <label key={m} className={clsx("cursor-pointer rounded-md px-3 py-2 flex items-center justify-center text-sm border", paymentMethod === m ? "border-emerald-500 bg-[rgba(16,185,129,0.06)]" : "border-[rgba(255,255,255,0.03)] hover:bg-[rgba(0,0,0,0.02)]")}>
                      <input className="sr-only" type="radio" name="pm" checked={paymentMethod === m} onChange={() => setPaymentMethod(m as Method)} />
                      <span>{pmLabel(m)}</span>
                    </label>
                  ))}
                </div>
                {loadingPolicies && <div className="text-xs text-gray-500 mt-2">Loading available payment methods...</div>}
                {unavailable.length > 0 && <div className="text-xs text-gray-500 mt-2">Unavailable: {unavailable.map(pmLabel).join(", ")}</div>}
              </div>

              {paymentMethod === "card" && (
                <div className="space-y-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-200">Card details</label>
                  <div className="text-xs text-gray-500 mb-2">
                    Card entry will be handled securely by Stripe — payment details are never sent to this server directly.
                  </div>

                  {clientSecret ? renderCardElements() : (
                    <div className="text-xs text-gray-500">Click "Place order" to continue to secure payment entry.</div>
                  )}

                  <div className="flex items-center gap-3 mt-2">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-500">
                      <input type="checkbox" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} className="rounded" /> Save payment method (server)
                    </label>
                    <div className="text-xs text-gray-400">Powered by Stripe — sensitive fields handled in Stripe Elements.</div>
                  </div>
                </div>
              )}

              {paymentMethod === "mpesa" && (
                <div className="space-y-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-200">M-Pesa phone</label>
                  <input value={mpesaPhone} onChange={(e) => setMpesaPhone(e.target.value)} placeholder="+2547xxxxxxxx" className="px-3 py-2 rounded-md bg-[rgba(0,0,0,0.02)]" required />
                  <div className="text-xs text-gray-400">You will receive an M-Pesa prompt on this number to confirm payment.</div>
                  {mpesaCheckoutId ? <MpesaPendingBox checkoutId={mpesaCheckoutId} /> : null}
                </div>
              )}

              {paymentMethod === "paypal" && (
                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-200">PayPal email</label>
                  <input value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} placeholder="you@paypal.com" className="px-3 py-2 rounded-md bg-[rgba(0,0,0,0.02)]" />
                </div>
              )}

              <div>
                <button type="submit" disabled={loading || !!clientSecret} className="w-full py-3 rounded-md bg-[rgba(16,185,129,0.95)] text-black font-medium hover:brightness-95 disabled:opacity-60">
                  {loading ? "Processing..." : `Place order • ${formatCurrency(total + (deliveryOption === "express" ? 8 : 0))}`}
                </button>
                <div className="text-xs text-gray-400 mt-2">Secure checkout — your payment details are never stored on this client.</div>
              </div>
            </form>
          </div>
        </div>

        <aside className="lg:col-span-5">
          <div className="sticky top-24 rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))", backdropFilter: "blur(6px)" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Order summary</h3>
              <div className="text-sm text-gray-500">{cart.length} items</div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-gray-500">
                <div>Subtotal</div>
                <div>{formatCurrency(total)}</div>
              </div>
              <div className="flex justify-between text-gray-500">
                <div>Delivery</div>
                <div>{deliveryOption === "express" ? formatCurrency(8) : "Free"}</div>
              </div>
            </div>

            <div className="border-t border-[rgba(255,255,255,0.03)] pt-4 mt-4">
              <div className="flex justify-between items-center">
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Total</div>
                <div className="text-xl font-bold text-[rgba(16,185,129,0.95)]">{formatCurrency(total + (deliveryOption === "express" ? 8 : 0))}</div>
              </div>
              <div className="text-xs text-gray-400 mt-1">Taxes & shipping calculated at checkout</div>
            </div>

            <div className="mt-4">
              <button onClick={() => navigate("/cart")} className="w-full py-2 rounded-md bg-[rgba(255,255,255,0.02)] text-sm">Edit cart</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

/* ----------------------------- Helper wrapper component (UPDATED for idempotency + safer fallbacks) ----------------------------- */
const CardElementWrapper: React.FC<{
  order: any;
  onSettled: (res: any) => void; // will be called when we obtain the final order result (paid) or fallback creation
  onError: (err: any) => void;
  sessionAccessToken: string;
}> = ({ order, onSettled, onError, sessionAccessToken }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);

  const pollOrderPaid = async (orderId: string, token: string | null, timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const headers: any = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/orders/${encodeURIComponent(orderId)}`, { headers });
        if (res.ok) {
          const j = await res.json();
          const fetched = j?.order ?? j?.data ?? j;
          const status =
            (fetched?.payment_status ?? fetched?.status ?? fetched?.payment?.status ?? "")
              .toString()
              .toLowerCase();
          if (["paid", "confirmed", "succeeded"].includes(status)) return fetched;
          if ((fetched?.payment_details?.stripePaymentIntentId) && status === "processing") {
            return fetched;
          }
        } else if (res.status === 401 || res.status === 403) {
          throw new Error("Unauthorized fetching provisional order; session may have expired.");
        }
      } catch (err) {
        // ignore transient errors
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("Timed out waiting for order to be marked paid");
  };

  const handleConfirm = async () => {
    if (!stripe || !elements) {
      onError(new Error("Stripe not initialized"));
      return;
    }
    setConfirming(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });

      if (error) throw new Error(error.message || "Payment confirmation failed");
      if (!paymentIntent) throw new Error("No payment intent returned");

      if (!["succeeded", "processing", "requires_capture"].includes(paymentIntent.status)) {
        throw new Error(`Payment not successful: ${paymentIntent.status}`);
      }

      const orderId = (order && (order.id || order.order_id || order._id)) ? (order.id || order.order_id || order._id) : null;

      if (orderId) {
        try {
          const finalOrder = await pollOrderPaid(String(orderId), sessionAccessToken || null, 30000);
          if (Array.isArray(finalOrder.items)) {
            finalOrder.items = finalOrder.items.map((it: any) => ({ ...it, vendor_name: it.vendor_name ?? it.vendorName ?? null }));
          }
          onSettled({ order: finalOrder, paymentIntent });
          return;
        } catch (pollErr) {
          console.warn("Polling order for paid status timed out, attempting best-effort PATCH to mark paid:", pollErr);
          try {
            const ik =
              (order?.meta?.idempotency_key) ||
              (order?.meta?.idempotencyKey) ||
              (order?.idempotency_key) ||
              (order?.meta?.idempotency) ||
              "";
            if (sessionAccessToken && ik) {
              const patchPayload = {
                payment_status: "paid",
                status: "confirmed",
                payment_details: { stripePaymentIntentId: paymentIntent.id, stripeRaw: paymentIntent },
                meta: { ...(order?.meta || {}), idempotency_key: ik, server_update_ts: new Date().toISOString() },
              };
              const patchRes = await fetch(`${API_BASE}/orders/${encodeURIComponent(String(orderId))}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${sessionAccessToken}`,
                  "Idempotency-Key": ik,
                },
                body: JSON.stringify(patchPayload),
              });

              if (patchRes.ok) {
                const patched = await patchRes.json();
                if (Array.isArray(patched.items)) {
                  patched.items = patched.items.map((it: any) => ({ ...it, vendor_name: it.vendor_name ?? it.vendorName ?? null }));
                }
                onSettled({ order: patched, paymentIntent });
                return;
              } else {
                const txt = await patchRes.text().catch(() => "");
                console.warn("Best-effort PATCH failed:", patchRes.status, txt);
              }
            } else {
              console.warn("No sessionAccessToken or idempotency key available to PATCH order; cannot patch provisional order.");
            }
          } catch (patchErr) {
            console.warn("Error during best-effort PATCH attempt:", patchErr);
          }

          try {
            const ik =
              (order?.meta?.idempotency_key) ||
              (order?.meta?.idempotencyKey) ||
              (order?.idempotency_key) ||
              (order?.meta?.idempotency) ||
              "";
            const createRes = await fetch(`${API_BASE}/orders`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: sessionAccessToken ? `Bearer ${sessionAccessToken}` : "",
                "Idempotency-Key": ik || "",
              },
              body: JSON.stringify({
                ...order,
                payment_method: "card",
                payment_status: "paid",
                status: "confirmed",
                payment_details: { stripePaymentIntentId: paymentIntent.id, stripeRaw: paymentIntent },
                meta: { ...(order?.meta || {}), idempotency_key: ik || "", fallback_create_ts: new Date().toISOString() },
              }),
            });

            if (!createRes.ok) {
              const t = await createRes.text().catch(() => "");
              throw new Error(t || "Order creation failed after payment (fallback)");
            }
            const created = await createRes.json();
            if (Array.isArray(created.items)) {
              created.items = created.items.map((it: any) => ({ ...it, vendor_name: it.vendor_name ?? it.vendorName ?? null }));
            }
            onSettled({ order: created, paymentIntent });
            return;
          } catch (createErr) {
            console.warn("Fallback create-order failed after poll timed out:", createErr);
            onError(new Error("Payment succeeded but we couldn't confirm/update the provisional order. Please check your Orders page shortly. If you don't see it in a few minutes contact support."));
            return;
          }
        }
      }

      if (!orderId) {
        const ik = (order?.meta?.idempotency_key) || (order?.meta?.idempotencyKey) || makeIdempotencyKey();
        try {
          const res = await fetch(`${API_BASE}/orders`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: sessionAccessToken ? `Bearer ${sessionAccessToken}` : "",
              "Idempotency-Key": ik,
            },
            body: JSON.stringify({
              ...order,
              payment_method: "card",
              payment_status: "paid",
              status: "confirmed",
              payment_details: { stripePaymentIntentId: paymentIntent.id, stripeRaw: paymentIntent },
              meta: { ...(order?.meta || {}), idempotency_key: ik },
            }),
          });
          if (!res.ok) {
            const t = await res.text();
            throw new Error(t || "Order creation failed after payment (fallback)");
          }
          const created = await res.json();
          if (Array.isArray(created.items)) {
            created.items = created.items.map((it: any) => ({ ...it, vendor_name: it.vendor_name ?? it.vendorName ?? null }));
          }
          onSettled({ order: created, paymentIntent });
          return;
        } catch (err) {
          onError(err);
          return;
        }
      }
    } catch (err: any) {
      if (err?.message && err.message.includes("Failed to fetch")) {
        onError(new Error("Network error connecting to Stripe — try disabling ad/tracker-blockers or test from an incognito window."));
      } else {
        onError(err);
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="p-4 rounded-md bg-[rgba(0,0,0,0.02)]">
      <PaymentElement />
      <div className="mt-3">
        <button onClick={handleConfirm} disabled={confirming} className="w-full py-2 rounded-md bg-[rgba(16,185,129,0.95)] text-black">
          {confirming ? "Confirming..." : "Confirm payment"}
        </button>
      </div>
    </div>
  );
};

export default CheckoutPage;
