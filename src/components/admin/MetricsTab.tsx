import { useEffect, useState } from "react";
import axios from "axios";
import { BarChart3, User, ShoppingCart, Clock3, DollarSign, TrendingUp, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient"; // import supabase client

// Types
interface UserType {
  id: string;
  created_at?: string;
}

interface Order {
  id: string;
  status: string;
  total_amount: number;
  created_at?: string;
}

// Create axios instance with token interceptor
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

const MetricsTab = () => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const [userRes, orderRes] = await Promise.all([
          api.get("/admin/users"),
          api.get("/orders"),
        ]);
        setUsers(userRes.data.users || []);
        setOrders(orderRes.data.orders || []);
      } catch (err: any) {
        setError(err?.response?.data?.error || err?.message || "Failed to load metrics.");
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  const activeUsers = users.filter(
    (u) => u.created_at && new Date(u.created_at) > sevenDaysAgo
  ).length;

  const bounceRate = "42%";
  const conversionRate = "5.2%";

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-pulse">
        {Array(8).fill(0).map((_, i) => (
          <div key={i} className="h-24 bg-gray-200/30 dark:bg-gray-700/30 rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) return <p className="text-center text-red-500">{error}</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <MetricCard label="Total Users" value={users.length} icon={<User className="text-blue-500" />} />
      <MetricCard label="Active Users (7d)" value={activeUsers} icon={<Zap className="text-green-500" />} />
      <MetricCard label="Total Orders" value={orders.length} icon={<ShoppingCart className="text-purple-500" />} />
      <MetricCard label="Pending Orders" value={pendingOrders} icon={<Clock3 className="text-orange-500" />} />
      <MetricCard label="Total Revenue" value={`$${totalRevenue.toFixed(2)}`} icon={<DollarSign className="text-emerald-500" />} />
      <MetricCard label="Avg. Order Value" value={`$${avgOrderValue.toFixed(2)}`} icon={<TrendingUp className="text-pink-500" />} />
      <MetricCard label="Bounce Rate" value={bounceRate} icon={<BarChart3 className="text-rose-500" />} />
      <MetricCard label="Conversion Rate" value={conversionRate} icon={<TrendingUp className="text-lime-500" />} />
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) => (
  <div className="relative bg-[#d3d2d2] dark:bg-gray-900/60 backdrop-blur-md border border-gray-200 dark:border-gray-700 shadow-md rounded-2xl p-6 hover:shadow-lg transition-shadow duration-300 group">
    <div className="absolute -top-4 -right-4 bg-[#d3d2d2] dark:bg-gray-800 rounded-full p-2 shadow-sm">
      {icon}
    </div>
    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
    <p className="text-3xl font-bold text-gray-900 dark:text-white group-hover:scale-105 transition-transform duration-200">{value}</p>
  </div>
);

export default MetricsTab;
