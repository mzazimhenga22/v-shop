// src/context/CurrencyContext.tsx
import React, { createContext, useContext, useEffect, useState } from "react";

type CurrencyContextType = {
  currency: string; // ISO currency code, e.g. "KES"
  locale: string; // locale for formatter, e.g. "en-KE"
  country?: string; // ISO country code, e.g. "KE"
  loading: boolean;
  formatCurrency: (value: number) => string;
  setCurrency: (currency: string, locale?: string) => void;
};

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const countryToCurrencyAndLocale: Record<
  string,
  { currency: string; locale: string }
> = {
  KE: { currency: "KES", locale: "en-KE" }, // Kenya
  UG: { currency: "UGX", locale: "en-UG" }, // Uganda
  TZ: { currency: "TZS", locale: "en-TZ" }, // Tanzania (if you want)
  RW: { currency: "RWF", locale: "en-RW" }, // Rwanda
  US: { currency: "USD", locale: "en-US" }, // fallback preference
  GB: { currency: "GBP", locale: "en-GB" },
};

async function reverseGeocodeCountry(lat: number, lon: number): Promise<string | null> {
  try {
    // Use Nominatim reverse geocode (free). If you prefer another API, swap here.
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat
    )}&lon=${encodeURIComponent(lon)}`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "MyApp/1.0 (contact@example.com)" },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    // country_code is lowercase; convert to uppercase ISO2
    return (json?.address?.country_code || json?.address?.country || null)
      ? (json.address.country_code || null)?.toUpperCase() ?? null
      : null;
  } catch (err) {
    return null;
  }
}

async function detectCountryByIP(): Promise<string | null> {
  try {
    const resp = await fetch("https://ipapi.co/json/");
    if (!resp.ok) return null;
    const j = await resp.json();
    return j.country?.toUpperCase() ?? null;
  } catch (e) {
    return null;
  }
}

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currency, setCurrencyState] = useState<string>("USD");
  const [locale, setLocale] = useState<string>(navigator.language || "en-US");
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    const detect = async () => {
      setLoading(true);

      // 1) Try browser geolocation (fast if allowed)
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            // small timeout to avoid indefinite blocking
            const id = navigator.geolocation.getCurrentPosition(
              (p) => {
                resolve(p);
              },
              (err) => reject(err),
              { timeout: 6000 } // 6s
            );
          });

          if (!cancelled) {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const countryCode = await reverseGeocodeCountry(lat, lon);
            if (countryCode) {
              setCountry(countryCode);
              const mapping = countryToCurrencyAndLocale[countryCode];
              if (mapping) {
                setCurrencyState(mapping.currency);
                setLocale(mapping.locale);
              } else {
                // default: use navigator.language and USD
                setCurrencyState("USD");
                setLocale(navigator.language || "en-US");
              }
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          // permission denied or failed — we'll try IP fallback
        }
      }

      // 2) Fallback to IP Geo lookup
      const ipCountry = await detectCountryByIP();
      if (!cancelled) {
        if (ipCountry) {
          setCountry(ipCountry);
          const mapping = countryToCurrencyAndLocale[ipCountry];
          if (mapping) {
            setCurrencyState(mapping.currency);
            setLocale(mapping.locale);
          } else {
            setCurrencyState("USD");
            setLocale(navigator.language || "en-US");
          }
        } else {
          // Last resort: use navigator.language to infer locale (not country)
          setCurrencyState("USD");
          setLocale(navigator.language || "en-US");
        }
        setLoading(false);
      }
    };

    detect();

    return () => {
      cancelled = true;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setCurrency = (newCurrency: string, newLocale?: string) => {
    setCurrencyState(newCurrency);
    if (newLocale) setLocale(newLocale);
  };

  const formatCurrency = (value: number) => {
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
    } catch (err) {
      // if Intl fails for some reason, fallback to simple formatting
      return `${currency} ${value.toFixed(2)}`;
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, locale, country, loading, formatCurrency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export function useCurrency(): CurrencyContextType {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
