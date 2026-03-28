export type StoreTypeOption = {
  code: string;
  label: string;
  active?: boolean;
};

export function getDefaultStoreTypes(): StoreTypeOption[] {
  return [
    { code: "GROCERY", label: "Grocery / Sembako", active: true },
    { code: "RESTAURANT", label: "Restaurant / resto (menu siap makan)", active: true },
    { code: "COFFEE", label: "Coffee / Ice (jual minuman jadi)", active: true },
    { code: "BAKERY", label: "Bakery / Snacks (Jual roti dan sejenisnya)", active: true },
    { code: "PHARMACY", label: "Pharmacy / Health (Jual obat obatan)", active: true },
    { code: "ELECTRONICS", label: "Electronics / Gadget (Jual elektronik)", active: true },
    { code: "FASHION", label: "Fashion", active: true },
    { code: "BEAUTY", label: "Beauty / Skincare (Jual kosmetik)", active: true },
    { code: "HOUSEHOLD", label: "Household / Home supplies (panci, piring, dll)", active: true },
    { code: "BABY", label: "Baby", active: true },
    { code: "KIDS", label: "Kids", active: true },
    { code: "TOYS", label: "Toys", active: true },
    { code: "BABY_KIDS_TOYS", label: "Baby / Kids / Toys", active: false },
    { code: "PET_SHOP", label: "Pet shop", active: true },
    { code: "OTHER", label: "Other", active: true }
  ];
}

export function normalizeStoreTypeCode(value: string) {
  const code = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return code || "OTHER";
}

export function normalizeStoreTypes(input: any): StoreTypeOption[] {
  const raw = Array.isArray(input) ? input : [];
  const out: StoreTypeOption[] = [];
  for (const item of raw) {
    if (!item) continue;
    const label = String(item.label || item.name || "").trim();
    const code = normalizeStoreTypeCode(String(item.code || label));
    if (!label) continue;
    out.push({ code, label, active: item.active === false ? false : true });
  }
  const byCode = new Map<string, StoreTypeOption>();
  for (const item of out) {
    if (!byCode.has(item.code)) byCode.set(item.code, item);
  }
  if (!byCode.has("OTHER")) {
    byCode.set("OTHER", { code: "OTHER", label: "Other", active: true });
  }
  return Array.from(byCode.values());
}

export function ensureDefaultStoreTypes(input: any): StoreTypeOption[] {
  const existing = normalizeStoreTypes(input);
  const byCode = new Map(existing.map((t) => [t.code, t]));
  for (const def of getDefaultStoreTypes()) {
    if (!byCode.has(def.code)) byCode.set(def.code, def);
  }
  if (!byCode.has("OTHER")) byCode.set("OTHER", { code: "OTHER", label: "Other", active: true });
  return Array.from(byCode.values());
}

export function getStoreTypeLabelMap(storeTypesInput: any) {
  const normalized = normalizeStoreTypes(storeTypesInput);
  const map = new Map<string, string>();
  for (const item of normalized) {
    map.set(item.code, item.label);
  }
  return map;
}
