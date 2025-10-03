import { useEffect, useState } from "react";
import axios from "axios";
import {
  ShoppingCart,
  DollarSign,
  Trash2,
  Package,
  PlusCircle,
  Search,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

interface CartItem {
  product: Product;
  quantity: number;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

const POSTab = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get("/api/products");
        setProducts(res.data.products || []);
      } catch (err: any) {
        setError(
          err?.response?.data?.error ||
            err.message ||
            "Failed to load products."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      alert("Out of stock!");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert("Not enough stock!");
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const handleCheckout = async () => {
    if (cart.length === 0) return alert("Cart is empty!");
    try {
      await api.post("/api/sales", {
        customerName,
        customerPhone,
        paymentMethod,
        items: cart.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
        })),
        totalAmount,
      });

      // Update local stock
      setProducts((prev) =>
        prev.map((p) => {
          const item = cart.find((c) => c.product.id === p.id);
          return item ? { ...p, stock: p.stock - item.quantity } : p;
        })
      );

      alert("Sale recorded successfully!");
      // Reset form
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setPaymentMethod("cash");
    } catch (err) {
      alert("Checkout failed. Please try again.");
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="text-center p-6">Loading products...</div>;
  }

  if (error) {
    return <div className="text-center text-red-500">{error}</div>;
  }

  const inputStyles =
    "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectStyles =
    "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1 w-full focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Product List */}
      <div className="lg:col-span-2 space-y-4">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Package className="text-blue-500" /> Products
        </h2>

        {/* Search Bar */}
        <div className="flex items-center gap-2 mb-4">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={inputStyles}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-[#d3d2d2] dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col justify-between hover:shadow-lg transition"
            >
              <div>
                <h3 className="text-lg font-semibold">{product.name}</h3>
                <p className="text-gray-500 dark:text-gray-400">
                  ${product.price.toFixed(2)}
                </p>
                <p className="text-sm text-gray-400">Stock: {product.stock}</p>
              </div>
              <button
                onClick={() => addToCart(product)}
                className="mt-4 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg"
              >
                <PlusCircle size={18} /> Add to Cart
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div>
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <ShoppingCart className="text-purple-500" /> Cart
        </h2>
        <div className="bg-[#d3d2d2] dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
          {/* Customer Details */}
          <input
            type="text"
            placeholder="Customer Name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={inputStyles}
          />
          <input
            type="tel"
            placeholder="Customer Phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={inputStyles}
          />

          {/* Payment Method */}
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className={selectStyles}
          >
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="mpesa">M-Pesa</option>
          </select>

          {cart.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Cart is empty.</p>
          ) : (
            <>
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.quantity} × ${item.product.price.toFixed(2)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              <div className="border-t border-gray-300 dark:border-gray-700 pt-4 flex justify-between items-center">
                <span className="font-bold flex items-center gap-1">
                  <DollarSign className="text-emerald-500" /> Total
                </span>
                <span className="text-lg font-bold">
                  ${totalAmount.toFixed(2)}
                </span>
              </div>
              <button
                onClick={handleCheckout}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg"
              >
                Checkout
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default POSTab;
