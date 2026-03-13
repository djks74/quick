export interface Variation {
  id: number;
  name: string; // e.g. "S55", "N55", "B58"
  price: number;
}

export interface SubCategory {
  id: string;
  name: string;
  slug: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  subCategories: SubCategory[];
}

export interface ProductIngredient {
  id: number;
  productId: number;
  inventoryItemId: number;
  quantity: number;
  inventoryItem?: {
    id: number;
    name: string;
    unit: string;
    costPrice: number;
  };
}

export interface Product {
  id: number;
  name: string;
  price: number; // Base price or min price for variable products
  image: string;
  gallery?: string[]; // Array of image URLs
  rating: number;
  stock: number;
  barcode?: string;
  category: string; // Category slug
  subCategory?: string; // Sub-category slug
  type: "simple" | "variable";
  variations?: Variation[];
  ingredients?: ProductIngredient[];
}

export interface Widget {
  id: string;
  type: 'search' | 'recent_posts' | 'categories' | 'custom_html' | 'text' | 'image';
  title: string;
  settings: Record<string, any>;
}

export interface WidgetArea {
  id: string;
  name: string;
  description?: string;
  widgets: Widget[];
}
