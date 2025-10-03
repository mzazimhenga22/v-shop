// src/pages/AdminDashboard.tsx
import { useState } from "react";
import Tabs from "@/components/admin/Tabs";
import UsersTab from "@/components/admin/UsersTab";
import OrdersTab from "@/components/admin/OrdersTab";
import MetricsTab from "@/components/admin/MetricsTab";
import ProductsTab from "@/components/admin/ProductsTab";
import { ProductUpdateTab } from "@/components/admin/ProductUpdateTab";
import AdminVendorsTab from "@/components/admin/AdminVendorsTab";
import POSTab from "@/components/admin/POSTab";
import BusinessAnalyticsTab from "@/components/admin/BusinessAnalyticsTab";

const TABS = [
  "Users",
  "Orders",
  "Metrics",
  "Products",
  "Product Update",
  "Admin & Vendors",
  "POS",
  "Business Analytics",
] as const;

type Tab = (typeof TABS)[number];

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<Tab>("Users");

  const renderTabContent = () => {
    switch (activeTab) {
      case "Users":
        return <UsersTab />;
      case "Orders":
        return <OrdersTab />;
      case "Metrics":
        return <MetricsTab />;
      case "Products":
        return <ProductsTab />;
      case "Product Update":
        return <ProductUpdateTab />;
      case "Admin & Vendors":
        return <AdminVendorsTab />;
      case "POS":
        return <POSTab />;
      case "Business Analytics":
        return <BusinessAnalyticsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* decorative background blobs — subtle, theme aware */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(600px 400px at 10% 10%, rgba(16,185,129,0.06), transparent 18%), radial-gradient(500px 300px at 90% 80%, rgba(16,185,129,0.04), transparent 18%)",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-20 pointer-events-none dark:hidden"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(15,23,42,0.02))",
        }}
      />
      <div
        aria-hidden
        className="fixed inset-0 -z-20 pointer-events-none hidden dark:block"
        style={{
          background:
            "radial-gradient(700px 400px at 15% 20%, rgba(16,185,129,0.03), transparent 16%), radial-gradient(600px 300px at 85% 75%, rgba(255,255,255,0.02), transparent 16%)",
        }}
      />

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Top container mirrors navbar cards: translucent and theme aware */}
        <div
          className="rounded-2xl shadow-lg p-8 border"
          style={{
            // fallback bg to keep things crisp if Tailwind JIT class not available
          }}
        >
          {/* card background using Tailwind utilities so dark mode is respected */}
          <div className="absolute inset-0 rounded-2xl pointer-events-none -z-10
                          bg-[rgba(255,255,255,0.72)] dark:bg-[rgba(17,17,17,0.64)]"
          />

          <div className="relative z-10">
            <h1 className="text-4xl font-extrabold text-center mb-4 tracking-tight text-gray-900 dark:text-gray-100">
              Vshop Admin Dashboard
            </h1>
            <p className="text-center text-sm text-gray-600 dark:text-gray-300 mb-6">
              Overview & management — products, vendors, orders and analytics.
            </p>

            <div className="mb-6">
              <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />
            </div>

            {/* inner content panel */}
            <div className="rounded-xl p-6 border"
                 style={{ position: "relative", overflow: "hidden" }}>
              {/* panel background (transparent & theme-aware) */}
              <div className="absolute inset-0 -z-10 rounded-xl
                              bg-[rgba(255,255,255,0.54)] dark:bg-[rgba(30,30,30,0.5)]" />

              <div className="relative z-10">
                {renderTabContent()}
              </div>
            </div>

            {/* bottom actions row */}
            <div className="mt-6 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-600 dark:text-gray-300">Logged in as Admin</span>
              </div>

              <div className="flex items-center gap-3">
                <button className="px-4 py-2 rounded-md bg-emerald-600 text-white text-sm shadow-sm hover:bg-emerald-500 transition">
                  Create Product
                </button>
                <button className="px-4 py-2 rounded-md bg-white/60 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-100 hover:opacity-90 transition">
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* small inline styles to ensure border & backdrop behave similarly to Navbar */}
      <style>{`
        /* make sure the container border uses the appropriate color in dark mode */
        .rounded-2xl.border {
          border-radius: 1rem;
          border-width: 1px;
          border-color: rgba(0,0,0,0.06);
        }
        .dark .rounded-2xl.border {
          border-color: rgba(255,255,255,0.04);
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
