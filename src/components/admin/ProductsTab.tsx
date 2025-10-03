import { useState } from "react";
import ProductForm from "./ProductForm"; // Use default import as the module exports default
import ProductCard from "@/components/ProductCard";
import type { Product } from "@/types";

const ProductsTab = () => {
  const [products, setProducts] = useState<Product[]>([]);

  const addProduct = (newProduct: Product) => {
    setProducts((prev) => [newProduct, ...prev]);
    // TODO: also send to backend here
  };

  // cast to any to allow passing props when ProductForm's props are not typed
  const ProductFormAny = ProductForm as any;

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-bold mb-4">Add New Product</h2>
      <ProductFormAny onSubmit={addProduct} />

      {products.length > 0 && (
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {products.map((p, i) => (
            <ProductCard key={i} product={p} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductsTab;