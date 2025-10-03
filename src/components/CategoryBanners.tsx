// src/components/CategoryBanners.tsx
import { BadgePercent, PlusCircle, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import React from "react";

const categories = [
  {
    label: "Best Sellers",
    icon: <BadgePercent className="w-6 h-6" />,
    route: "/best-sellers",
    // subtle color token for the icon bg
    color: "from-red-200 to-red-400 text-red-700",
  },
  {
    label: "New Arrivals",
    icon: <PlusCircle className="w-6 h-6" />,
    route: "/new-arrivals",
    color: "from-emerald-200 to-emerald-400 text-emerald-700",
  },
  {
    label: "Trending",
    icon: <Flame className="w-6 h-6" />,
    route: "/trending",
    color: "from-orange-200 to-orange-400 text-orange-700",
  },
];

/* local glass card atom so styling matches ProductPage / Banner */
const GlassCard: React.FC<React.PropsWithChildren<{ className?: string }>> = ({ children, className }) => (
  <div
    className={clsx(
      "bg-white/5 dark:bg-black/30 backdrop-blur-md border border-white/6 dark:border-white/6 rounded-2xl",
      className
    )}
  >
    {children}
  </div>
);

const CategoryBanners: React.FC = () => {
  return (
    <section className="px-4 md:px-10 py-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 md:gap-6 justify-between w-full">
          {categories.map((category) => (
            <Link
              key={category.label}
              to={category.route}
              aria-label={`Browse ${category.label}`}
              className="relative w-full h-28 rounded-xl focus:outline-none focus:ring-4 focus:ring-green-300/20"
            >
              {/* glass background + subtle gradient overlay */}
              <GlassCard className="absolute inset-0 rounded-xl overflow-hidden">
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                    backdropFilter: "blur(6px)",
                  }}
                  className="w-full h-full"
                />
              </GlassCard>

              <div
                className={clsx(
                  "relative z-10 flex items-center justify-center md:justify-start gap-4",
                  "transition-transform duration-300 ease-in-out transform-gpu hover:scale-105 motion-safe:will-change-transform",
                  "rounded-xl p-6 w-full h-full shadow-md hover:shadow-2xl",
                  "border border-[rgba(255,255,255,0.06)]",
                  // keep any existing animation you had
                  "animate-ai-pulse"
                )}
              >
                {/* icon container */}
                <div
                  className={clsx(
                    "flex items-center justify-center w-12 h-12 rounded-lg shrink-0",
                    // gradient + subtle opacity so icon color pops like the Banner
                    `bg-gradient-to-br ${category.color} bg-opacity-30 backdrop-blur-sm border border-white/8`
                  )}
                  aria-hidden
                >
                  <div className="text-current">{category.icon}</div>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                    {category.label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-300">
                    Explore curated picks
                  </p>
                </div>

                {/* subtle chevron / action hint for larger screens */}
                <div className="hidden md:flex items-center text-sm text-gray-400">
                  <span aria-hidden>→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryBanners;
