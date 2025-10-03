import { createContext, useContext, useState } from "react";

const initialCategories = [
  "Featured Products", "Latest", "Best Sellers", "New Arrivals", "Trending", "On Sale",
  "Top Rated", "Most Popular", "Limited Edition", "Seasonal", "Clearance", "Gift Ideas",
  "Eco-Friendly", "Luxury", "Budget Friendly", "Staff Picks", "Customer Favorites",
  "Kitchen Wares", "Food", "Electronics", "Clothing", "Footwear", "Accessories",
  "Home Decor", "Furniture", "Beauty", "Health & Wellness", "Sports & Outdoors",
  "Toys & Games", "Books", "Stationery", "Jewelry", "Pet Supplies", "Automotive",
  "Garden & Outdoor", "Baby Products", "Tech Gadgets", "Fitness Equipment", "Travel Gear",
  "Craft Supplies", "Party Supplies"
];

type CategoryContextType = {
  categories: string[];
  addCategory: (category: string) => void;
};

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

export const CategoryProvider = ({ children }: { children: React.ReactNode }) => {
  const [categories, setCategories] = useState<string[]>(initialCategories);

  const addCategory = (newCategory: string) => {
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories((prev) => [...prev, trimmed]);
    }
  };

  return (
    <CategoryContext.Provider value={{ categories, addCategory }}>
      {children}
    </CategoryContext.Provider>
  );
};

export const useCategories = () => {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategories must be used within a CategoryProvider");
  }
  return context;
};