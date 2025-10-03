// src/pages/CartPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Trash } from "lucide-react";
import { Link } from "react-router-dom";
import { useCart } from "@/context/CartContext";

/**
 * UI notes:
 * - Keeps all cart logic (updateQuantity, removeFromCart) unchanged.
 * - Uses local state for coupon/discount, saved-for-later list (localStorage).
 * - Visual language: glassy, muted tones, subtle shadows — avoids pure white.
 */

const SHIPPING_FLAT = 4.99; // default shipping estimate
const FREE_SHIPPING_THRESHOLD = 100; // free shipping over $100
const TAX_RATE = 0.08; // 8% estimated tax

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const CartPage = () => {
  const { cart, updateQuantity, removeFromCart } = useCart();

  // Local UI state
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState<string | null>(null);
  const [couponValue, setCouponValue] = useState<number>(0); // absolute discount (dollars)
  const [couponPct, setCouponPct] = useState<number>(0); // percent discount 0..100
  const [confirmClear, setConfirmClear] = useState(false);
  const [saved, setSaved] = useState<any[]>([]); // saved-for-later items (localStorage)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("vshop_saved_for_later");
      setSaved(raw ? JSON.parse(raw) : []);
    } catch {
      setSaved([]);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("vshop_saved_for_later", JSON.stringify(saved));
    } catch {
      // ignore
    }
  }, [saved]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );

  const shipping = useMemo(() => {
    if (subtotal === 0) return 0;
    return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FLAT;
  }, [subtotal]);

  const discountFromCoupon = useMemo(() => {
    // couponPct takes precedence
    if (couponPct > 0) return +(subtotal * (couponPct / 100));
    if (couponValue > 0) return Math.min(couponValue, subtotal);
    return 0;
  }, [subtotal, couponPct, couponValue]);

  const tax = useMemo(() => {
    const taxable = Math.max(0, subtotal - discountFromCoupon);
    return +(taxable * TAX_RATE);
  }, [subtotal, discountFromCoupon]);

  const total = useMemo(() => +(subtotal - discountFromCoupon + tax + shipping), [
    subtotal,
    discountFromCoupon,
    tax,
    shipping,
  ]);

  // apply coupon helper (supports '10%', '10%OFF', '$10', 'SAVE10' not recognized)
  const applyCoupon = () => {
    const raw = (coupon || "").trim();
    if (!raw) return;

    // percent style
    const pctMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
    if (pctMatch) {
      const pct = Math.min(100, parseFloat(pctMatch[1]));
      setCouponPct(pct);
      setCouponValue(0);
      setCouponApplied(raw);
      return;
    }

    // dollar style like $10 or 10$
    const $match = raw.match(/\$?\s*([0-9]+(?:\.[0-9]+)?)/);
    if ($match) {
      const val = parseFloat($match[1]);
      setCouponValue(val);
      setCouponPct(0);
      setCouponApplied(raw);
      return;
    }

    // unknown format -> try numeric fallback
    const justNum = parseFloat(raw);
    if (!Number.isNaN(justNum)) {
      setCouponValue(justNum);
      setCouponPct(0);
      setCouponApplied(raw);
      return;
    }

    // if nothing matched, clear
    setCouponPct(0);
    setCouponValue(0);
    setCouponApplied(null);
  };

  const removeCoupon = () => {
    setCoupon("");
    setCouponApplied(null);
    setCouponPct(0);
    setCouponValue(0);
  };

  const clearCart = () => {
    cart.forEach((item) => removeFromCart(item.id));
    setConfirmClear(false);
  };

  const moveToSaved = (item: any) => {
    // add to saved list and remove from cart
    setSaved((s) => {
      const exists = s.find((x: any) => x.id === item.id);
      if (exists) return s;
      return [...s, item];
    });
    removeFromCart(item.id);
  };

  // small helper UI components (kept inline for one-file)
  const QtyButton = ({ onClick, children, aria }: any) => (
    <button
      onClick={onClick}
      aria-label={aria}
      className="flex items-center justify-center w-9 h-9 rounded-md bg-[rgba(255,255,255,0.03)] dark:bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.04)] hover:scale-105 transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
    >
      {children}
    </button>
  );

  return (
    <div className="min-h-screen px-6 py-12 transition-colors duration-300">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main cart list */}
        <div className="lg:col-span-8">
          <div
            className="rounded-2xl p-6 shadow-sm"
            style={{
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.03), rgba(15,23,42,0.02))",
              backdropFilter: "blur(6px)",
            }}
          >
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Your Cart
            </h2>

            {cart.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-gray-500 dark:text-gray-400 mb-4">Your cart is empty.</p>
                <Link
                  to="/products"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  Browse products
                </Link>

                {/* saved for later quick access */}
                {saved.length > 0 && (
                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                      Saved for later
                    </h4>
                    <div className="flex gap-3 overflow-auto no-scrollbar">
                      {saved.map((sItem) => (
                        <div key={sItem.id} className="min-w-[200px] p-3 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
                          <img src={sItem.image} alt={sItem.name} className="w-full h-28 object-cover rounded-md mb-2" />
                          <div className="text-sm font-medium">{sItem.name}</div>
                          <div className="text-xs text-gray-400">{formatCurrency(sItem.price)}</div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => {
                                // restore to cart by updating quantity via existing cart API; naive: set as 1
                                updateQuantity(sItem.id, 1);
                                setSaved((s) => s.filter((x) => x.id !== sItem.id));
                              }}
                              className="text-xs px-2 py-1 rounded bg-emerald-600 text-white"
                            >
                              Move to cart
                            </button>
                            <button
                              onClick={() => setSaved((s) => s.filter((x) => x.id !== sItem.id))}
                              className="text-xs px-2 py-1 rounded border text-gray-400"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-6">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row items-start gap-4 border-b border-[rgba(0,0,0,0.04)] pb-4"
                    >
                      <img
                        src={item.image ?? "https://via.placeholder.com/140"}
                        alt={item.name}
                        className="w-28 h-28 rounded-lg object-cover flex-shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">{item.name}</h3>
                            {item.variant && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">{item.variant}</div>
                            )}
                          </div>

                          <div className="hidden sm:flex flex-col items-end">
                            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {formatCurrency(item.price)}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">each</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center gap-4">
                          <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.02)] p-1 rounded-md">
                            <QtyButton
                              onClick={() => updateQuantity(item.id, -1)}
                              aria="Decrease quantity"
                            >
                              <Minus className="w-4 h-4 text-gray-300" />
                            </QtyButton>

                            <div className="w-12 text-center text-sm">{item.quantity}</div>

                            <QtyButton
                              onClick={() => updateQuantity(item.id, 1)}
                              aria="Increase quantity"
                            >
                              <Plus className="w-4 h-4 text-gray-300" />
                            </QtyButton>
                          </div>

                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            Subtotal: <span className="font-medium text-gray-900 dark:text-gray-100">{formatCurrency(item.price * item.quantity)}</span>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            <button
                              onClick={() => moveToSaved(item)}
                              className="text-xs px-2 py-1 rounded-md text-gray-400 hover:text-gray-200 transition"
                            >
                              Save for later
                            </button>

                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="p-2 rounded-md hover:bg-[rgba(255,255,255,0.02)] transition"
                              aria-label={`Remove ${item.name}`}
                            >
                              <Trash className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 block sm:hidden text-sm text-gray-500 dark:text-gray-400">
                          Price: {formatCurrency(item.price)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Coupon & actions area */}
                <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                  <div className="flex-1">
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Have a coupon? e.g. 10% or $5"
                        value={coupon}
                        onChange={(e) => setCoupon(e.target.value)}
                        className="px-3 py-2 rounded-md border border-[rgba(255,255,255,0.04)] bg-[rgba(255,255,255,0.02)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 w-full"
                      />
                      <button
                        onClick={applyCoupon}
                        className="px-3 py-2 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 transition"
                      >
                        Apply
                      </button>
                      {couponApplied && (
                        <button
                          onClick={removeCoupon}
                          className="px-3 py-2 rounded-md border text-sm text-gray-400 hover:text-gray-200 transition"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    {couponApplied && (
                      <div className="mt-2 text-sm text-gray-400">
                        Applied: <span className="text-gray-200 dark:text-gray-100 font-medium">{couponApplied}</span>
                        <span className="ml-3 text-xs text-gray-400">
                          (You save {formatCurrency(discountFromCoupon)})
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmClear(true)}
                      className="px-4 py-2 rounded-md text-sm text-red-500 border border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition"
                    >
                      Clear cart
                    </button>

                    <Link
                      to="/products"
                      className="px-4 py-2 rounded-md text-sm text-emerald-500 border border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition"
                    >
                      Continue shopping
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Sticky / side checkout summary (desktop) */}
        <aside className="lg:col-span-4">
          <div
            className="sticky top-24 rounded-2xl p-5 shadow-sm"
            style={{
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.03), rgba(15,23,42,0.02))",
              backdropFilter: "blur(6px)",
            }}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Order summary</h3>

            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <div>Subtotal</div>
              <div>{formatCurrency(subtotal)}</div>
            </div>

            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <div>Discount</div>
              <div>- {formatCurrency(discountFromCoupon)}</div>
            </div>

            <div className="flex justify-between text-sm text-gray-500 mb-2">
              <div>Estimated tax</div>
              <div>{formatCurrency(tax)}</div>
            </div>

            <div className="flex justify-between text-sm text-gray-500 mb-4">
              <div>Shipping</div>
              <div>{shipping === 0 ? "Free" : formatCurrency(shipping)}</div>
            </div>

            <div className="border-t border-[rgba(255,255,255,0.03)] pt-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-gray-900 dark:text-gray-100">Total</div>
                <div className="text-lg font-bold text-emerald-600">{formatCurrency(total)}</div>
              </div>
              <div className="text-xs text-gray-400 mt-1">Taxes & shipping calculated at checkout</div>
            </div>

            <Link
              to="/checkout"
              className={`block text-center px-4 py-3 rounded-md text-sm font-medium transition ${
                cart.length === 0 ? "bg-emerald-400/40 pointer-events-none" : "bg-emerald-600 hover:bg-emerald-700"
              } text-white`}
            >
              Proceed to checkout
            </Link>

            <div className="mt-3 text-xs text-gray-400 text-center">Secure payment & fast delivery</div>
          </div>
        </aside>
      </div>

      {/* Confirm clear modal */}
      {confirmClear && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmClear(false)} />
          <div className="relative max-w-md w-full rounded-2xl p-6" style={{ background: "linear-gradient(180deg, rgba(15,23,42,0.05), rgba(15,23,42,0.03))", backdropFilter: "blur(8px)" }}>
            <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Clear cart?</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This will remove all items from your cart. This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmClear(false)} className="px-4 py-2 rounded-md border text-sm text-gray-400 hover:bg-[rgba(255,255,255,0.02)]">Cancel</button>
              <button onClick={clearCart} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm hover:bg-red-700">Clear cart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
