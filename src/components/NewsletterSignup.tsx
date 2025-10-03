import React, { useState } from "react";

const NewsletterSignup: React.FC = () => {
  const [email, setEmail] = useState("");

  return (
    <section className="px-4 md:px-10 py-10">
      <div className="relative w-full max-w-2xl mx-auto rounded-xl">
        {/* background glass layer with subtle gradient */}
        <div
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
            backdropFilter: "blur(6px)",
          }}
        />

        <div
          className="relative z-10 flex flex-col items-center justify-center gap-6
                     transition-transform duration-300 ease-in-out transform-gpu
                     hover:scale-[1.02] active:scale-100 motion-safe:will-change-transform
                     rounded-xl p-8 w-full
                     shadow-lg hover:shadow-2xl
                     border border-[rgba(255,255,255,0.06)]"
        >
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-800 dark:text-white text-center">
            Join Our Newsletter
          </h2>
          <p className="text-gray-600 dark:text-gray-300 text-center max-w-md">
            Get exclusive deals, updates, and early access to new arrivals.
          </p>

          <form className="flex flex-col md:flex-row justify-center gap-4 w-full max-w-lg">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-4 py-2 w-full md:flex-1 rounded-full border border-gray-300 dark:border-gray-700 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="submit"
              className="bg-gradient-to-br from-emerald-400 to-green-600 text-white px-6 py-2 rounded-full hover:opacity-90 transition duration-300"
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default NewsletterSignup;
