// src/App.tsx
import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { CategoryProvider } from "@/context/CategoryContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { CurrencyProvider, useCurrency } from "@/context/CurrencyContext";

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
  const { currency, locale, country, loading, formatCurrency } = useCurrency();

  // Hide navbar/footer for auth pages
  const hideNavbarRoutes = ["/signin", "/signup"];
  const shouldHideNavbar = hideNavbarRoutes.includes(location.pathname);

  // Dark mode state
  const [isDarkMode, _setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

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

  useEffect(() => {
    // debug log for currency detection
    console.info("Currency detection:", { loading, country, currency, locale });
  }, [loading, country, currency, locale]);

  return (
    <NotificationProvider>
      <CategoryProvider>
        <div
          className="flex flex-col min-h-screen
                     bg-[#d3d2d2] dark:bg-gray-950
                     text-gray-900 dark:text-white
                     transition-colors duration-300"
        >
          {/* Navbar visible unless explicitly hidden */}
          {!shouldHideNavbar && <Navbar />}

          <main className="flex-1">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<HomePage />} />
              <Route path="/signin" element={<SignIn />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Shop & browsing */}
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

              {/* Vendor & dashboard */}
              <Route path="/apply-vendor" element={<ApplyVendorPage />} />
              <Route path="/vendor-dashboard" element={<VendorDashboardPage />} />
              <Route path="/vendor-portal" element={<VendorPortal />} />
              <Route path="/vendor/:id" element={<VendorPage />} />
              <Route path="/vendors" element={<AllVendors />} />

              {/* Orders & support */}
              <Route path="/order-tracking" element={<OrderTrackingPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/account" element={<AccountPage />} />

              {/* Admin */}
              <Route path="/admin-dashboard" element={<AdminDashboard />} />
              <Route path="/admin/vendor-applications" element={<VendorApplicationsPage />} />

              {/* Notifications */}
              <Route path="/notifications" element={<NotificationsPage />} />
            </Routes>
          </main>

          {/* Footer visible unless explicitly hidden */}
          {!shouldHideNavbar && <Footer />}
        </div>
      </CategoryProvider>
    </NotificationProvider>
  );
}

function App() {
  // Wrap the whole app with CurrencyProvider so every component can use currency
  return (
    <CurrencyProvider>
      <AppInner />
    </CurrencyProvider>
  );
}

export default App;
