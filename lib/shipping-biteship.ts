import { prisma } from "@/lib/prisma";

type ShippingOption = {
  provider: "JNE" | "GOSEND";
  service: string;
  fee: number;
  eta: string;
  type: "instant" | "regular";
};

type BiteshipRateInput = {
  store: any;
  destinationAddress: string;
  destinationPostalCode?: string;
  destinationLatitude?: number;
  destinationLongitude?: number;
  weightGrams?: number;
};

type BiteshipCreateOrderInput = {
  store: any;
  order: any;
  items: Array<{ name?: string; quantity?: number; price?: number; weight?: number }>;
  destinationCoordinate?: { latitude: number; longitude: number };
};

function parseCourierProvider(value?: string): "JNE" | "GOSEND" | null {
  const text = String(value || "").toLowerCase();
  const normalized = text.replace(/[^a-z0-9]/g, "");
  if (normalized.includes("jne")) return "JNE";
  if (normalized.includes("gojek") || normalized.includes("gosend") || normalized.includes("grab")) return "GOSEND";
  return null;
}

function parseEta(item: any) {
  const etd = item?.duration || item?.etd || item?.estimated || item?.estimate || "";
  if (typeof etd === "number") return `${etd} jam`;
  if (typeof etd === "string" && etd.trim()) return etd;
  return "-";
}

function normalizeBiteshipStatus(value?: string) {
  const s = String(value || "").trim().toLowerCase();
  if (!s) return "pending";
  if (s === "confirmed" || s === "allocated" || s === "picking_up" || s === "picking up") return "confirmed";
  if (s === "on_going" || s === "on going" || s === "picked_up" || s === "picked up" || s === "dropping_off" || s === "dropping off") return "on_going";
  if (s === "delivered" || s === "completed") return "delivered";
  if (s === "cancelled" || s === "rejected") return "cancelled";
  if (s === "courier_selected") return "courier_selected";
  if (s === "draft_created" || s === "draft") return "draft_created";
  return s.replace(/\s+/g, "_");
}

async function getApiKey(store?: any) {
  try {
    const platform = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: { biteshipApiKey: true }
    });
    if (platform?.biteshipApiKey) return platform.biteshipApiKey;
  } catch (e) {
    console.error("[BITESHIP_KEY_ERROR]", e);
  }
  return process.env.BITESHIP_API_KEY || "";
}

export async function lookupBiteshipAreaIdFromInput(store: any, input: string) {
  const apiKey = await getApiKey(store);
  const text = String(input || "").trim();
  if (!apiKey || !text) return null;
  try {
    const url = `https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(text)}&type=single`;
    const res = await fetch(url, { method: "GET", headers: { Authorization: apiKey } });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const id = data?.areas?.[0]?.id;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
}

function getFallbackOptions(store: any): ShippingOption[] {
  const options: ShippingOption[] = [];
  if (store?.shippingEnableJne) {
    options.push({
      provider: "JNE",
      service: "REG",
      fee: 22000,
      eta: "1-3 hari",
      type: "regular"
    });
  }
  return options;
}

export async function getShippingQuoteFromBiteship(input: BiteshipRateInput): Promise<ShippingOption[]> {
  const { store } = input;
  const apiKey = await getApiKey(store);
  if (!apiKey) return getFallbackOptions(store);

  const originAddress = String(store?.shippingSenderAddress || "").trim();
  let originPostal = store?.shippingSenderPostalCode
    ? String(store.shippingSenderPostalCode).replace(/\D/g, "")
    : "";
  if (!originPostal) {
    const match = originAddress.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
    if (match) originPostal = match[1];
  }

  let postal = input.destinationPostalCode;
  if (!postal) {
    const match = String(input.destinationAddress || "").match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
    if (match) postal = match[1];
  }

  // Debug log for postal code
  console.log(
    `[BITESHIP_RATES] OriginPostal: ${originPostal || "-"}, DestPostal: ${postal || "-"}, Address: ${input.destinationAddress}`
  );

  const payload = {
    origin_postal_code: originPostal ? Number(originPostal) : undefined,
    origin_address: originAddress || undefined,
    origin_area_id: originPostal ? undefined : store?.biteshipOriginAreaId || undefined,
    origin_latitude:
      store?.shippingEnableGosend && typeof store?.biteshipOriginLat === "number" ? store.biteshipOriginLat : undefined,
    origin_longitude:
      store?.shippingEnableGosend && typeof store?.biteshipOriginLng === "number" ? store.biteshipOriginLng : undefined,
    destination_postal_code: postal || undefined,
    destination_address: input.destinationAddress,
    destination_latitude: typeof input.destinationLatitude === "number" ? input.destinationLatitude : undefined,
    destination_longitude: typeof input.destinationLongitude === "number" ? input.destinationLongitude : undefined,
    couriers: [
      store?.shippingEnableJne ? "jne" : null,
      store?.shippingEnableGosend ? "gojek,grab" : null
    ].filter(Boolean).join(","),
    items: [
      {
        name: "Order",
        description: "WhatsApp Order",
        value: 10000,
        quantity: 1,
        weight: Number(input.weightGrams || 200) // Consistent default
      }
    ]
  };

  if (store?.shippingEnableGosend && (!payload.origin_latitude || !payload.origin_longitude)) {
     console.warn("BITESHIP_MISSING_ORIGIN_COORDINATES", { storeId: store.id, storeName: store.name });
  }

  try {
    const response = await fetch("https://api.biteship.com/v1/rates/couriers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error("BITESHIP_RATES_ERROR", {
        status: response.status,
        payload: JSON.stringify(payload)
      });
      return [];
    }

    const data = await response.json();
    const pricing = Array.isArray(data?.pricing) ? data.pricing : Array.isArray(data?.data?.pricing) ? data.data.pricing : [];
    
    if (pricing.length === 0) {
       console.log("BITESHIP_NO_RATES_RETURNED", {
          payload: JSON.stringify(payload),
          rawResponse: JSON.stringify(data),
          storeSettings: {
            jne: store?.shippingEnableJne,
            gosend: store?.shippingEnableGosend,
            jneOnly: store?.shippingJneOnly
          }
       });
    }

    const mapped: ShippingOption[] = pricing
      .map((item: any) => {
        const provider = parseCourierProvider(item?.courier_company || item?.courier_name || item?.courier_code);
        if (!provider) return null;
        
        // Final filtering based on store settings
        if (provider === "JNE" && !store?.shippingEnableJne) return null;
        if (provider === "GOSEND" && (!store?.shippingEnableGosend || store?.shippingJneOnly)) return null;
        
        const fee = Number(item?.price || item?.final_price || item?.amount || 0);
        if (isNaN(fee)) return null;
        
        return {
          provider,
          service: String(item?.courier_service_name || item?.courier_type || item?.service_type || "-"),
          fee: fee,
          eta: parseEta(item),
          type: provider === "GOSEND" ? "instant" : "regular"
        } as ShippingOption;
      })
      .filter(Boolean);

    if (mapped.length === 0) {
      console.log("BITESHIP_NO_MAPPED_OPTIONS", {
        pricingCount: pricing.length,
        storeSettings: {
          jne: store?.shippingEnableJne,
          gosend: store?.shippingEnableGosend,
          jneOnly: store?.shippingJneOnly
        }
      });
      return [];
    }
    return mapped.sort((a, b) => a.fee - b.fee);
  } catch {
    return [];
  }
}

export async function trackShipmentWithBiteship(store: any, trackingNo: string, courierCode?: string) {
  const apiKey = await getApiKey(store);
  if (!apiKey || !trackingNo) return null;

  const code = (courierCode || "").toLowerCase() || (store?.shippingJneOnly ? "jne" : "gojek");
  try {
    const response = await fetch(`https://api.biteship.com/v1/trackings/${encodeURIComponent(trackingNo)}/couriers/${encodeURIComponent(code)}`, {
      method: "GET",
      headers: {
        Authorization: apiKey
      }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function getBiteshipOrderStatus(store: any, biteshipOrderId: string) {
  const apiKey = await getApiKey(store);
  if (!apiKey || !biteshipOrderId) return null;
  try {
    const res = await fetch(`https://api.biteship.com/v1/orders/${encodeURIComponent(biteshipOrderId)}`, {
      method: "GET",
      headers: { Authorization: apiKey }
    });
    const data = await res.json();
    if (!res.ok) return null;
    return data;
  } catch {
    return null;
  }
}

export async function cancelBiteshipOrder(store: any, biteshipOrderId: string) {
  const apiKey = await getApiKey(store);
  if (!apiKey || !biteshipOrderId) return { ok: false, error: "MISSING_PARAMS" };
  try {
    const res = await fetch(`https://api.biteship.com/v1/orders/${encodeURIComponent(biteshipOrderId)}`, {
      method: "DELETE",
      headers: { Authorization: apiKey }
    });
    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data?.error || "CANCEL_FAILED", detail: data };
    }
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "CANCEL_EXCEPTION" };
  }
}

function resolveCourierCompany(provider?: string) {
  const p = String(provider || "").toLowerCase();
  if (p.includes("go")) return "gojek";
  if (p.includes("jne")) return "jne";
  return p;
}

function normalizeServiceKey(value?: string) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matchCourierCompany(item: any, company: string) {
  const raw = String(item?.company || item?.courier_company || item?.courier_name || item?.courier_code || "").toLowerCase();
  if (!raw) return false;
  
  const target = company.toLowerCase();
  if (target === "gojek" || target === "gosend") {
    return raw.includes("gojek") || raw.includes("gosend") || raw.includes("go-send") || raw.includes("go");
  }
  if (target === "jne") {
    return raw.includes("jne");
  }
  return raw.includes(target);
}

function getServiceType(item: any) {
  // Try all possible keys for the service type/code
  const type = item?.courier_service_code || 
               item?.courier_service_type ||
               item?.courier_type || 
               item?.service_type || 
               item?.service_code || 
               item?.courier_service_name || 
               item?.type ||
               "";
  return String(type).toLowerCase().trim();
}

function deriveServiceTypeFallback(item: any) {
  const raw = normalizeServiceKey(
    item?.courier_service_code ||
      item?.courier_service_type ||
      item?.courier_type ||
      item?.service_type ||
      item?.service_code ||
      item?.courier_service_name ||
      item?.type ||
      ""
  );
  if (!raw) return "";
  if (raw.includes("instant")) return "instant";
  if (raw.includes("same_day") || raw.includes("sameday")) return "same_day";
  if (raw === "reg" || raw.includes("_reg") || raw.includes("reguler") || raw.includes("regular")) return "reg";
  return raw;
}

function resolveCourierSelection(pricing: any[], preferredProvider?: string, preferredService?: string) {
  if (!pricing || !Array.isArray(pricing) || pricing.length === 0) return null;

  const company = resolveCourierCompany(preferredProvider);
  const byCompany = pricing.filter((x) => matchCourierCompany(x, company));
  
  // If preferred company is not found, we will log it but continue to fallback
  if (preferredProvider && byCompany.length === 0) {
    console.warn(`[BITESHIP_RESOLVE] Preferred provider ${preferredProvider} not found in rates. Falling back to any available.`, {
      available: pricing.map(p => `${p.courier_name} ${p.courier_service_name}`).join(", ")
    });
  }

  const targetPool = byCompany.length > 0 ? byCompany : pricing;
  const preferred = normalizeServiceKey(preferredService);
  
  // 1. Try to find the exact service type or name in the target pool
  if (preferred && preferred !== "-") {
    const preferredMatch = targetPool.find((x) => {
      const type = normalizeServiceKey(getServiceType(x));
      const name = normalizeServiceKey(String(x?.courier_service_name || x?.courier_type || x?.service_type || ""));
      const fallback = deriveServiceTypeFallback(x);
      return type === preferred || name === preferred || fallback === preferred || type.includes(preferred) || name.includes(preferred);
    });
    if (preferredMatch) {
      const resolved = normalizeServiceKey(getServiceType(preferredMatch)) || deriveServiceTypeFallback(preferredMatch) || preferred;
      return {
        company: preferredMatch?.courier_code || preferredMatch?.courier_company || preferredMatch?.company || company,
        type: resolved
      };
    }
  }

  // 2. Fallback to first available from target pool (which is byCompany if possible, else anything)
  const fallback = targetPool.find(x => getServiceType(x)) || targetPool[0];
  if (fallback) {
    const type = normalizeServiceKey(getServiceType(fallback)) || deriveServiceTypeFallback(fallback);
    if (type) {
      return {
        company: fallback?.courier_code || fallback?.courier_company || fallback?.company || (byCompany.length > 0 ? company : "jne"),
        type: type
      };
    }
  }

  // 3. Last resort: If we have a preferred service but couldn't match anything, just use it
  if (preferred && preferred !== "-") {
    return { company: company || "jne", type: preferred };
  }

  return null;
}

async function createBiteshipDraftOrder(input: BiteshipCreateOrderInput) {
  const { store, order, items, destinationCoordinate } = input;
  const apiKey = await getApiKey(store);
  if (!apiKey) return { ok: false, error: "BITESHIP_KEY_MISSING" as const };

  const destinationAddress = String(order?.shippingAddress || "").trim();
  if (!destinationAddress) return { ok: false, error: "DESTINATION_ADDRESS_MISSING" as const };
  
  const resolveRecipientName = () => {
    const raw = String(order?.notes || "").trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const name = parsed?.recipientName;
      if (typeof name === "string" && name.trim()) return name.trim();
    } catch {
    }
    return null;
  };

  const destinationPostalMatch = destinationAddress.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
  const destinationPostalCode = destinationPostalMatch ? Number(destinationPostalMatch[1]) : undefined;
  const destinationAreaId = !destinationPostalCode
    ? await lookupBiteshipAreaIdFromInput(store, destinationAddress).catch(() => null)
    : null;

  const senderName = String(store?.shippingSenderName || store?.name || "Store").trim();
  const senderPhone = String(store?.shippingSenderPhone || store?.whatsapp || "").trim();
  const senderAddress = String(store?.shippingSenderAddress || "").trim();
  const senderPostalCode = store?.shippingSenderPostalCode ? Number(String(store.shippingSenderPostalCode).replace(/\D/g, "")) : undefined;
  const originAreaId = store?.biteshipOriginAreaId
    ? String(store.biteshipOriginAreaId)
    : await lookupBiteshipAreaIdFromInput(store, senderAddress).catch(() => null);
  const customerPhone = String(order?.customerPhone || "").trim();

  if (!senderPhone || !senderAddress || !senderPostalCode) {
    return { ok: false, error: "SENDER_ADDRESS_INCOMPLETE" as const };
  }

  const payload = {
    reference_id: `ORDER-${order.id}-${Date.now()}`,
    origin_contact_name: senderName,
    origin_contact_phone: senderPhone,
    origin_address: senderAddress,
    origin_postal_code: senderPostalCode,
    origin_area_id: originAreaId || undefined,
    origin_coordinate:
      typeof store?.biteshipOriginLat === "number" && typeof store?.biteshipOriginLng === "number"
        ? { latitude: store.biteshipOriginLat, longitude: store.biteshipOriginLng }
        : undefined,
    destination_contact_name: resolveRecipientName() || "Customer",
    destination_contact_phone: customerPhone || senderPhone,
    destination_address: destinationAddress,
    destination_postal_code: destinationPostalCode,
    destination_area_id: destinationAreaId || undefined,
    destination_coordinate: destinationCoordinate
      ? { latitude: destinationCoordinate.latitude, longitude: destinationCoordinate.longitude }
      : undefined,
    delivery_type: "now",
    items: (items && items.length > 0 ? items : [{ name: "Order Item", quantity: 1, price: 0, weight: 200 }]).map((item) => ({
      name: item?.name || "Order Item",
      description: "WhatsApp Order",
      value: Number(item?.price || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      weight: Math.max(1, Number(item?.weight || 200))
    }))
  };

  try {
    const createDraft = await fetch("https://api.biteship.com/v1/draft_orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey
      },
      body: JSON.stringify(payload)
    });
    const createDraftData = await createDraft.json();
    const draftOrderId = createDraftData?.id || createDraftData?.draft_order_id;
    if (!createDraft.ok || !draftOrderId) {
      return { ok: false, error: createDraftData?.error || "DRAFT_CREATE_FAILED", code: createDraftData?.code || createDraft.status };
    }
    return { ok: true as const, draftOrderId: String(draftOrderId), apiKey };
  } catch (error) {
    return { ok: false, error: "BITESHIP_DRAFT_EXCEPTION", detail: error instanceof Error ? error.message : String(error) };
  }
}

async function applyCourierToDraft(apiKey: string, draftOrderId: string, order: any, preferredProvider?: string, preferredService?: string) {
  const resolvePreferredService = () => {
    const raw = String(order?.notes || "").trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const courierType = parsed?.courierType;
        if (typeof courierType === "string" && courierType.trim()) return courierType.trim();
      } catch {
      }
    }
    return preferredService || order?.shippingService || "";
  };

  let pricing: any[] = [];
  let ratesData: any = {};
  
  // Retry mechanism for getting rates from Biteship draft
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ratesRes = await fetch(`https://api.biteship.com/v1/draft_orders/${encodeURIComponent(draftOrderId)}/rates`, {
      method: "GET",
      headers: { Authorization: apiKey }
    });
    ratesData = await ratesRes.json().catch(() => ({}));
    pricing = Array.isArray(ratesData?.pricing) 
      ? ratesData.pricing 
      : Array.isArray(ratesData?.data?.pricing) 
        ? ratesData.data.pricing 
        : Array.isArray(ratesData?.data)
          ? ratesData.data
          : [];

    if (pricing.length > 0) break;
    
    if (attempt < maxAttempts) {
      const delay = 1000 * attempt; // 1s, 2s
      console.log(`[BITESHIP_RETRY] Attempt ${attempt} failed for draft ${draftOrderId}. Retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  const resolvedProvider = preferredProvider || order?.shippingProvider;
  const resolvedService = resolvePreferredService();
  
  console.log(`[BITESHIP_APPLY] Draft: ${draftOrderId}, Order: ${order?.id}, Provider: ${resolvedProvider}, Service: ${resolvedService}, PricingCount: ${pricing.length}`);
  
  const selection = resolveCourierSelection(pricing, resolvedProvider, resolvedService);
  if (!selection?.type) {
    const errorMsg = pricing.length === 0 ? "NO_RATES_FOR_ADDRESS" : "COURIER_NOT_AVAILABLE";
    console.log("BITESHIP_COURIER_SELECTION_FAILED", {
      draftOrderId,
      orderId: order?.id,
      preferredProvider: resolvedProvider,
      preferredService: resolvedService,
      pricingCount: pricing.length,
      ratesData: JSON.stringify(ratesData).slice(0, 500) // Log first 500 chars of ratesData for debugging
    });
    return { ok: false, error: errorMsg as any, detail: { pricing, ratesData } };
  }

  const setCourierRes = await fetch(`https://api.biteship.com/v1/draft_orders/${encodeURIComponent(draftOrderId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey
    },
    body: JSON.stringify({
      courier_company: selection.company,
      courier_type: selection.type,
      origin_collection_method: "pickup"
    })
  });
  const setCourierData = await setCourierRes.json().catch(() => ({}));
  if (!setCourierRes.ok) {
    return { ok: false, error: setCourierData?.error || "SET_COURIER_FAILED", code: setCourierData?.code || setCourierRes.status };
  }
  return { ok: true as const };
}

export async function createBiteshipDraftForPendingOrder(input: BiteshipCreateOrderInput) {
  const created = await createBiteshipDraftOrder(input);
  if (!created.ok) return created;
  const draft = created as any;
  let applied = await applyCourierToDraft(draft.apiKey, draft.draftOrderId, input.order, input.order?.shippingProvider, input.order?.shippingService);
  if (!applied.ok) {
    await new Promise(r => setTimeout(r, 2000));
    applied = await applyCourierToDraft(draft.apiKey, draft.draftOrderId, input.order, input.order?.shippingProvider, input.order?.shippingService);
  }
  if (!applied.ok) {
    console.log("BITESHIP_DRAFT_COURIER_NOT_SET", {
      draftOrderId: draft.draftOrderId,
      orderId: input?.order?.id,
      error: (applied as any)?.error,
      code: (applied as any)?.code
    });
    return {
      ok: false,
      error: (applied as any)?.error || "COURIER_NOT_SET",
      code: (applied as any)?.code || null,
      draftOrderId: draft.draftOrderId,
      detail: (applied as any)?.detail || null
    };
  }
  return { ok: true, draftOrderId: draft.draftOrderId, shippingStatus: "courier_selected" as const, courierSelected: true };
}

export async function createBiteshipOrderForPaidOrder(input: BiteshipCreateOrderInput) {
  const { store, order, items } = input;
  const apiKey = await getApiKey(store);
  if (!apiKey) return { ok: false, error: "BITESHIP_KEY_MISSING" };

  try {
    let draftOrderId = String(order?.biteshipOrderId || "").trim();
    const currentStatus = normalizeBiteshipStatus(order?.shippingStatus || "");
    
    // 1. If no draft or cancelled, create new draft
    if (!draftOrderId || currentStatus === "cancelled") {
      const created = await createBiteshipDraftOrder({ store, order, items });
      if (!created.ok) return created;
      draftOrderId = String((created as any).draftOrderId || "");
    }

    // 2. Apply courier if not yet selected OR if we just created a new draft
    // Final states that should skip booking/applying: confirmed, allocated, picking_up, on_going, delivered, cancelled
    const finalStates = ["confirmed", "allocated", "picking_up", "on_going", "delivered", "cancelled"];
    const needsCourier = !finalStates.includes(currentStatus);

    if (needsCourier) {
       const applied = await applyCourierToDraft(apiKey, draftOrderId, order, order?.shippingProvider, order?.shippingService);
       if (!applied.ok) {
         return applied;
       }
    }

    // 3. Confirm the order (Book it) if not already confirmed
    if (!finalStates.includes(currentStatus)) {
      const confirmRes = await fetch(`https://api.biteship.com/v1/draft_orders/${encodeURIComponent(draftOrderId)}/confirm`, {
        method: "POST",
        headers: { Authorization: apiKey }
      });
      const confirmData = await confirmRes.json().catch(() => ({}));
      
      if (!confirmRes.ok) {
        return { 
          ok: false, 
          error: confirmData?.error || "CONFIRM_FAILED", 
          code: confirmData?.code || confirmRes.status,
          detail: confirmData
        };
      }

      const biteshipOrderId = confirmData?.id || confirmData?.order_id || confirmData?.order?.id || null;
      if (!biteshipOrderId) {
        return { ok: false, error: "NO_ORDER_ID_RETURNED", detail: confirmData };
      }

      const courier = confirmData?.courier || confirmData?.order?.courier || {};
       const trackingNo = courier?.waybill_id || courier?.courier_waybill_id || courier?.tracking_id || null;
       const status = normalizeBiteshipStatus(confirmData?.status || confirmData?.order?.status || "confirmed");
      const driverName =
        courier?.driver_name ||
        courier?.courier_name ||
        courier?.name ||
        confirmData?.courier?.name ||
        null;
      const driverPhone =
        courier?.driver_phone ||
        courier?.courier_phone ||
        courier?.phone ||
        confirmData?.courier?.phone ||
        null;
      const vehicleNumber = courier?.vehicle_number || courier?.plate_number || null;

      return {
        ok: true,
        biteshipOrderId,
        trackingNo,
        shippingStatus: status,
        driverName: driverName ? String(driverName) : null,
        driverPhone: driverPhone ? String(driverPhone) : null,
        vehicleNumber: vehicleNumber ? String(vehicleNumber) : null
      };
    }

    // If already confirmed, just return current data
    return {
      ok: true,
      biteshipOrderId: draftOrderId,
      trackingNo: order?.shippingTrackingNo || null,
      shippingStatus: currentStatus
    };
  } catch (error) {
    return {
      ok: false,
      error: "BITESHIP_ORDER_EXCEPTION",
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}

export { normalizeBiteshipStatus };
