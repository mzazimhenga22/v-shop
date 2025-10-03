import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

type Promotion = {
  image: string;
  label?: string; // optional overlay like "50% OFF"
};

const promotions: Promotion[] = [
  { image: "/images/mega sale.jpg", label: "50% OFF" },
  { image: "/images/coming soon.jpg", label: "Coming Soon" },
  { image: "/images/toys.jpg", label: "Hot Deals" },
  { image: "/images/deals.jpg", label: "Limited Time" },
  { image: "/images/mega sale.jpg", label: "Flash Sale" },
];

// 👇 Tailwind-compatible scrollbar hiding
const styles = `
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none; /* IE and Edge */
    scrollbar-width: none; /* Firefox */
  }
`;

const Promotions = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-scroll every 4s
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      scroll("right");
    }, 4000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.offsetWidth;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });

      // Update active index
      setActiveIndex((prev) =>
        direction === "left"
          ? (prev - 1 + promotions.length) % promotions.length
          : (prev + 1) % promotions.length
      );
    }
  };

  return (
    <section
      className="w-full py-8 px-4 sm:px-6"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="Promotions carousel"
    >
      {/* Inject scrollbar hiding styles */}
      <style>{styles}</style>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-white">Promotions</h2>

          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => scroll("left")}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/60 dark:bg-gray-800/60 border border-white/10 shadow-sm hover:scale-105 transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Previous promotions"
            >
              <ChevronLeft className="w-4 h-4 text-gray-800 dark:text-white" />
            </button>
            <button
              onClick={() => scroll("right")}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-white/60 dark:bg-gray-800/60 border border-white/10 shadow-sm hover:scale-105 transition focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Next promotions"
            >
              <ChevronRight className="w-4 h-4 text-gray-800 dark:text-white" />
            </button>
          </div>
        </div>

        {/* Promotions List */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-2 snap-x snap-mandatory touch-pan-x"
        >
          {promotions.map((promo, i) => (
            <Link
              key={i}
              to="/deals"
              className="relative min-w-[240px] sm:min-w-[320px] h-[200px] sm:h-[300px] rounded-xl overflow-hidden flex-shrink-0 snap-center group"
              aria-label={`Promotion ${i + 1}`}
              title={promo.label ?? "Promotion"}
            >
              {/* subtle glassy backdrop for image */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/25 opacity-70 pointer-events-none" />

              {/* Image */}
              <img
                src={promo.image}
                alt={`Promotion ${i + 1}`}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-600 group-hover:scale-105 transform"
                style={{ willChange: "transform, opacity" }}
              />

              {/* soft overlay with label and CTA */}
              <div className="absolute left-4 bottom-4 right-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {promo.label && (
                    <div className="px-3 py-1 rounded-full bg-black/40 backdrop-blur-sm text-xs text-white font-medium shadow-md border border-white/5">
                      {promo.label}
                    </div>
                  )}

                  <div className="hidden md:block text-sm text-gray-100/90">Explore curated deals</div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to="/deals" className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white text-xs font-medium border border-white/10 hover:bg-white/20 transition">
                    View
                  </Link>
                </div>
              </div>

              {/* subtle vignette */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/12 to-transparent opacity-40" />
            </Link>
          ))}
        </div>

        {/* Navigation Dots */}
        <div className="flex justify-center gap-2 mt-4">
          {promotions.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveIndex(i)}
              className={`w-3 h-3 rounded-full transition-transform transform ${
                activeIndex === i
                  ? "scale-110 bg-gray-800 dark:bg-white"
                  : "bg-gray-300 dark:bg-gray-600"
              }`}
              aria-label={`Go to promotion ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Promotions;
