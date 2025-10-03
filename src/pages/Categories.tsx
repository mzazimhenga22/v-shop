import { useState } from "react";
import { useCategories } from "@/context/CategoryContext";
import { Search } from "lucide-react";

export const CategoryPage = () => {
  const { categories, addCategory } = useCategories();
  const [newCategory, setNewCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showAllGeneral, setShowAllGeneral] = useState(false);
  const [showAllShopBy, setShowAllShopBy] = useState(false);

  const generalCategories = categories.filter(
    (cat) =>
      ![
        "Kitchen Wares",
        "Food",
        "Electronics",
        "Clothing",
        "Footwear",
        "Accessories",
        "Home Decor",
        "Furniture",
        "Beauty",
        "Health & Wellness",
        "Sports & Outdoors",
        "Toys & Games",
        "Books",
        "Stationery",
        "Jewelry",
        "Pet Supplies",
        "Automotive",
        "Garden & Outdoor",
        "Baby Products",
        "Tech Gadgets",
        "Fitness Equipment",
        "Travel Gear",
        "Craft Supplies",
        "Party Supplies",
      ].includes(cat)
  );
  const shopByCategories = categories.filter((cat) =>
    [
      "Kitchen Wares",
      "Food",
      "Electronics",
      "Clothing",
      "Footwear",
      "Accessories",
      "Home Decor",
      "Furniture",
      "Beauty",
      "Health & Wellness",
      "Sports & Outdoors",
      "Toys & Games",
      "Books",
      "Stationery",
      "Jewelry",
      "Pet Supplies",
      "Automotive",
      "Garden & Outdoor",
      "Baby Products",
      "Tech Gadgets",
      "Fitness Equipment",
      "Travel Gear",
      "Craft Supplies",
      "Party Supplies",
    ].includes(cat)
  );

  const filteredGeneralCategories = generalCategories.filter((cat) =>
    cat.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const filteredShopByCategories = shopByCategories.filter((cat) =>
    cat.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const displayedGeneralCategories = showAllGeneral
    ? filteredGeneralCategories
    : filteredGeneralCategories.slice(0, 5);
  const displayedShopByCategories = showAllShopBy
    ? filteredShopByCategories
    : filteredShopByCategories.slice(0, 5);

  const handleAddCategory = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newCategory.trim()) {
      addCategory(newCategory);
      setNewCategory("");
      setSearchTerm("");
    }
  };

  return (
    <div className="p-6 bg-gray-100 dark:bg-gray-800 rounded-xl shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-700 dark:text-gray-300">Categories</h2>

      <div className="relative mb-6">
        <input
          type="text"
          placeholder="Search categories"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 pr-10 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-black dark:text-white"
        />
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">General Categories</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-60 overflow-y-auto">
          {displayedGeneralCategories.map((cat) => (
            <div
              key={cat}
              className="p-3 bg-white dark:bg-gray-700 rounded-md text-center hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            >
              {cat}
            </div>
          ))}
        </div>
        {filteredGeneralCategories.length > 5 && (
          <button
            onClick={() => setShowAllGeneral(!showAllGeneral)}
            className="w-full mt-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAllGeneral ? "Show Less" : `Show All (${filteredGeneralCategories.length})`}
          </button>
        )}
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4 text-gray-700 dark:text-gray-300">Shop by Categories</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-60 overflow-y-auto">
          {displayedShopByCategories.map((cat) => (
            <div
              key={cat}
              className="p-3 bg-white dark:bg-gray-700 rounded-md text-center hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
            >
              {cat}
            </div>
          ))}
        </div>
        {filteredShopByCategories.length > 5 && (
          <button
            onClick={() => setShowAllShopBy(!showAllShopBy)}
            className="w-full mt-2 text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAllShopBy ? "Show Less" : `Show All (${filteredShopByCategories.length})`}
          </button>
        )}
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-700 dark:text-gray-300">Add New Category</h3>
        <input
          type="text"
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          onKeyDown={handleAddCategory}
          placeholder="Enter new category"
          className="w-full p-2 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-black dark:text-white"
        />
      </div>
    </div>
  );
};