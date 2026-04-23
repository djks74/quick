"use client";

import { useState, useMemo, useRef } from "react";
import Image from "next/image";
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Copy,
  Image as ImageIcon,
  RefreshCcw,
  Upload,
  Printer
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import ProductForm from "@/app/[slug]/admin/products/ProductForm";
import CategoryForm from "@/app/[slug]/admin/products/CategoryForm";
import { getProducts, getCategories, createProduct, updateProduct, deleteProduct, resetAllProductsForStore, createCategory, updateCategory, deleteCategory, importProductsFromCsvRows } from "@/lib/api";
import { cn } from "@/lib/utils";

type IngredientUOM = "gram" | "kg" | "pcs";

const normalizeUOM = (value?: string): IngredientUOM => {
  const v = (value || "").toLowerCase();
  if (v === "gram" || v === "gr" || v === "g") return "gram";
  if (v === "kg" || v === "kilogram") return "kg";
  return "pcs";
};

const toBaseQuantity = (quantity: number, quantityUnit: IngredientUOM, baseUnit: IngredientUOM, conversionFactor: number) => {
  const gramsPerPcs = Math.max(0.000001, Number.isFinite(conversionFactor) ? conversionFactor : 1);
  const qty = Number.isFinite(quantity) ? quantity : 0;
  const grams = quantityUnit === "gram" ? qty : quantityUnit === "kg" ? qty * 1000 : qty * gramsPerPcs;
  const baseQty = baseUnit === "gram" ? grams : baseUnit === "kg" ? grams / 1000 : grams / gramsPerPcs;
  return Number(baseQty.toFixed(6));
};

const normalizeCsvKey = (input: string) =>
  String(input || "")
    .replace(/\uFEFF/g, "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");

const CSV_FIELD_ALIASES: Record<string, string[]> = {
  name: ["name", "productname", "title", "nama"],
  price: ["price", "regularprice", "saleprice", "harga", "hargareguler"],
  category: ["category", "categories", "kategori"],
  subCategory: ["subcategory", "subkategori", "subcategoryname"],
  stock: ["stock", "stok", "qty", "quantity"],
  barcode: ["barcode", "sku"],
  image: ["image", "images", "imageurl", "thumbnail"],
  description: ["description", "deskripsi", "desc"],
  shortDescription: ["shortdescription", "shortdesc", "deskripsisingkat", "excerpt"],
  rating: ["rating"],
  type: ["type", "producttype", "jenis"],
  variations: ["variation", "variations", "variasi", "variationoptions"]
};

const CSV_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  price: "Price",
  category: "Category",
  subCategory: "Sub Category",
  stock: "Stock",
  barcode: "Barcode/SKU",
  image: "Image URL",
  description: "Description",
  shortDescription: "Short Description",
  rating: "Rating",
  type: "Type",
  variations: "Variations"
};

const CODE39_MAP: Record<string, string> = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  "A": "wnnnnwnnw",
  "B": "nnwnnwnnw",
  "C": "wnwnnwnnn",
  "D": "nnnnwwnnw",
  "E": "wnnnwwnnn",
  "F": "nnwnwwnnn",
  "G": "nnnnnwwnw",
  "H": "wnnnnwwnn",
  "I": "nnwnnwwnn",
  "J": "nnnnwwwnn",
  "K": "wnnnnnnww",
  "L": "nnwnnnnww",
  "M": "wnwnnnnwn",
  "N": "nnnnwnnww",
  "O": "wnnnwnnwn",
  "P": "nnwnwnnwn",
  "Q": "nnnnnnwww",
  "R": "wnnnnnwwn",
  "S": "nnwnnnwwn",
  "T": "nnnnwnwwn",
  "U": "wwnnnnnnw",
  "V": "nwwnnnnnw",
  "W": "wwwnnnnnn",
  "X": "nwnnwnnnw",
  "Y": "wwnnwnnnn",
  "Z": "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  "$": "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn"
};

function buildCode39Layout(rawValue: string) {
  const value = rawValue?.trim().toUpperCase();
  if (!value) return null;
  const encoded = `*${value}*`;
  for (const char of encoded) {
    if (!CODE39_MAP[char]) return null;
  }
  const narrow = 2;
  const wide = 5;
  const gap = 2;
  let x = 0;
  const rects: { x: number; width: number }[] = [];
  for (let c = 0; c < encoded.length; c++) {
    const pattern = CODE39_MAP[encoded[c]];
    for (let i = 0; i < pattern.length; i++) {
      const width = pattern[i] === "w" ? wide : narrow;
      if (i % 2 === 0) rects.push({ x, width });
      x += width;
    }
    if (c < encoded.length - 1) x += gap;
  }
  return { width: x, rects, text: value };
}

const EAN13_L: string[] = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011"
];

const EAN13_G: string[] = [
  "0100111",
  "0110011",
  "0011011",
  "0100001",
  "0011101",
  "0111001",
  "0000101",
  "0010001",
  "0001001",
  "0010111"
];

const EAN13_R: string[] = [
  "1110010",
  "1100110",
  "1101100",
  "1000010",
  "1011100",
  "1001110",
  "1010000",
  "1000100",
  "1001000",
  "1110100"
];

const EAN13_PARITY: string[] = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL"
];

const computeEan13CheckDigit = (digits12: string) => {
  const d = String(digits12 || "").replace(/\D/g, "");
  if (d.length !== 12) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(d[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return String((10 - (sum % 10)) % 10);
};

const isValidEan13 = (digits13: string) => {
  const d = String(digits13 || "").replace(/\D/g, "");
  if (d.length !== 13) return false;
  const check = computeEan13CheckDigit(d.slice(0, 12));
  return check === d.slice(12, 13);
};

function buildEan13Layout(rawValue: string) {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (digits.length !== 13) return null;
  if (!isValidEan13(digits)) return null;
  const first = Number(digits[0]);
  const parity = EAN13_PARITY[first];
  if (!parity) return null;

  let bits = "101";
  for (let i = 1; i <= 6; i++) {
    const n = Number(digits[i]);
    const enc = parity[i - 1] === "G" ? EAN13_G[n] : EAN13_L[n];
    bits += enc;
  }
  bits += "01010";
  for (let i = 7; i <= 12; i++) {
    const n = Number(digits[i]);
    bits += EAN13_R[n];
  }
  bits += "101";

  const moduleWidth = 2;
  const height = 44;
  const rects: { x: number; width: number }[] = [];
  let x = 0;
  let runStart = -1;
  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i];
    if (bit === "1" && runStart === -1) runStart = i;
    if ((bit === "0" || i === bits.length - 1) && runStart !== -1) {
      const end = bit === "0" ? i : i + 1;
      rects.push({ x: runStart * moduleWidth, width: (end - runStart) * moduleWidth });
      runStart = -1;
    }
    x = (i + 1) * moduleWidth;
  }
  return { width: x, height, rects, text: digits };
}

function BarcodePreview({ value, height = 36 }: { value?: string; height?: number }) {
  const raw = String(value || "");
  const ean = buildEan13Layout(raw);
  if (ean) {
    return (
      <div className="space-y-1">
        <svg viewBox={`0 0 ${ean.width} ${ean.height}`} className="w-full max-w-[160px] h-9 bg-white rounded p-1">
          {ean.rects.map((bar, index) => (
            <rect key={`${bar.x}-${index}`} x={bar.x} y={0} width={bar.width} height={ean.height} fill="#111827" />
          ))}
        </svg>
        <div className="text-[10px] text-gray-400 dark:text-gray-500 font-black tracking-widest">{ean.text}</div>
      </div>
    );
  }
  const layout = buildCode39Layout(raw);
  if (!layout) return <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold tracking-widest uppercase">{String(value || "—")}</div>;
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${layout.width} ${height}`} className="w-full max-w-[160px] h-9 bg-white rounded p-1">
        {layout.rects.map((bar, index) => (
          <rect key={`${bar.x}-${index}`} x={bar.x} y={0} width={bar.width} height={height} fill="#111827" />
        ))}
      </svg>
      <div className="text-[10px] text-gray-400 dark:text-gray-500 font-black tracking-widest">{layout.text}</div>
    </div>
  );
}

const resolveCsvSystemField = (header: string) => {
  const normalized = normalizeCsvKey(header);
  for (const [field, aliases] of Object.entries(CSV_FIELD_ALIASES)) {
    if (aliases.map(normalizeCsvKey).includes(normalized)) return field;
  }
  return null;
};

const parseVariationsCell = (value: string) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  return raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, priceRaw] = part.split(":").map((x) => x.trim());
      const parsedPrice = Number.parseFloat((priceRaw || "").replace(",", "."));
      if (!name || !Number.isFinite(parsedPrice)) return null;
      return { name, price: parsedPrice };
    })
    .filter((item): item is { name: string; price: number } => Boolean(item));
};

export default function ProductsManager({ 
  initialProducts, 
  initialCategories, 
  inventoryItems = [],
  storeId, 
  isSuperAdmin 
}: { 
  initialProducts: any[], 
  initialCategories: any[], 
  inventoryItems?: any[],
  storeId: number,
  isSuperAdmin: boolean
}) {
  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState(initialProducts);
  const [categories, setCategories] = useState(initialCategories);
  const serverPageSize = 500;
  const [hasMore, setHasMore] = useState(Boolean(Array.isArray(initialProducts) && initialProducts.length >= serverPageSize));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showCsvMapping, setShowCsvMapping] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{
    headers: string[];
    mapped: string[];
    unknown: string[];
    totalRows: number;
    multiCategoryRows: number;
  } | null>(null);
  const [pendingImportRows, setPendingImportRows] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const totalProductsCount = products.length;
  const activeProductsCount = products.filter(p => p.category !== "_ARCHIVED_").length;
  const categoriesCount = categories.length;

  const lastSync = products.reduce((latest, p) => {
    const date = new Date(p.updatedAt).getTime();
    return date > latest ? date : latest;
  }, 0);

  const filteredProducts = useMemo(
    () =>
      products.filter((p) => {
        // Hide System products (like Tagihan Manual)
        if (p.category === "System") return false;

        const q = searchQuery.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          String(p.barcode || "").toLowerCase().includes(q) ||
          (p.category || "").toLowerCase().includes(q)
        );
      }),
    [products, searchQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedProducts = useMemo(
    () => filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredProducts, currentPage, pageSize]
  );

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this product?")) {
      const success = await deleteProduct(id);
      if (success) {
        setProducts(products.filter(p => p.id !== id));
      }
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (confirm("Are you sure you want to delete this category? All products in this category will be uncategorized.")) {
      const success = await deleteCategory(id);
      if (success) {
        setCategories(categories.filter(c => c.id !== id.toString()));
      }
    }
  };

  const handleDuplicate = async (product: any) => {
    if (!confirm(`Duplicate "${product.name}"?`)) return;
    
    const { id, createdAt, updatedAt, ...productData } = product;
    const newProduct = {
        ...productData,
        name: `${product.name} (Copy)`,
    };
    
    if (newProduct.variations && Array.isArray(newProduct.variations)) {
        newProduct.variations = newProduct.variations.map((v: any) => {
            const { id, ...vData } = v;
            return vData;
        });
    }

    const created = await createProduct(storeId, newProduct);
    if (created) {
        const target = Math.max(serverPageSize, products.length);
        const freshProducts = await getProducts(storeId, undefined, target, 0);
        setProducts(freshProducts);
        setHasMore(Boolean(Array.isArray(freshProducts) && freshProducts.length >= target));
    }
  };

  const handleEdit = (product: any) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const renderBarcodeSvgMarkup = (barcodeValue: string) => {
    const raw = String(barcodeValue || "");
    const ean = buildEan13Layout(raw);
    if (ean) {
      const rects = ean.rects
        .map((b) => `<rect x="${b.x}" y="0" width="${b.width}" height="${ean.height}" fill="#111827" />`)
        .join("");
      return `<svg viewBox="0 0 ${ean.width} ${ean.height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
    }
    const layout = buildCode39Layout(raw);
    if (!layout) return "";
    const height = 60;
    const rects = layout.rects
      .map((b) => `<rect x="${b.x}" y="0" width="${b.width}" height="${height}" fill="#111827" />`)
      .join("");
    return `<svg viewBox="0 0 ${layout.width} ${height}" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
  };

  const printBarcodes = (rows: Array<{ name: string; barcode: string }>) => {
    const safeRows = rows.filter((r) => r && r.barcode);
    if (safeRows.length === 0) return;
    const w = window.open("", "_blank", "width=980,height=720");
    if (!w) return;
    const html = `<!doctype html><html><head><meta charset="utf-8" />
      <title>Product Barcodes</title>
      <style>
        *{box-sizing:border-box} body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:0;padding:16px}
        .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .label{border:1px solid #e5e7eb;border-radius:12px;padding:10px}
        .name{font-weight:800;font-size:12px;line-height:1.2;min-height:30px}
        .code{margin-top:8px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:8px}
        .code svg{width:100%;height:60px;display:block}
        .text{margin-top:6px;font-size:10px;letter-spacing:.18em;font-weight:800;color:#111827;text-align:center}
        @media print{body{padding:0}.label{page-break-inside:avoid}}
      </style>
    </head><body>
      <div class="grid">
        ${safeRows
          .map((r) => {
            const svg = renderBarcodeSvgMarkup(r.barcode);
            const name = String(r.name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const text = String(r.barcode || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            return `<div class="label"><div class="name">${name}</div><div class="code">${svg}</div><div class="text">${text}</div></div>`;
          })
          .join("")}
      </div>
      <script>setTimeout(()=>{window.focus(); window.print();}, 200);</script>
    </body></html>`;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const handlePrintSelected = () => {
    const selected = products.filter((p: any) => selectedProductIds.includes(p.id) && p.barcode);
    printBarcodes(selected.map((p: any) => ({ name: p.name, barcode: String(p.barcode) })));
  };

  const handlePrintSingle = (product: any) => {
    if (!product?.barcode) return;
    printBarcodes([{ name: String(product.name || ""), barcode: String(product.barcode) }]);
  };

  const handleEditCategory = (category: any) => {
    setEditingCategory(category);
    setIsCategoryFormOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedProductIds.length === paginatedProducts.length) {
      setSelectedProductIds([]);
    } else {
      setSelectedProductIds(paginatedProducts.map(p => p.id));
    }
  };

  const toggleSelectProduct = (id: number) => {
    setSelectedProductIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedProductIds.length} selected products?`)) return;

    setIsDeletingBulk(true);
    try {
      const results = await Promise.all(selectedProductIds.map(id => deleteProduct(id)));
      const successCount = results.filter(ok => ok).length;
      
      if (successCount > 0) {
        const processedIds = selectedProductIds.filter((_, index) => results[index]);
        
        setProducts(prev => prev.filter(p => !processedIds.includes(p.id)));
        setSelectedProductIds(prev => prev.filter(id => !processedIds.includes(id)));
      }
      
      if (successCount < selectedProductIds.length) {
        alert(`Successfully processed ${successCount} products. ${selectedProductIds.length - successCount} products could not be deleted.`);
      }
    } catch (err) {
      console.error("[BULK_DELETE_ERROR]", err);
      alert("An error occurred during bulk deletion. Please refresh and try again.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setIsFormOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsCategoryFormOpen(true);
  };

  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      const [freshProducts, freshCategories] = await Promise.all([
        getProducts(storeId, undefined, serverPageSize, 0),
        getCategories(storeId)
      ]);
      setProducts(freshProducts);
      setCategories(freshCategories);
      setHasMore(Boolean(Array.isArray(freshProducts) && freshProducts.length >= serverPageSize));
      setSelectedProductIds([]);
      setPage(1);
    } catch (err) {
      console.error("[REFRESH_ERROR]", err);
      alert("Failed to refresh data. Please reload the page.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadMoreProducts = async () => {
    if (isRefreshing || !hasMore) return;
    setIsRefreshing(true);
    try {
      const next = await getProducts(storeId, undefined, serverPageSize, products.length);
      if (Array.isArray(next) && next.length > 0) {
        setProducts((prev: any[]) => [...prev, ...next]);
      }
      setHasMore(Boolean(Array.isArray(next) && next.length >= serverPageSize));
    } catch (err) {
      console.error("[LOAD_MORE_ERROR]", err);
      alert("Failed to load more products. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const resetAllProducts = async () => {
    if (!confirm("Reset all products for this store? This will archive all current products so you can re-sync from WCFM.")) return;
    const res = await resetAllProductsForStore(storeId);
    if (!res?.success) {
      alert("Failed to reset products. Please try again.");
      return;
    }
    await refreshData();
  };

  const parseCsvRows = (text: string) => {
    const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ";" : ",";
    const table: string[][] = [];
    let row: string[] = [];
    let value = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"') {
        if (inQuotes && next === '"') {
          value += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        row.push(value);
        value = "";
        continue;
      }
      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(value);
        if (row.some((cell) => String(cell || "").trim().length > 0)) {
          table.push(row.map((cell) => String(cell || "").trim()));
        }
        row = [];
        value = "";
        continue;
      }
      value += char;
    }
    row.push(value);
    if (row.some((cell) => String(cell || "").trim().length > 0)) {
      table.push(row.map((cell) => String(cell || "").trim()));
    }
    if (table.length < 2) {
      const onlyHeaders = table[0]?.map((h) => String(h || "").trim()) || [];
      const mappedHeaders = onlyHeaders
        .map((header) => {
          const field = resolveCsvSystemField(header);
          if (!field) return null;
          return `${header} → ${CSV_FIELD_LABELS[field] || field}`;
        })
        .filter((v): v is string => Boolean(v));
      const unknownHeaders = onlyHeaders.filter((header) => !resolveCsvSystemField(header));
      return { rows: [], headers: onlyHeaders, mappedHeaders, unknownHeaders, multiCategoryRows: 0, totalRows: 0 };
    }

    const rawHeaders = table[0].map((h) => String(h || "").trim());
    const headers = rawHeaders.map(normalizeCsvKey);
    const dataRows = table.slice(1);
    const mappedHeaders = rawHeaders
      .map((header) => {
        const field = resolveCsvSystemField(header);
        if (!field) return null;
        return `${header} → ${CSV_FIELD_LABELS[field] || field}`;
      })
      .filter((v): v is string => Boolean(v));
    const unknownHeaders = rawHeaders.filter((header) => !resolveCsvSystemField(header));

    const getValue = (record: Record<string, string>, aliases: string[]) => {
      for (const alias of aliases) {
        const key = normalizeCsvKey(alias);
        if (record[key] !== undefined) return record[key];
      }
      return "";
    };

    const rows = dataRows
      .map((cells) => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = String(cells[index] || "").trim();
        });
        return {
          name: getValue(record, CSV_FIELD_ALIASES.name),
          price: getValue(record, CSV_FIELD_ALIASES.price),
          category: getValue(record, CSV_FIELD_ALIASES.category),
          stock: getValue(record, CSV_FIELD_ALIASES.stock),
          barcode: getValue(record, CSV_FIELD_ALIASES.barcode),
          image: getValue(record, CSV_FIELD_ALIASES.image),
          description: getValue(record, CSV_FIELD_ALIASES.description),
          shortDescription: getValue(record, CSV_FIELD_ALIASES.shortDescription),
          subCategory: getValue(record, CSV_FIELD_ALIASES.subCategory),
          rating: getValue(record, CSV_FIELD_ALIASES.rating),
          type: getValue(record, CSV_FIELD_ALIASES.type),
          variations: parseVariationsCell(getValue(record, CSV_FIELD_ALIASES.variations))
        };
      })
      .filter((item) => String(item.name || "").trim().length > 0);
    const multiCategoryRows = rows.filter((item) => {
      const raw = String(item.category || "");
      return raw.split(",").map((x) => x.trim()).filter(Boolean).length > 1;
    }).length;

    return { rows, headers: rawHeaders, mappedHeaders, unknownHeaders, multiCategoryRows, totalRows: rows.length };
  };

  const handleImportCsvFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a CSV file.");
      return;
    }

    try {
      const csvText = await file.text();
      const { rows, headers, mappedHeaders, unknownHeaders, multiCategoryRows, totalRows } = parseCsvRows(csvText);
      setPendingImportRows(rows);
      setCsvPreview({
        headers,
        mapped: mappedHeaders,
        unknown: unknownHeaders,
        totalRows,
        multiCategoryRows
      });
      setShowCsvMapping(true);
      if (!rows.length) {
        alert("No valid rows found. Please ensure CSV has headers and at least one product row.");
        return;
      }
      alert("CSV loaded. Please review mapping and click Confirm Import.");
    } catch (err) {
      console.error("[CSV_IMPORT_CLIENT_ERROR]", err);
      alert("Failed to import CSV. Please check your file format.");
    } finally {
      if (csvInputRef.current) {
        csvInputRef.current.value = "";
      }
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImportRows.length) {
      alert("No pending CSV rows. Please upload a CSV file first.");
      return;
    }
    const multiCategoryRows = csvPreview?.multiCategoryRows || 0;
    const confirmMessage = multiCategoryRows > 0
      ? `Continue import ${pendingImportRows.length} rows?\n\n${multiCategoryRows} rows contain multiple categories and ONLY the first category will be used.`
      : `Continue import ${pendingImportRows.length} rows?`;
    if (!confirm(confirmMessage)) return;

    setIsImportingCsv(true);
    try {
      const result = await importProductsFromCsvRows(storeId, pendingImportRows);
      if (!result?.success) {
        alert(result?.error || "CSV import failed.");
        return;
      }

      await refreshData();
      const summary = `CSV import finished. Created: ${result.created || 0}, Updated: ${result.updated || 0}, Failed: ${result.failed || 0}, Multi-category normalized: ${result.multiCategoryRows || 0}.`;
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        alert(`${summary}\n\nFirst errors:\n${result.errors.join("\n")}`);
      } else {
        alert(summary);
      }
      setPendingImportRows([]);
      setCsvPreview(null);
      setShowCsvMapping(false);
    } catch (err) {
      console.error("[CSV_IMPORT_CLIENT_ERROR]", err);
      alert("Failed to import CSV. Please check your file format.");
    } finally {
      setIsImportingCsv(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Total Products</p>
          <h3 className="text-xl font-black text-gray-900 dark:text-white">{totalProductsCount}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Active Menu</p>
          <h3 className="text-xl font-black text-green-600 dark:text-green-400">{activeProductsCount}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Categories</p>
          <h3 className="text-xl font-black text-blue-600 dark:text-blue-400">{categoriesCount}</h3>
        </div>
        <div className="bg-white dark:bg-[#1A1D21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm transition-colors">
          <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Out of Stock</p>
          <h3 className="text-xl font-black text-red-600 dark:text-red-400">{products.filter(p => p.stock <= 0).length}</h3>
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-4">
             {/* Tabs */}
             <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('products')} 
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                    activeTab === 'products' 
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                >
                  Products
                </button>
                <button 
                  onClick={() => setActiveTab('categories')} 
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                    activeTab === 'categories' 
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" 
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                  )}
                >
                  Categories
                </button>
             </div>
           </div>
           {lastSync > 0 && (
             <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-tight bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Last Sync: {new Date(lastSync).toLocaleString('id-ID', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
             </div>
           )}
         </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={refreshData}
            disabled={isRefreshing}
            className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-gray-200 dark:border-gray-700 disabled:opacity-50"
          >
            <RefreshCcw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={resetAllProducts}
            className="bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-red-100 dark:border-red-900/20"
          >
            <Trash2 className="w-4 h-4" />
            <span>Reset Products</span>
          </button>
          {isSuperAdmin && (
            <button 
                onClick={handleAddCategory}
                className="bg-secondary/10 dark:bg-secondary/20 hover:bg-secondary/20 dark:hover:bg-secondary/30 text-secondary px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-secondary/20 dark:border-secondary/30"
            >
                <Plus className="w-4 h-4" />
                <span>Add Category</span>
            </button>
          )}
          {activeTab === 'products' && (
            <>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleImportCsvFile(e.target.files?.[0] || null)}
              />
              <button
                type="button"
                onClick={() => csvInputRef.current?.click()}
                disabled={isImportingCsv}
                className="bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-blue-100 dark:border-blue-900/20 disabled:opacity-50"
              >
                <Upload className={cn("w-4 h-4", isImportingCsv && "animate-pulse")} />
                <span>{isImportingCsv ? "Importing..." : "Import CSV"}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCsvMapping((v) => !v)}
                className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-gray-200 dark:border-gray-700"
              >
                <span>{showCsvMapping ? "Hide Mapping" : "Show Mapping"}</span>
              </button>
              {selectedProductIds.length > 0 && (
                <button
                  type="button"
                  onClick={handlePrintSelected}
                  className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider border border-gray-200 dark:border-gray-700"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Barcodes</span>
                </button>
              )}
            <button 
                onClick={handleAdd}
                className="bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors duration-200 font-bold text-sm uppercase tracking-wider shadow-lg shadow-primary/20"
            >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
            </button>
            </>
          )}
        </div>
      </div>

      {activeTab === 'products' && (
        <>
            {showCsvMapping && (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1D21] space-y-3">
                <div className="text-xs font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">CSV Mapping Guide</div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300">
                  Variations format: <span className="font-bold">Small:10000|Large:15000</span>
                </div>
                <div className="text-[11px] text-gray-600 dark:text-gray-300">
                  Multi-category rule: for values like <span className="font-bold">Bumbu Dapur, Lain Lain</span>, only <span className="font-bold">Bumbu Dapur</span> is used.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  {Object.entries(CSV_FIELD_ALIASES).map(([field, aliases]) => (
                    <div key={field} className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                      <div className="font-bold text-gray-800 dark:text-gray-100">{CSV_FIELD_LABELS[field] || field}</div>
                      <div className="text-gray-500 dark:text-gray-400">{aliases.join(", ")}</div>
                    </div>
                  ))}
                </div>
                {csvPreview && (
                  <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      Detected headers: {csvPreview.headers.join(", ")}
                    </div>
                    <div className="text-[11px] text-gray-600 dark:text-gray-300">
                      Ready rows: {csvPreview.totalRows}
                    </div>
                    <div className="text-[11px] text-blue-700 dark:text-blue-400">
                      Multi-category rows: {csvPreview.multiCategoryRows}
                    </div>
                    <div className="text-[11px] text-green-700 dark:text-green-400">
                      Mapped: {csvPreview.mapped.length ? csvPreview.mapped.join(" | ") : "-"}
                    </div>
                    <div className="text-[11px] text-amber-700 dark:text-amber-400">
                      Unmapped: {csvPreview.unknown.length ? csvPreview.unknown.join(", ") : "None"}
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleConfirmImport}
                        disabled={isImportingCsv || pendingImportRows.length === 0}
                        className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-widest disabled:opacity-50"
                      >
                        {isImportingCsv ? "Importing..." : "Confirm Import"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingImportRows([]);
                          setCsvPreview(null);
                        }}
                        className="bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-widest border border-gray-200 dark:border-gray-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-gray-500" />
                <input 
                    type="text"
                    placeholder="Search products..."
                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all dark:text-white dark:placeholder:text-gray-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {selectedProductIds.length > 0 && (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/10 px-4 py-2 rounded-lg border border-red-100 dark:border-red-900/20 animate-in fade-in slide-in-from-top-2">
                  <span className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-widest">
                    {selectedProductIds.length} Selected
                  </span>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isDeletingBulk}
                    className="flex items-center gap-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {isDeletingBulk ? <div className="w-3 h-3 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Trash2 size={12} />}
                    Delete All
                  </button>
                  <button
                    onClick={() => setSelectedProductIds([])}
                    className="text-[10px] font-black text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 uppercase tracking-widest"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
                <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-6 py-4 w-10">
                      <input 
                        type="checkbox"
                        className="rounded border-gray-300 dark:border-gray-700 text-primary focus:ring-primary cursor-pointer"
                        checked={paginatedProducts.length > 0 && selectedProductIds.length === paginatedProducts.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Barcode</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Category</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Cost</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-center">Margin</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Price</th>
                    <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {paginatedProducts.map((product) => {
                        const productCost = product.ingredients?.reduce((total: number, ing: any) => {
                            const inventoryItem = inventoryItems.find(i => i.id === ing.inventoryItemId);
                            if (!inventoryItem) return total;
                            const baseUnit = normalizeUOM(ing.baseUnit || inventoryItem.unit);
                            const quantityUnit = normalizeUOM(ing.quantityUnit || baseUnit);
                            const conversionFactor = Math.max(0.000001, Number(ing.conversionFactor) || 1);
                            const baseQuantity = toBaseQuantity(Number(ing.quantity) || 0, quantityUnit, baseUnit, conversionFactor);
                            return total + (inventoryItem.costPrice * baseQuantity);
                        }, 0) || 0;
                        const margin = product.price > 0 ? ((product.price - productCost) / product.price) * 100 : 0;

                        return (
                        <tr key={product.id} className={cn(
                          "hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors",
                          selectedProductIds.includes(product.id) && "bg-blue-50/50 dark:bg-blue-900/10"
                        )}>
                            <td className="px-6 py-4">
                              <input 
                                type="checkbox"
                                className="rounded border-gray-300 dark:border-gray-700 text-primary focus:ring-primary cursor-pointer"
                                checked={selectedProductIds.includes(product.id)}
                                onChange={() => toggleSelectProduct(product.id)}
                              />
                            </td>
                            <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700 relative">
                                {product.image ? (
                                    <Image 
                                      src={product.image} 
                                      alt={product.name} 
                                      fill
                                      className="object-cover"
                                      unoptimized
                                    />
                                ) : (
                                    <ImageIcon className="w-5 h-5 text-gray-300 dark:text-gray-600" />
                                )}
                                </div>
                                <div>
                                <div className="font-bold text-gray-900 dark:text-white text-sm">{product.name}</div>
                                <div className="text-[10px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest">ID: #{product.id}</div>
                                </div>
                            </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="min-w-[140px]">
                                  <BarcodePreview value={product.barcode} />
                                </div>
                                {product.barcode ? (
                                  <button
                                    type="button"
                                    onClick={() => handlePrintSingle(product)}
                                    className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                                    title="Print barcode"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">
                                {product.category?.replace("-", " ") || "Uncategorized"}
                            </span>
                            </td>
                            <td className="px-6 py-4 text-center">
                            <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-0.5">Total Cost</span>
                            <span className="text-xs font-bold text-primary">{formatCurrency(productCost, "IDR")}</span>
                            </td>
                            <td className="px-6 py-4 text-center">
                            <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest",
                                margin > 30 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" :
                                margin > 10 ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400" :
                                "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                            )}>
                                {margin.toFixed(0)}% Margin
                            </span>
                            </td>
                            <td className="px-6 py-4 text-right font-black text-gray-900 dark:text-white text-sm">
                            {formatCurrency(product.price, "IDR")}
                            </td>
                            <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-2">
                            <button 
                            onClick={() => handleDuplicate(product)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
                            title="Duplicate"
                            >
                            <Copy className="w-4 h-4" />
                            </button>
                            <button 
                            onClick={() => handleEdit(product)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-orange-400 hover:bg-primary/10 dark:hover:bg-orange-400/10 rounded-lg transition-all"
                            >
                            <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        </td>
                    </tr>
                    );
                    })}
                </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4 text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <span>
                  Showing{" "}
                  <span className="font-bold">
                    {filteredProducts.length === 0
                      ? 0
                      : (currentPage - 1) * pageSize + 1}
                    {"–"}
                    {Math.min(currentPage * pageSize, filteredProducts.length)}
                  </span>{" "}
                  of <span className="font-bold">{filteredProducts.length}</span>{" "}
                  products
                </span>

                {hasMore && activeTab === "products" ? (
                  <button
                    type="button"
                    onClick={loadMoreProducts}
                    disabled={isRefreshing}
                    className="px-3 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-gray-900 text-[11px] font-bold uppercase tracking-widest"
                  >
                    {isRefreshing ? "Loading..." : "Load More"}
                  </button>
                ) : null}

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Show:</span>
                  <select 
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-2 py-1 text-[11px] font-bold outline-none focus:border-primary transition-colors"
                  >
                    {[10, 20, 50, 100].map(size => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-gray-900 text-[11px] font-bold uppercase tracking-widest"
                >
                  Prev
                </button>
                <span className="text-[11px] font-bold uppercase tracking-widest">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed bg-white dark:bg-gray-900 text-[11px] font-bold uppercase tracking-widest"
                >
                  Next
                </button>
              </div>
            </div>
        </>
      )}

      {activeTab === 'categories' && (
        <div className="overflow-x-auto border border-gray-100 dark:border-gray-800 rounded-xl">
            <table className="w-full text-left border-collapse">
            <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Name</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Slug</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Products</th>
                <th className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-white text-sm">
                        {cat.name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                        {cat.slug}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200 font-bold">
                        {cat.count || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                        <button 
                        onClick={() => handleEditCategory(cat)}
                        className="p-2 text-gray-400 dark:text-gray-500 hover:text-primary dark:hover:text-orange-400 hover:bg-primary/10 dark:hover:bg-orange-400/10 rounded-lg transition-all"
                        >
                        <Edit2 className="w-4 h-4" />
                        </button>
                        {isSuperAdmin && (
                            <button 
                            onClick={() => handleDeleteCategory(parseInt(cat.id))}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      )}

      {isFormOpen && (
        <ProductForm 
          product={editingProduct} 
          categories={categories}
          inventoryItems={inventoryItems}
          onClose={() => setIsFormOpen(false)}
          onSave={async (updatedProduct: any) => {
            let savedProduct;
            try {
                if (editingProduct) {
                    savedProduct = await updateProduct(editingProduct.id, updatedProduct);
                } else {
                    savedProduct = await createProduct(storeId, updatedProduct);
                }
                const target = Math.max(serverPageSize, products.length);
                const freshProducts = await getProducts(storeId, undefined, target, 0);
                setProducts(freshProducts);
                setHasMore(Boolean(Array.isArray(freshProducts) && freshProducts.length >= target));
                setIsFormOpen(false);
            } catch (err) {
                console.error(err);
                alert("Failed to save product.");
            }
          }}
        />
      )}

      {isCategoryFormOpen && (
        <CategoryForm 
          category={editingCategory}
          onClose={() => setIsCategoryFormOpen(false)}
          onSave={async (newCategory: any) => {
            let saved;
            if (editingCategory) {
                saved = await updateCategory(parseInt(editingCategory.id), newCategory);
            } else {
                saved = await createCategory(storeId, newCategory);
            }
            if (saved) {
              const freshCategories = await getCategories(storeId);
              setCategories(freshCategories);
            }
            setIsCategoryFormOpen(false);
          }}
        />
      )}
    </div>
  );
}
