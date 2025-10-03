import React, { useState } from "react";
import { Check } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Thompson",
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    role: "Verified Buyer",
    review:
      "Vshop makes online shopping effortless and fun! Fast delivery and great support.",
    rating: 5,
  },
  {
    name: "James Ochieng",
    avatar: "https://randomuser.me/api/portraits/men/65.jpg",
    role: "Electronics Enthusiast",
    review:
      "The quality of products is excellent. I love how clean and professional the site feels.",
    rating: 4,
  },
  {
    name: "Amina Yusuf",
    avatar: "https://randomuser.me/api/portraits/women/68.jpg",
    role: "Fashion Blogger",
    review:
      "Love the new arrivals section. I always find something trendy and affordable!",
    rating: 5,
  },
];

const Star: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg viewBox="0 0 20 20" className={`w-4 h-4 ${className}`} aria-hidden>
    <path
      d="M10 15l-5.878 3.09 1.122-6.545L.488 6.91l6.561-.954L10 0l2.951 5.956 6.561.954-4.756 4.635 1.122 6.545z"
      fill="currentColor"
    />
  </svg>
);

const CustomerTestimonials: React.FC = () => {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const toggleExpanded = (idx: number) =>
    setExpanded((s) => ({ ...s, [idx]: !s[idx] }));

  return (
    <section
      className="px-6 py-12"
      aria-labelledby="testimonials-heading"
      role="region"
    >
      <h2
        id="testimonials-heading"
        className="text-2xl md:text-3xl font-semibold text-gray-800 dark:text-gray-100 mb-10 text-center"
      >
        What Our Customers Say
      </h2>

      <div className="max-w-7xl mx-auto">
        {/* Desktop Grid */}
        <div className="hidden md:grid grid-cols-3 gap-6">
          {testimonials.map((t, idx) => {
            const isExpanded = !!expanded[idx];
            const short =
              t.review.length > 140 ? t.review.slice(0, 140) + "…" : t.review;
            return (
              <article
                key={idx}
                className="relative p-6 rounded-2xl border border-[rgba(255,255,255,0.06)] 
                           bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] 
                           backdrop-blur-md shadow-lg hover:shadow-2xl 
                           transition-transform transform hover:-translate-y-1"
                aria-label={`Testimonial from ${t.name}`}
              >
                {/* faint quote mark */}
                <div
                  aria-hidden
                  className="absolute right-4 top-3 text-[120px] leading-none 
                             text-gray-200 dark:text-gray-700 opacity-20 -z-10 select-none"
                >
                  “
                </div>

                <div className="flex items-center gap-4 mb-3">
                  <div className="relative">
                    <div className="rounded-full p-[2px] bg-gradient-to-br from-emerald-400/50 to-green-600/35">
                      <div className="rounded-full bg-black/40 p-[2px]">
                        <img
                          src={t.avatar}
                          alt={t.name}
                          className="w-12 h-12 rounded-full object-cover block"
                        />
                      </div>
                    </div>

                    {/* verified badge */}
                    {t.role?.toLowerCase().includes("verified") && (
                      <span
                        className="absolute -right-1 -bottom-1 bg-black/70 rounded-full p-0.5 shadow-sm"
                        title="Verified buyer"
                      >
                        <Check className="w-3 h-3 text-emerald-400" />
                      </span>
                    )}
                  </div>

                  <div className="text-left min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100 leading-snug">
                      {t.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t.role}
                    </div>
                  </div>
                </div>

                <p className="text-gray-700 dark:text-gray-200 italic mb-3">
                  “{isExpanded ? t.review : short}”
                </p>

                {t.review.length > 140 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(idx);
                    }}
                    className="text-xs text-emerald-400 hover:underline focus:outline-none"
                    aria-expanded={isExpanded}
                    aria-controls={`testimonial-${idx}`}
                  >
                    {isExpanded ? "Show less" : "Read more"}
                  </button>
                )}

                <div className="mt-4 flex items-center gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`${
                        i < t.rating
                          ? "text-amber-400"
                          : "text-gray-400 dark:text-gray-600"
                      }`}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>

        {/* Mobile: swipeable cards */}
        <div className="md:hidden -mx-4 px-4 overflow-x-auto no-scrollbar snap-x snap-mandatory flex gap-4">
          {testimonials.map((t, idx) => (
            <article
              key={idx}
              className="snap-center min-w-[80%] sm:min-w-[72%] p-5 rounded-2xl 
                         border border-[rgba(255,255,255,0.06)] 
                         bg-[linear-gradient(135deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] 
                         backdrop-blur-md shadow-lg hover:shadow-2xl transition-transform hover:-translate-y-1"
              aria-label={`Testimonial from ${t.name}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <img
                  src={t.avatar}
                  alt={t.name}
                  className="w-10 h-10 rounded-full object-cover border-2 border-emerald-400"
                />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {t.name}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t.role}
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-700 dark:text-gray-200 italic mb-3">
                “{t.review}”
              </p>

              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`${
                      i < t.rating
                        ? "text-amber-400"
                        : "text-gray-400 dark:text-gray-600"
                    }`}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CustomerTestimonials;
