import { useState } from "react";
import ThemeToggle from "./ThemeToggle"; // ✅ Import it
import { Mail, Facebook, Instagram, Twitter, CreditCard, Phone, MapPin } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      setStatus("loading");
      // placeholder: wire to your API or newsletter service
      await new Promise((res) => setTimeout(res, 700));
      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
    } finally {
      setTimeout(() => setStatus("idle"), 2000);
    }
  };

  return (
    <footer className="bg-transparent border-t border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 px-6 py-12 transition-colors">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 text-sm">
        {/* Branding */}
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-3">
            <img src="/images/logo.png" alt="Vshop Logo" className="h-8 w-auto object-contain" />
            <div>
              <h3 className="text-gray-800 dark:text-gray-100 font-bold text-lg leading-tight">Vshop</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Quality products for every lifestyle</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 max-w-[18rem]">Shop smarter with hand-picked collections, trusted vendors, and smooth checkout.</p>

          <div className="flex items-center gap-3 mt-2">
            <a href="#" aria-label="Call us" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 text-xs hover:text-gray-900">
              <Phone className="w-4 h-4" />
              <span>+254728131125</span>
            </a>

            <a href="#" aria-label="Our location" className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 text-xs hover:text-gray-900">
              <MapPin className="w-4 h-4" />
              <span>Find a store</span>
            </a>
          </div>
        </div>

        {/* Shop Links */}
        <div>
          <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Shop</h4>
          <ul className="space-y-2">
            <li><Link to="/new-arrivals" className="hover:underline hover:text-gray-900">New Arrivals</Link></li>
            <li><Link to="/best-sellers" className="hover:underline hover:text-gray-900">Best Sellers</Link></li>
            <li><Link to="/discounts" className="hover:underline hover:text-gray-900">Discounts</Link></li>
            <li><Link to="/collections" className="hover:underline hover:text-gray-900">Collections</Link></li>
          </ul>
        </div>

        {/* Company Links */}
        <div>
          <h4 className="font-semibold text-gray-800 dark:text-white mb-3">Company</h4>
          <ul className="space-y-2">
            <li><Link to="/about" className="hover:underline hover:text-gray-900">About Us</Link></li>
            <li><Link to="/contact" className="hover:underline hover:text-gray-900">Contact</Link></li>
            <li><Link to="/careers" className="hover:underline hover:text-gray-900">Careers</Link></li>
            <li><Link to="/help" className="hover:underline hover:text-gray-900">Help Center</Link></li>
          </ul>
        </div>

        {/* Follow + Newsletter + Theme toggle */}
        <div className="flex flex-col items-start gap-3">
          <h4 className="font-semibold text-gray-800 dark:text-white mb-1">Stay in the loop</h4>

          <p className="text-xs text-gray-500">Subscribe for new arrivals, special offers, and insider deals.</p>

          <form onSubmit={handleSubscribe} className="mt-2 w-full flex gap-2">
            <label htmlFor="footer-email" className="sr-only">Email address</label>
            <input
              id="footer-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition"
            >
              {status === "loading" ? "Saving..." : status === "success" ? "Done" : "Subscribe"}
            </button>
          </form>

          <div className="flex items-center gap-3 mt-3">
            <a href="#" aria-label="Facebook" className="p-2 rounded-md bg-white/10 hover:bg-white/20 transition">
              <Facebook className="w-4 h-4" />
            </a>
            <a href="#" aria-label="Instagram" className="p-2 rounded-md bg-white/10 hover:bg-white/20 transition">
              <Instagram className="w-4 h-4" />
            </a>
            <a href="#" aria-label="Twitter" className="p-2 rounded-md bg-white/10 hover:bg-white/20 transition">
              <Twitter className="w-4 h-4" />
            </a>

            {/* theme toggle (keeps behavior) */}
            <div className="ml-3">
              <ThemeToggle />
            </div>
          </div>

          {/* accepted payments + small legal */}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <CreditCard className="w-4 h-4" />
              <span>Secure checkout</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mt-10 border-t border-gray-100 dark:border-gray-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-500">
        <div>© {new Date().getFullYear()} Vshop. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:underline">Terms</Link>
          <Link to="/privacy" className="hover:underline">Privacy</Link>
          <Link to="/sitemap" className="hover:underline">Made by mzazimhenga</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
