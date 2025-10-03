// src/App.tsx
import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { CategoryProvider } from "@/context/CategoryContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { CurrencyProvider, useCurrency } from "@/context/CurrencyContext";
import html2canvas from "html2canvas";
import { Share2, X, Copy, Download, Link as LinkIcon, Instagram, MessageCircle } from "lucide-react";

// Components
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import OnlineReceipt from "./components/OnlineReceipt";

// Pages
import HomePage from "./pages/HomePage";
import SignIn from "./pages/SignIn";
import SignUp from "./pages/SignUp";
import ProductPage from "./pages/ProductPage";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/CheckoutPage";
import ProductsPage from "./pages/products";
import CategoryPage from "./pages/CategoryPage";
import ApplyVendorPage from "./pages/ApplyVendorPage";
import VendorDashboardPage from "./pages/VendorDashboardPage";
import VendorPortal from "./pages/VendorPortalPage";
import OrderTrackingPage from "./pages/OrderTrackingPage";
import SupportPage from "./pages/SupportPage";
import ContactPage from "./pages/ContactPage";
import AccountPage from "./pages/AccountPage";
import AdminDashboard from "./pages/AdminDashboard";
import BestSellersPage from "./pages/BestSellersPage";
import TrendingPage from "./pages/TrendingPage";
import NewArrivalsPage from "./pages/NewArrivalsPage";
import VendorApplicationsPage from "./components/admin/VendorApplicationsPage";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VendorPage from "@/pages/VendorPage";
import AllVendors from "@/pages/AllVendors";
import NotificationsPage from "./pages/NotificationsPage";
import DealsPage from "./pages/DealsPage";

function AppInner() {
  const location = useLocation();
  const { currency, locale, country, loading } = useCurrency();

  const hideNavbarRoutes = ["/signin", "/signup", "/forgot-password"];
  const shouldHideNavbar = hideNavbarRoutes.includes(location.pathname);

  const [isDarkMode, _setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const [shareOpen, setShareOpen] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

  // 📸 Capture screenshot
  const handleShareClick = async () => {
    const canvas = await html2canvas(document.body, { scale: 2 });
    setScreenshot(canvas.toDataURL("image/png"));
    setShareOpen(true);
  };

  // 📋 Copy link
  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  };

  // 💾 Download image
  const downloadImage = () => {
    if (!screenshot) return;
    const a = document.createElement("a");
    a.href = screenshot;
    a.download = "screenshot.png";
    a.click();
  };

  // 🔗 Open WhatsApp
  const shareWhatsApp = () => {
    const url = encodeURIComponent(window.location.href);
    window.open(`https://wa.me/?text=${url}`, "_blank");
  };

  // 🔗 Open Instagram (just opens profile/page since IG doesn’t support link share like WA)
  const shareInstagram = () => {
    alert("Instagram doesn’t support direct link sharing. Download the image and upload manually.");
  };

  return (
    <NotificationProvider>
      <CategoryProvider>
        <div
          className="flex flex-col min-h-screen
                     bg-[#d3d2d2] dark:bg-gray-950
                     text-gray-900 dark:text-white
                     transition-colors duration-300"
        >
          {!shouldHideNavbar && <Navbar />}

          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/product" element={<ProductPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/category" element={<CategoryPage />} />
              <Route path="/best-sellers" element={<BestSellersPage />} />
              <Route path="/trending" element={<TrendingPage />} />
              <Route path="/new-arrivals" element={<NewArrivalsPage />} />
              <Route
                path="/receipt"
                element={<OnlineReceipt orderId="12345" date={new Date().toISOString()} />}
              />
              <Route path="/deals" element={<DealsPage />} />
              <Route path="/apply-vendor" element={<ApplyVendorPage />} />
              <Route path="/vendor-dashboard" element={<VendorDashboardPage />} />
              <Route path="/vendor-portal" element={<VendorPortal />} />
              <Route path="/vendor/:id" element={<VendorPage />} />
              <Route path="/vendors" element={<AllVendors />} />
              <Route path="/order-tracking" element={<OrderTrackingPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="/admin-dashboard" element={<AdminDashboard />} />
              <Route path="/admin/vendor-applications" element={<VendorApplicationsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </main>

          {!shouldHideNavbar && <Footer />}

          {/* FAB */}
          {!shouldHideNavbar && (
            <button
              onClick={handleShareClick}
              className="fixed bottom-6 left-6 z-50 rounded-full bg-blue-600 p-4 text-white shadow-lg hover:bg-blue-700 transition"
            >
              <Share2 size={24} />
            </button>
          )}

          {/* Share Modal */}
          {shareOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-96 relative shadow-xl">
                <button
                  onClick={() => setShareOpen(false)}
                  className="absolute top-3 right-3 text-gray-600 hover:text-red-500"
                >
                  <X size={20} />
                </button>
                <h2 className="text-lg font-semibold mb-4">Share this page</h2>

                {screenshot && (
                  <img
                    src={screenshot}
                    alt="screenshot"
                    className="rounded-lg border mb-4 max-h-48 object-cover"
                  />
                )}

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={shareWhatsApp}
                    className="flex items-center gap-2 bg-green-500 text-white px-3 py-2 rounded-lg hover:bg-green-600"
                  >
                    <MessageCircle size={18} /> WhatsApp
                  </button>

                  <button
                    onClick={shareInstagram}
                    className="flex items-center gap-2 bg-pink-500 text-white px-3 py-2 rounded-lg hover:bg-pink-600"
                  >
                    <Instagram size={18} /> Instagram
                  </button>

                  <button
                    onClick={copyLink}
                    className="flex items-center gap-2 bg-gray-700 text-white px-3 py-2 rounded-lg hover:bg-gray-800"
                  >
                    <LinkIcon size={18} /> Copy Link
                  </button>

                  <button
                    onClick={downloadImage}
                    className="flex items-center gap-2 bg-blue-500 text-white px-3 py-2 rounded-lg hover:bg-blue-600"
                  >
                    <Download size={18} /> Download
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CategoryProvider>
    </NotificationProvider>
  );
}

function App() {
  return (
    <CurrencyProvider>
      <AppInner />
    </CurrencyProvider>
  );
}

export default App;
