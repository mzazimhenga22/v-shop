// types/product.ts

export interface Product {
  id?: number;
  name: string;
  price: number;
  image: string | null;
  rating: number;
  reviews?: number;
  sale?: string;
  hot?: boolean;
  new?: boolean;
  lowStock?: boolean;
  stock: number;
  description?: string;
  specifications?: string;
  shippingInfo?: string;
  returnInfo?: string;
  faqs?: string;
  variants?: string[];
  thumbnails?: string[];
  category?: string;
  title?: string;
  highlight?: string;
  created_at?: string;
  vendor?: Vendor; // Optional: Direct relation to a Vendor object
  vendor_id?: string | null; // Optional: if you store just the ID
  is_vendor?: boolean;
  [key: string]: any;
}

export interface CartItem {
   id?: number | string;
  name: string;
  price: number;
  image: string | null;
  quantity: number;
  vendor_id?: string;
  variant?: string;
}

export interface Vendor {
  id: string;
  name: string;
  logo?: string; // URL to vendor logo
  email?: string;
  phone?: string;
  address?: string;
  description?: string;
  rating?: number;
  totalProducts?: number;
  created_at?: string;
  updated_at?: string;
  vendor_name: string | null;
  [key: string]: any;

}


export interface VendorProfile {
  id: string;
  user_id: string;
  verified: boolean;
  rating: number | null;
  created_at: string;
  updated_at: string;
  user_created_at: string;
  banner_url: string | null;
  user_email: string | null;
  vendor_name: string | null;
  photo_url: string | null;
  [key: string]: any;
}
