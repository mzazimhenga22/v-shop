// src/components/ProductCard.tsx
import React from "react";
import { Star, Flame, Sparkles, Clock, Percent, Edit, Trash } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { saveToRecentlyViewed } from "@/utils/recent";
import type { Product } from "@/types";
import { useCurrency } from "@/context/CurrencyContext";
import { useCart, type CartItem } from "@/context/CartContext";

/* --- helper to compute discounted price --- */
function parseSaleAndCompute(price: number, saleRaw?: any) {
  const original = Number(price || 0);
  let finalPrice = original;
  let originalPrice: number | undefined = undefined;
  let discountLabel: string | undefined = undefined;
  let isDiscounted = false;

  const applyPercent = (pct: number) => {
    if (pct <= 0) return;
    const p = Math.max(0, Math.min(1, pct));
    const fp = +(original * (1 - p)).toFixed(2);
    if (fp < original) {
      finalPrice = fp;
      originalPrice = original;
      discountLabel = `${Math.round(p * 100)}% OFF`;
      isDiscounted = true;
    }
  };

  const applyDollar = (off: number) => {
    if (off <= 0) return;
    const fp = +(Math.max(0, original - off)).toFixed(2);
    if (fp < original) {
      finalPrice = fp;
      originalPrice = original;
      discountLabel = `$${off} off`;
      isDiscounted = true;
    }
  };

  if (saleRaw === null || saleRaw === undefined || saleRaw === false || saleRaw === "false") {
    return { finalPrice, originalPrice: undefined, discountLabel: undefined, isDiscounted: false };
  }

  if (saleRaw === true) {
    discountLabel = "On Sale";
    isDiscounted = true;
    return { finalPrice, originalPrice, discountLabel, isDiscounted };
  }

  if (typeof saleRaw === "number" && !Number.isNaN(saleRaw)) {
    const n = saleRaw;
    if (n > 0 && n <= 1) {
      applyPercent(n);
    } else if (n > 1 && n <= 100) {
      applyPercent(n / 100);
      if (!isDiscounted) applyDollar(n);
    } else if (n > 100) {
      applyDollar(n);
    }
    return { finalPrice, originalPrice, discountLabel, isDiscounted };
  }

  if (typeof saleRaw === "object") {
    try {
      if ("percent" in (saleRaw as any) || "pct" in (saleRaw as any) || "value" in (saleRaw as any)) {
        const v = Number((saleRaw as any).percent ?? (saleRaw as any).pct ?? (saleRaw as any).value);
        if (!Number.isNaN(v)) {
          applyPercent(v > 1 ? v / 100 : v);
        }
      } else if ("amount" in (saleRaw as any) || "off" in (saleRaw as any)) {
        const v = Number((saleRaw as any).amount ?? (saleRaw as any).off);
        if (!Number.isNaN(v)) applyDollar(v);
      } else {
        saleRaw = String(saleRaw);
      }
    } catch {
      saleRaw = String(saleRaw);
    }
  }

  if (typeof saleRaw === "string") {
    const s = saleRaw.trim();
    if (!s) return { finalPrice, originalPrice: undefined, discountLabel: undefined, isDiscounted: false };
    const lower = s.toLowerCase();

    if (["true", "onsale", "on sale", "sale"].includes(lower)) {
      discountLabel = "On Sale";
      isDiscounted = true;
      return { finalPrice, originalPrice: undefined, discountLabel, isDiscounted };
    }

    const pctMatch = lower.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (pctMatch) {
      const val = parseFloat(pctMatch[1]);
      if (!Number.isNaN(val)) {
        applyPercent(val / 100);
        return { finalPrice, originalPrice, discountLabel, isDiscounted };
      }
    }

    const decimalMatch = lower.match(/^0\.\d+$/);
    if (decimalMatch) {
      const val = parseFloat(lower);
      if (!Number.isNaN(val)) {
        applyPercent(val);
        return { finalPrice, originalPrice, discountLabel, isDiscounted };
      }
    }

    const dollarMatch = lower.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:off|usd|\$)?/);
    if (dollarMatch) {
      const v = parseFloat(dollarMatch[1]);
      if (!Number.isNaN(v)) {
        if (v > 0 && v <= 100) {
          applyPercent(v / 100);
          if (!isDiscounted) applyDollar(v);
        } else {
          applyDollar(v);
        }
        return { finalPrice, originalPrice, discountLabel, isDiscounted };
      }
    }

    discountLabel = s.length > 0 ? s : undefined;
    isDiscounted = !!discountLabel;
    return { finalPrice, originalPrice, discountLabel, isDiscounted };
  }

  return { finalPrice, originalPrice: undefined, discountLabel: undefined, isDiscounted: false };
}

/* --- component --- */
interface ProductCardProps {
  product: Product & { discount?: any; oldPrice?: number | string; sale?: any; lowStock?: boolean };
  onEdit?: () => void;
  onDelete?: () => void;
  onAddToCart?: () => void;
  onBuyNow?: () => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onEdit, onDelete, onAddToCart, onBuyNow }) => {
  const navigate = useNavigate();
  const { formatCurrency } = useCurrency();
  const { addToCart } = useCart();

  const priceNum = Number(product.price ?? 0) || 0;

  const saleInput = product.sale ?? product.discount ?? undefined;
  const { finalPrice, originalPrice, discountLabel } = parseSaleAndCompute(priceNum, saleInput);

  const oldPriceNum =
    product.oldPrice !== undefined && product.oldPrice !== null ? Number(product.oldPrice) : undefined;

  const effectiveOriginal =
    oldPriceNum !== undefined && !Number.isNaN(oldPriceNum) && oldPriceNum > finalPrice
      ? oldPriceNum
      : originalPrice;

  const effectiveDiscounted = effectiveOriginal !== undefined && effectiveOriginal > finalPrice;

  const ratingCount = Math.max(0, Math.floor(Number(product.rating ?? 0)));

  const handleClick = () => {
    try {
      saveToRecentlyViewed({
        id: Number(product.id ?? 0) || 0,
        name: product.name,
        image: product.image ?? "/images/placeholder.png",
        price: formatCurrency(finalPrice),
      });
    } catch {}
    navigate("/product", { state: { product } });
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Build a CartItem compatible object
    const cartItem: CartItem = {
      id: String(product.id ?? product.sku ?? product.slug ?? `p-${Math.random().toString(36).slice(2)}`),
      name: product.name ?? "Product",
      price: Number(finalPrice ?? priceNum ?? 0),
      quantity: 1,
      image: product.image ?? null,
      product_id: product.id,
      // keep variant/vendor/payment fields absent unless provided
    };

    try {
      addToCart(cartItem);
    } catch (err) {
      // In case the component is used outside of CartProvider, avoid crashing.
      // You might want to surface a toast here in real app.
      // console.warn("addToCart failed (no CartProvider?):", err);
    }

    // call optional prop callback (keeps backwards compat)
    if (onAddToCart) {
      try {
        onAddToCart();
      } catch {}
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`relative cursor-pointer rounded-2xl p-4 transform transition-transform duration-300 ease-in-out
                   bg-[#d3d2d2] dark:bg-gray-950
                   shadow-[0_8px_20px_rgba(2,6,23,0.12)] hover:shadow-[0_18px_40px_rgba(2,6,23,0.18)]
                   hover:-translate-y-2
                   ring-1 ring-white/10 dark:ring-black/20 overflow-hidden`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleClick();
      }}
    >
      {/* badges */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          {discountLabel && (
            <span
              className="inline-flex items-center gap-1 bg-emerald-600/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md shadow-sm"
              aria-label={`Discount: ${discountLabel}`}
            >
              <Percent className="w-3 h-3" />
              <span className="leading-none">{discountLabel}</span>
            </span>
          )}
          <div className="flex items-center gap-2">
            {product.hot && (
              <span className="inline-flex items-center gap-1 bg-red-600/90 text-white text-xs font-medium px-2 py-0.5 rounded-md shadow-sm">
                <Flame className="w-3 h-3" />
                Hot
              </span>
            )}
            {product.new && (
              <span className="inline-flex items-center gap-1 bg-sky-600/90 text-white text-xs font-medium px-2 py-0.5 rounded-md shadow-sm">
                <Sparkles className="w-3 h-3" />
                New
              </span>
            )}
            {product.lowStock && (
              <span className="inline-flex items-center gap-1 bg-yellow-400/95 text-black text-xs font-medium px-2 py-0.5 rounded-md shadow-sm">
                <Clock className="w-3 h-3" />
                Few left
              </span>
            )}
          </div>
        </div>

        {(onEdit || onDelete) && (
          <div className="flex items-center gap-2 opacity-90">
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="p-2 rounded-md bg-white/30 dark:bg-black/20 hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                aria-label="Edit product"
                title="Edit"
              >
                <Edit className="w-4 h-4 text-gray-700 dark:text-gray-200" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="p-2 rounded-md bg-white/30 dark:bg-black/20 hover:bg-white/40 focus:outline-none focus:ring-2 focus:ring-red-400"
                aria-label="Delete product"
                title="Delete"
              >
                <Trash className="w-4 h-4 text-red-600" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* image */}
      <div className="w-full h-48 mb-4 rounded-xl bg-gradient-to-b from-gray-100 to-transparent dark:from-gray-700 flex items-center justify-center overflow-hidden">
        <img
          src={product.image ?? "/images/placeholder.png"}
          alt={product.name ?? "Product"}
          className="max-h-full max-w-full object-contain transition-transform duration-500 hover:scale-105"
        />
      </div>

      <h3 className="text-sm font-semibold mb-1 text-gray-800 dark:text-gray-100 line-clamp-2">{product.name}</h3>

      <div className="flex items-center text-xs text-amber-500 mb-2" aria-label={`Rating ${ratingCount} out of 5`}>
        {Array.from({ length: Math.min(5, ratingCount) }).map((_, i) => (
          <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
        ))}
        {ratingCount < 1 && <span className="text-xs text-gray-400 ml-1">No ratings yet</span>}
        {product.reviews && <span className="ml-2 text-gray-500 dark:text-gray-400">({product.reviews})</span>}
      </div>

      <div className="mb-3">
        {effectiveDiscounted ? (
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(finalPrice)}</div>
            <div className="text-sm text-gray-500 line-through decoration-1 decoration-gray-400">
              {formatCurrency(Number(effectiveOriginal))}
            </div>
          </div>
        ) : (
          <div className="text-lg font-semibold text-gray-900 dark:text-white">{formatCurrency(finalPrice)}</div>
        )}
      </div>

      <div className="flex gap-2 mt-2">
        <button
          onClick={handleAddToCart}
          className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
          aria-label="Add to cart"
        >
          Add to cart
        </button>

        {onBuyNow && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onBuyNow();
            }}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            aria-label="Buy now"
          >
            Buy now
          </button>
        )}
      </div>
    </div>
  );
};

export default ProductCard;
