import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

type Category = {
  name: string;
  imageUrl: string;
};

// Shuffle helper
const shuffleArray = <T,>(array: T[]): T[] => {
  return array
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
};

const CategoryCarousel = () => {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch("/api/categories");
        const data = await res.json();

        if (Array.isArray(data)) {
          const shuffled = shuffleArray(data).slice(0, 5); // 🌀 Shuffle & take only 5
          setCategories(shuffled);
        } else {
          console.error("Unexpected response:", data);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    };

    fetchCategories();
  }, []);

  return (
    <section className="w-full py-6 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-gray-800 dark:text-white">
          Shop by Category
        </h2>
        <div className="grid grid-cols-3 sm:flex sm:justify-between gap-4">
          {categories.map((category, i) => (
            <Link
              key={i}
              to={`/category?name=${encodeURIComponent(category.name)}`}
              className="flex flex-col items-center flex-1"
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gray-100 dark:bg-gray-800 shadow-md flex items-center justify-center overflow-hidden hover:scale-105 transition-transform">
                <img
                  src={category.imageUrl}
                  alt={category.name}
                  className="w-full h-full object-cover rounded-full"
                />
              </div>
              <span className="mt-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CategoryCarousel;
