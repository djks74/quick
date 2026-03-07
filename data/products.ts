import { Product, Category } from "@/lib/types";

export const categories: Category[] = [
  {
    id: "1",
    name: "Hardware & Licence",
    slug: "hardware-licence",
    subCategories: [
      { id: "1-1", name: "Flasher License", slug: "flasher-license" },
      { id: "1-2", name: "Hardware", slug: "hardware" },
    ]
  },
  {
    id: "2",
    name: "Custom Tunes",
    slug: "custom-tunes",
    subCategories: [
      { id: "2-1", name: "Performance Mapping", slug: "performance-mapping" },
      { id: "2-2", name: "Transmission Flash", slug: "transmission-flash" },
    ]
  },
  {
    id: "3",
    name: "Maintenance",
    slug: "maintenance",
    subCategories: [
      { id: "3-1", name: "Oil & Fluids", slug: "oil-fluids" },
      { id: "3-2", name: "Brake Parts", slug: "brake-parts" },
    ]
  }
];

export const products: Product[] = [
  {
    id: 1,
    name: "MHD FLASHER LICENCE",
    price: 617,
    image: "https://autoparts.mythoz.com/wp-content/uploads/2025/12/mhd.jpeg", 
    gallery: [
      "https://autoparts.mythoz.com/wp-content/uploads/2025/12/mhd.jpeg",
    ],
    rating: 0,
    category: "hardware-licence",
    subCategory: "flasher-license",
    type: "variable",
    variations: [
      { id: 101, name: "S55", price: 617 },
      { id: 102, name: "N55", price: 617 },
      { id: 103, name: "B58", price: 617 },
      { id: 104, name: "S58", price: 617 },
      { id: 105, name: "S63TU", price: 910 },
    ]
  },
  {
    id: 2,
    name: "CUSTOM TUNING BMW",
    price: 200,
    image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?q=80&w=1000&auto=format&fit=crop",
    gallery: [],
    rating: 5,
    category: "custom-tunes",
    subCategory: "performance-mapping",
    type: "variable",
    variations: [
      { id: 201, name: "B48 / B46", price: 200 },
      { id: 202, name: "B58 Gen 1", price: 200 },
      { id: 203, name: "B58 Gen 2", price: 200 },
      { id: 204, name: "S58 CustomROM", price: 200 },
    ]
  }
];
