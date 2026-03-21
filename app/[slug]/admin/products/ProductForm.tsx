"use client";

import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Image from "next/image";
import { X, Plus, Trash2, Image as ImageIcon, Upload, Layers } from "lucide-react";
import { useEffect, useState } from "react";
import { Product, Variation, Category } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

const variationSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, "Variation name required"),
  price: z.number().min(0, "Price must be positive"),
});

const ingredientSchema = z.object({
  inventoryItemId: z.number().min(0),
  quantity: z.number().min(0, "Quantity must be positive"),
  quantityUnit: z.enum(["gram", "kg", "pcs"]),
  baseUnit: z.enum(["gram", "kg", "pcs"]),
  conversionFactor: z.number().min(0.000001, "Conversion factor must be positive"),
});

const productSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(3, "Name must be at least 3 characters"),
  price: z.number().min(0, "Price must be positive"),
  image: z.string().min(1, "Main image URL required"),
  gallery: z.array(z.string()),
  category: z.string().min(1, "Please select a category"),
  subCategory: z.string().optional(),
  type: z.enum(["simple", "variable"]),
  rating: z.number().min(0).max(5).optional(),
  stock: z.number().min(0).optional(),
  barcode: z.string().optional(),
  variations: z.array(variationSchema).optional(),
  ingredients: z.array(ingredientSchema).optional(),
});

type ProductFormData = z.infer<typeof productSchema>;

type IngredientUOM = "gram" | "kg" | "pcs";

const normalizeUOM = (value?: string): IngredientUOM => {
  const v = (value || "").toLowerCase();
  if (v === "gram" || v === "gr" || v === "g") return "gram";
  if (v === "kg" || v === "kilogram") return "kg";
  return "pcs";
};

const safeNumber = (value: any, fallback = 0) => {
  const num = typeof value === "number" ? value : parseFloat((value ?? "").toString().replace(",", "."));
  if (!Number.isFinite(num)) return fallback;
  return num;
};

const round = (value: number, digits = 6) => Number(value.toFixed(digits));

const toGrams = (quantity: number, unit: IngredientUOM, gramsPerPcs: number) => {
  if (unit === "gram") return quantity;
  if (unit === "kg") return quantity * 1000;
  return quantity * gramsPerPcs;
};

const gramsToUnit = (grams: number, unit: IngredientUOM, gramsPerPcs: number) => {
  if (unit === "gram") return grams;
  if (unit === "kg") return grams / 1000;
  return grams / gramsPerPcs;
};

const toBaseQuantity = (quantity: number, quantityUnit: IngredientUOM, baseUnit: IngredientUOM, conversionFactor: number) => {
  const gramsPerPcs = Math.max(0.000001, safeNumber(conversionFactor, 1));
  const grams = toGrams(safeNumber(quantity, 0), quantityUnit, gramsPerPcs);
  return round(gramsToUnit(grams, baseUnit, gramsPerPcs));
};

interface ProductFormProps {
  product?: Product | null;
  categories: Category[];
  inventoryItems?: any[];
  onClose: () => void;
  onSave: (product: any) => void;
}

export default function ProductForm({ product, categories, inventoryItems = [], onClose, onSave }: ProductFormProps) {
  const [galleryInput, setGalleryInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const normalizeImage = (src?: string | null) => {
    if (!src) return "/placeholder-product.svg";
    if (src === "/placeholder-product.jpg") return "/placeholder-product.svg";
    return src;
  };
  
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name || "",
      price: product?.price || 0,
      image: normalizeImage(product?.image),
      gallery: product?.gallery || [],
      category: product?.category || categories[0]?.slug || "",
      subCategory: product?.subCategory || "",
      type: (product?.type as "simple" | "variable") || "simple",
      rating: product?.rating || 0,
      stock: product?.stock || 0,
      barcode: product?.barcode || "",
      variations: product?.variations || [],
      ingredients: product?.ingredients?.map(i => ({
        inventoryItemId: i.inventoryItemId,
        quantity: i.quantity,
        quantityUnit: i.quantityUnit || i.baseUnit || normalizeUOM(i.inventoryItem?.unit),
        baseUnit: i.baseUnit || normalizeUOM(i.inventoryItem?.unit),
        conversionFactor: safeNumber(i.conversionFactor, 1)
      })) || [],
    },
  });

  const { fields: variationFields, append: appendVariation, remove: removeVariation } = useFieldArray({
    control,
    name: "variations",
  });

  const { fields: ingredientFields, append: appendIngredient, remove: removeIngredient } = useFieldArray({
    control,
    name: "ingredients",
  });

  const gallery = watch("gallery") || [];
  const mainImage = watch("image");
  const watchIngredients = watch("ingredients") || [];

  // Calculate COGS (Cost of Goods Sold)
  const cogs = watchIngredients.reduce((total, field) => {
    const item = inventoryItems.find(i => i.id === Number(field.inventoryItemId));
    if (item) {
      const baseUnit = normalizeUOM(field.baseUnit || item.unit);
      const quantityUnit = normalizeUOM(field.quantityUnit || baseUnit);
      const baseQuantity = toBaseQuantity(field.quantity || 0, quantityUnit, baseUnit, field.conversionFactor || 1);
      return round(total + (safeNumber(item.costPrice, 0) * baseQuantity));
    }
    return total;
  }, 0);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'main' | 'gallery') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    const fileArray = Array.from(files);
    let processedCount = 0;

    fileArray.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (type === 'main') {
          setValue("image", result);
        } else {
          const currentGallery = watch("gallery") || [];
          if (!currentGallery.includes(result)) {
            setValue("gallery", [...currentGallery, result]);
          }
        }
        
        processedCount++;
        if (processedCount === fileArray.length) {
          setIsUploading(false);
        }
      };
      reader.onerror = () => {
        processedCount++;
        if (processedCount === fileArray.length) {
          setIsUploading(false);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const addGalleryImage = () => {
    if (galleryInput && !gallery.includes(galleryInput)) {
      setValue("gallery", [...gallery, galleryInput]);
      setGalleryInput("");
    }
  };

  const removeGalleryImage = (url: string) => {
    setValue("gallery", gallery.filter(item => item !== url));
  };

  const selectedCategorySlug = watch("category");
  const productType = watch("type");
  const selectedCategory = categories.find(c => c.slug === selectedCategorySlug);

  const onSubmit = async (data: ProductFormData) => {
    setSubmitError(null);
    // For variable products, the base price is the minimum variation price
    let finalData = { ...data };
    if (data.type === "variable" && data.variations && data.variations.length > 0) {
      const minPrice = Math.min(...data.variations.map(v => v.price));
      finalData.price = minPrice;
    }

    if (finalData.ingredients && finalData.ingredients.length > 0) {
      const merged = finalData.ingredients
        .filter(i => i.inventoryItemId > 0)
        .map((i) => {
          const item = inventoryItems.find((x) => x.id === Number(i.inventoryItemId));
          const baseUnit = normalizeUOM(i.baseUnit || item?.unit);
          const quantityUnit = normalizeUOM(i.quantityUnit || baseUnit);
          return {
            ...i,
            quantity: safeNumber(i.quantity, 0),
            quantityUnit,
            baseUnit,
            conversionFactor: Math.max(0.000001, safeNumber(i.conversionFactor, 1))
          };
        })
        .reduce((acc, i) => {
          const key = `${i.inventoryItemId}-${i.quantityUnit}-${i.baseUnit}-${safeNumber(i.conversionFactor, 1)}`;
          const existing = acc.find(x => `${x.inventoryItemId}-${x.quantityUnit}-${x.baseUnit}-${safeNumber(x.conversionFactor, 1)}` === key);
          if (existing) {
            existing.quantity = (existing.quantity || 0) + (i.quantity || 0);
          } else {
            acc.push({ ...i });
          }
          return acc;
        }, [] as { inventoryItemId: number; quantity: number; quantityUnit: IngredientUOM; baseUnit: IngredientUOM; conversionFactor: number }[])
        .filter(i => (i.quantity || 0) > 0);

      finalData.ingredients = merged;
    }

    try {
      await Promise.resolve(onSave({ ...finalData, id: product?.id }));
    } catch (e) {
      setSubmitError("Failed to save product");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#1A1D21] rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-100 dark:border-gray-800">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {product ? "Edit Product" : "Add New Product"}
          </h2>
          <button 
            onClick={onClose}
            className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit, () => setSubmitError("Please fix the highlighted fields"))} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {submitError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-xs font-bold uppercase tracking-wider">
              {submitError}
            </div>
          )}
          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Product Name</label>
              <input 
                {...register("name")}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
                placeholder="e.g. MHD FLASHER LICENCE"
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Category</label>
              <select 
                {...register("category")}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
              >
                {categories.map(cat => (
                  <option key={cat.slug} value={cat.slug}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Sub Category</label>
              <select 
                {...register("subCategory")}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
              >
                <option value="">None</option>
                {selectedCategory?.subCategories.map(sub => (
                  <option key={sub.slug} value={sub.slug}>{sub.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Product Type</label>
              <select 
                {...register("type")}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
              >
                <option value="simple">Simple Product</option>
                <option value="variable">Variable Product</option>
              </select>
            </div>

            {productType === "simple" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Price (IDR)</label>
                  <input 
                    type="number"
                    step="100"
                    {...register("price", { valueAsNumber: true })}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
                    placeholder="0"
                  />
                  {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Stock</label>
                  <input 
                    type="number"
                    {...register("stock", { valueAsNumber: true })}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
                    placeholder="0"
                  />
                  {errors.stock && <p className="text-red-500 text-xs mt-1">{errors.stock.message}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Barcode / SKU</label>
                  <input 
                    type="text"
                    {...register("barcode")}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white"
                    placeholder="e.g. 123456789"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Images Section */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Product Images</h3>
            
            <div className="space-y-6">
              {/* Main Image */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Main Product Image</label>
                <div className="flex gap-4 items-start">
                  <div className="w-32 h-32 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center overflow-hidden flex-shrink-0 relative group">
                    {mainImage ? (
                      <Image 
                        src={mainImage} 
                        alt="Product Preview" 
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
                    )}
                    <label className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center cursor-pointer text-xs font-bold uppercase tracking-widest">
                      Change
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'main')} />
                    </label>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Upload from Drive</label>
                      <button 
                        type="button"
                        onClick={() => document.getElementById('main-upload')?.click()}
                        className="w-full bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-lg text-xs font-bold transition-all border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 uppercase tracking-widest"
                      >
                        <Upload className="w-4 h-4" />
                        Choose File
                      </button>
                      <input id="main-upload" type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'main')} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Or Image URL</label>
                      <input 
                        {...register("image")}
                        className="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm dark:text-white"
                        placeholder="https://..."
                      />
                    </div>
                    {errors.image && <p className="text-red-500 text-xs mt-1">{errors.image.message}</p>}
                  </div>
                </div>
              </div>

              {/* Gallery */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Product Gallery</label>
                
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <button 
                    type="button"
                    onClick={() => document.getElementById('gallery-upload')?.click()}
                    className="bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-lg text-xs font-bold transition-all border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-2 uppercase tracking-widest"
                  >
                    <Upload className="w-4 h-4" />
                    Upload from Drive
                  </button>
                  <input id="gallery-upload" type="file" multiple className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'gallery')} />
                  
                  <div className="flex gap-2">
                    <input 
                      value={galleryInput}
                      onChange={(e) => setGalleryInput(e.target.value)}
                      className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm dark:text-white"
                      placeholder="Or enter image URL"
                    />
                    <button 
                      type="button"
                      onClick={addGalleryImage}
                      className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-2 rounded-lg text-xs font-bold transition-all border border-primary/20 uppercase tracking-widest"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {gallery.map((url, index) => (
                    <div key={index} className="relative group aspect-square rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <Image 
                        src={url} 
                        alt={`Gallery ${index}`} 
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <button 
                        type="button"
                        onClick={() => removeGalleryImage(url)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-md opacity-0 group-hover:opacity-100 transition-all shadow-lg z-10"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {gallery.length === 0 && (
                    <div className="col-span-4 py-10 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
                      <ImageIcon className="w-8 h-8 mb-2 opacity-20" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">No gallery images added</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Ingredients Section (Recipe) */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Recipe / Ingredients
                </h3>
                <div className="flex items-center gap-4 mt-1">
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                    Total Cost: <span className="text-primary">{formatCurrency(cogs, "IDR")}</span>
                  </p>
                  {watch("price") > 0 && (
                    <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      Margin: <span className={cn(
                        "font-black",
                        ((watch("price") - cogs) / watch("price")) > 0.3 ? "text-green-500" : "text-orange-500"
                      )}>
                        {(((watch("price") - cogs) / watch("price")) * 100).toFixed(0)}%
                      </span>
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const firstItem = inventoryItems?.[0];
                  const firstBaseUnit = normalizeUOM(firstItem?.unit);
                  appendIngredient({
                    inventoryItemId: firstItem?.id || 0,
                    quantity: 1,
                    quantityUnit: firstBaseUnit,
                    baseUnit: firstBaseUnit,
                    conversionFactor: 1
                  });
                }}
                className="text-sm bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg flex items-center space-x-1 transition-all font-bold uppercase tracking-wider"
              >
                <Plus className="w-4 h-4" />
                <span>Add Ingredient</span>
              </button>
            </div>

            <div className="space-y-3">
              {ingredientFields.map((field, index) => {
                const selectedItem = inventoryItems.find(i => i.id === Number(watch(`ingredients.${index}.inventoryItemId`)));
                const quantity = watch(`ingredients.${index}.quantity`) || 0;
                const quantityUnit = normalizeUOM(watch(`ingredients.${index}.quantityUnit`) || selectedItem?.unit);
                const baseUnit = normalizeUOM(watch(`ingredients.${index}.baseUnit`) || selectedItem?.unit);
                const conversionFactor = Math.max(0.000001, safeNumber(watch(`ingredients.${index}.conversionFactor`), 1));
                const subtotal = selectedItem
                  ? round(safeNumber(selectedItem.costPrice, 0) * toBaseQuantity(quantity, quantityUnit, baseUnit, conversionFactor))
                  : 0;
                const ingredientIdField = register(`ingredients.${index}.inventoryItemId` as const, { valueAsNumber: true });

                return (
                  <div key={field.id} className="flex items-start space-x-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ingredient</label>
                        <select
                          {...ingredientIdField}
                          onChange={(e) => {
                            ingredientIdField.onChange(e);
                            const selected = inventoryItems.find((item) => item.id === Number(e.target.value));
                            if (selected) {
                              setValue(`ingredients.${index}.baseUnit`, normalizeUOM(selected.unit), { shouldDirty: true });
                              setValue(`ingredients.${index}.quantityUnit`, normalizeUOM(selected.unit), { shouldDirty: true });
                              if (normalizeUOM(selected.unit) !== "pcs") {
                                setValue(`ingredients.${index}.conversionFactor`, normalizeUOM(selected.unit) === "kg" ? 1000 : 1, { shouldDirty: true });
                              }
                            }
                          }}
                          className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm transition-all dark:text-white outline-none"
                        >
                          <option value="0">Select Item...</option>
                          {inventoryItems.map(item => (
                            <option key={item.id} value={item.id}>{item.name} ({formatCurrency(item.costPrice, "IDR")}/{item.unit})</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Quantity</label>
                        <div className="grid grid-cols-[minmax(110px,1fr)_110px] gap-2">
                          <input
                            type="number"
                            step="0.01"
                            {...register(`ingredients.${index}.quantity` as const, {
                              setValueAs: (v) => {
                                if (v === "" || v === null || v === undefined) return 0;
                                const cleaned = v.toString().replace(",", ".");
                                const num = parseFloat(cleaned);
                                return Number.isFinite(num) ? num : 0;
                              }
                            })}
                            className="w-full min-w-[110px] px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm transition-all text-gray-900 dark:text-white font-bold outline-none"
                            placeholder="0"
                          />
                          <select
                            {...register(`ingredients.${index}.quantityUnit` as const)}
                            className="w-[110px] px-2 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-black uppercase tracking-widest dark:text-white outline-none"
                          >
                            <option value="gram">Gram</option>
                            <option value="kg">Kg</option>
                            <option value="pcs">Pcs</option>
                          </select>
                        </div>
                        <input type="hidden" {...register(`ingredients.${index}.baseUnit` as const)} />
                        <div className="mt-2 space-y-1">
                          <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            Base Unit: {baseUnit}
                          </p>
                          <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            Grams per Pcs
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            {...register(`ingredients.${index}.conversionFactor` as const, {
                              setValueAs: (v) => {
                                const num = safeNumber(v, 1);
                                return num > 0 ? num : 1;
                              }
                            })}
                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm transition-all text-gray-900 dark:text-white font-bold outline-none"
                            placeholder="1000"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Cost Subtotal</label>
                        <div className="px-3 py-2 bg-gray-100/50 dark:bg-gray-900/50 rounded-lg text-sm font-bold text-primary">
                          {formatCurrency(subtotal, "IDR")}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeIngredient(index)}
                      className="mt-6 p-2 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {ingredientFields.length === 0 && (
                <div className="text-center py-8 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-gray-400 dark:text-gray-600 text-xs font-bold uppercase tracking-widest">
                  No ingredients added. This product will not reduce raw stock.
                </div>
              )}
            </div>
          </div>

          {/* Variations Section */}
          {productType === "variable" && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Product Variations</h3>
                <button
                  type="button"
                  onClick={() => appendVariation({ name: "", price: 0 })}
                  className="text-sm bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg flex items-center space-x-1 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Variation</span>
                </button>
              </div>
              
              <div className="space-y-3">
                {variationFields.map((field, index) => (
                  <div key={field.id} className="flex items-start space-x-3 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 group">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Variation Name</label>
                        <input
                          {...register(`variations.${index}.name` as const)}
                          className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-primary text-sm transition-all dark:text-white"
                          placeholder="e.g. S55"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Price (IDR)</label>
                        <input
                          type="number"
                          step="100"
                          {...register(`variations.${index}.price` as const, { valueAsNumber: true })}
                          className="w-full px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:border-primary text-sm transition-all dark:text-white"
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVariation(index)}
                      className="mt-6 p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {variationFields.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-gray-400 dark:text-gray-600 text-sm">
                    No variations added yet.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex space-x-3">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors uppercase tracking-wider text-sm"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || isUploading}
              className="flex-1 px-4 py-2.5 bg-primary text-white font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 uppercase tracking-wider text-sm shadow-lg shadow-primary/20"
            >
              {isSubmitting || isUploading ? "Saving..." : "Save Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
