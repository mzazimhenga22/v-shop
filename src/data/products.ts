// src/data/products.ts

export type Product = {
    name: string;
    price: number;
    rating: number;
    image: string;
    category: string;
    hot?: boolean;
    new?: boolean;
    sale?: string;
    lowStock?: boolean;
    description: string;
    images: string[];
    reviews?: number;
  };
  
  export const allProducts: Product[] = [
    {
      name: "Woman-Dress",
      price: 45,
      rating: 4,
      image: "/images/dress.jpg",
      category: "Fashion",
      hot: true,
      description: "Elegant and comfortable woman’s dress for casual and formal events.",
      images: ["/images/dress.jpg", "/images/dress-side.jpg", "/images/dress-back.jpg"],
    },
    {
      name: "Electric Juicer",
      price: 99.99,
      rating: 5,
      reviews: 100,
      image: "/images/juicer.jpg",
      category: "Kitchen",
      new: true,
      description: "High-powered electric juicer with multiple speed settings.",
      images: ["/images/juicer.jpg", "/images/juicer-closeup.jpg"],
    },
    {
      name: "Wooden Chair",
      price: 119,
      rating: 5,
      reviews: 210,
      image: "/images/chair.jpg",
      category: "Furniture",
      lowStock: true,
      description: "Minimalist wooden chair crafted from premium oak.",
      images: ["/images/chair.jpg", "/images/chair-side.jpg", "/images/chair-top.jpg"],
    },
    {
      name: "White Headphones",
      price: 199,
      rating: 5,
      reviews: 90,
      category: "Electronics",
      sale: "30% OFF",
      image: "/images/headphones.jpg",
      description: "Wireless over-ear headphones with noise cancellation and rich sound.",
      images: ["/images/headphones.jpg", "/images/headphones-side.jpg", "/images/headphones-box.jpg"],
    },
    {
      name: "Organic Honey",
      price: 25,
      rating: 4,
      image: "/images/honey.jpg",
      category: "Food",
      new: true,
      description: "Pure organic honey straight from the hive.",
      images: ["/images/honey.jpg"],
    },
    {
      name: "Face Moisturizer",
      price: 35,
      rating: 4,
      image: "/images/beauty.jpg",
      category: "Beauty",
      hot: true,
      description: "Hydrating face cream with natural ingredients.",
      images: ["/images/beauty.jpg"],
    },
    {
      name: "Kids Puzzle Toy",
      price: 15,
      rating: 5,
      image: "/images/toys.jpg",
      category: "Toys",
      description: "Colorful educational puzzle toy for toddlers.",
      images: ["/images/toys.jpg"],
    },
  ];
  