// src/context/CartContext.tsx
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

// Use this globally or define in "@/types"
export type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
  product_id?: string | number;
  variant?: string;
  vendor?: boolean;
  vendor_id?: string;
  vendor_name?: string | null;
  payment_methods?: ("card" | "paypal" | "mpesa" | "cod")[];
};

export type CartContextType = {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

/**
 * Exported hook as a plain function declaration so React Fast Refresh
 * can track and preserve it across HMR updates.
 */
export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}

/**
 * CartProvider as a function declaration (stable export)
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (newItem: CartItem) => {
    setCart((prev) => {
      const exists = prev.find((item) => item.id === newItem.id);
      if (exists) {
        return prev.map((item) =>
          item.id === newItem.id
            ? {
                ...item,
                quantity: item.quantity + newItem.quantity,
                vendor_name: newItem.vendor_name ?? item.vendor_name ?? null,
              }
            : item
        );
      }
      return [...prev, { ...newItem, vendor_name: newItem.vendor_name ?? null }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );
  };

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity }}>
      {children}
    </CartContext.Provider>
  );
}
