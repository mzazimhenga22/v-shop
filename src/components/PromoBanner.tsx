// src/components/PromoBanner.tsx
import React, { useEffect, useRef, useState } from "react";
import { Flame, Sparkles, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import lottie from "lottie-web";
import clsx from "clsx";

/*
  NOTE:
  - Keep your existing slide rotation and pause-on-hover logic (unchanged).
  - Lottie animations are loaded per-slide into a small container.
  - Replace the JSON URLs below with whichever Lottie files you prefer.
*/

const slides = [
  {
    image: "/images/deals.jpg",
    text: "Mega Deals — Shop Now",
    icon: <Flame className="w-6 h-6 sm:w-8 sm:h-8 text-white" />,
    // example Lottie JSON for fire / deals (replace if desired)
    lottie: "https://assets10.lottiefiles.com/packages/lf20_jtbfg2nb.json",
  },
  {
    image: "/images/mega sale.jpg",
    text: "New Arrivals Just Landed!",
    icon: <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-white" />,
    lottie: "https://assets3.lottiefiles.com/packages/lf20_tutvdkg0.json",
  },
  {
    image: "/images/kitchen.jpg",
    text: "Limited-Time Offers – Hurry!",
    icon: <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-white" />,
    lottie: "https://assets2.lottiefiles.com/packages/lf20_q5pk6p1k.json",
  },
];

const PromoBanner: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  // refs for per-slide lottie containers (allow nulls)
  const lottieContainers = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (paused) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [paused]);

  // keyboard left / right navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + slides.length) % slides.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % slides.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // load Lottie animations into their containers (one per slide)
  useEffect(() => {
    // keep references to instances so we can destroy later
    const instances: any[] = [];

    slides.forEach((s, i) => {
      const container = lottieContainers.current[i];
      if (!container || !s.lottie) return;

      try {
        const anim = lottie.loadAnimation({
          container,
          renderer: "svg",
          loop: true,
          autoplay: true,
          path: s.lottie,
        });
        instances.push(anim);
      } catch (err) {
        // fail silently if lottie can't load
        console.warn("Lottie load error for slide", i, err);
      }
    });

    return () => {
      instances.forEach((ins) => ins?.destroy?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helper to set container ref (accepts null to clear)
  const setLottieRef = (el: HTMLDivElement | null, idx: number) => {
    lottieContainers.current[idx] = el;
  };

  return (
    <div
      className="relative w-full h-40 sm:h-56 rounded-2xl overflow-hidden shadow-2xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          className={clsx(
            "absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-700 ease-in-out",
            i === index ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
          )}
          style={{ backgroundImage: `url(${slide.image})` }}
          role="group"
          aria-roledescription="slide"
          aria-hidden={i === index ? "false" : "true"}
          aria-label={`${i + 1} of ${slides.length}: ${slide.text}`}
        >
          {/* overlay */}
          <div className="w-full h-full flex items-center justify-center bg-black/30 px-4">
            <div className="flex items-center gap-3 text-white drop-shadow">
              {/* left: Lottie animation (if available) */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 relative">
                {/* SVG Lottie container — use a callback that returns void (no `null`) */}
                <div
                  ref={(el) => setLottieRef(el, i)}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  aria-hidden
                />
                {/* fallback icon visually consistent */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {slide.icon}
                </div>
              </div>

              <h2 className="text-xl sm:text-3xl font-bold">{slide.text}</h2>
            </div>
          </div>
        </div>
      ))}

      {/* dots / controls */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={clsx(
              "w-3 h-3 rounded-full transition-transform",
              i === index ? "scale-125 bg-white/90" : "bg-white/40 hover:bg-white/60"
            )}
          />
        ))}
      </div>

      {/* previous / next for accessibility - use icons (not emojis) */}
      <button
        onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white z-20 hover:bg-black/40"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => setIndex((i) => (i + 1) % slides.length)}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white z-20 hover:bg-black/40"
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

export default PromoBanner;
