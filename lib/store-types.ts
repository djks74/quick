export type StoreTypeOption = {
  code: string;
  label: string;
  active?: boolean;
};

export function getDefaultStoreTypes(): StoreTypeOption[] {
  return [
    { code: "GROCERY", label: "Grocery / Sembako", active: true },
    { code: "RESTAURANT", label: "Restaurant / Warung", active: true },
    { code: "COFFEE", label: "Coffee / Drinks", active: true },
    { code: "BAKERY", label: "Bakery / Snacks", active: true },
    { code: "PHARMACY", label: "Pharmacy / Health", active: true },
    { code: "ELECTRONICS", label: "Electronics / Gadget", active: true },
    { code: "FASHION", label: "Fashion", active: true },
    { code: "BEAUTY", label: "Beauty / Skincare", active: true },
    { code: "HOUSEHOLD", label: "Household / Home supplies", active: true },
    { code: "BABY_KIDS_TOYS", label: "Baby / Kids / Toys", active: true },
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

export function getStoreTypeLabelMap(storeTypesInput: any) {
  const normalized = normalizeStoreTypes(storeTypesInput);
  const map = new Map<string, string>();
  for (const item of normalized) {
    map.set(item.code, item.label);
  }
  return map;
}
