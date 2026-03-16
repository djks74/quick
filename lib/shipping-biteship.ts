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
  weightGrams?: number;
};

type BiteshipCreateOrderInput = {
  store: any;
  order: any;
  items: Array<{ name?: string; quantity?: number; price?: number }>;
};

function parseCourierProvider(value?: string): "JNE" | "GOSEND" | null {
  const text = (value || "").toLowerCase();
  if (text.includes("jne")) return "JNE";
  if (text.includes("gojek") || text.includes("gosend")) return "GOSEND";
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

async function getApiKey(store: any) {
  if (store?.biteshipApiKey) return store.biteshipApiKey;
  try {
    const platform = await prisma.platformSettings.findUnique({
      where: { key: "default" },
      select: { biteshipApiKey: true }
    });
    if (platform?.biteshipApiKey) return platform.biteshipApiKey;
  } catch {
  }
  return process.env.BITESHIP_API_KEY || "";
}

function getFallbackOptions(store: any): ShippingOption[] {
  const options: ShippingOption[] = [];
  if (store?.shippingEnableGosend && !store?.shippingJneOnly) {
    options.push({
      provider: "GOSEND",
      service: "Instant",
      fee: 18000,
      eta: "1-3 jam",
      type: "instant"
    });
  }
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

  let postal = input.destinationPostalCode;
  if (!postal) {
    const match = String(input.destinationAddress || "").match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
    if (match) postal = match[1];
  }

  const payload = {
    origin_area_id: store?.biteshipOriginAreaId || undefined,
    destination_postal_code: postal || undefined,
    destination_address: input.destinationAddress,
    couriers: [store?.shippingEnableJne ? "jne" : null, store?.shippingEnableGosend && !store?.shippingJneOnly ? "gojek" : null].filter(Boolean).join(","),
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
      return getFallbackOptions(store);
    }

    const data = await response.json();
    const pricing = Array.isArray(data?.pricing) ? data.pricing : Array.isArray(data?.data?.pricing) ? data.data.pricing : [];
    const mapped: ShippingOption[] = pricing
      .map((item: any) => {
        const provider = parseCourierProvider(item?.courier_company || item?.courier_name || item?.courier_code);
        if (!provider) return null;
        if (provider === "JNE" && !store?.shippingEnableJne) return null;
        if (provider === "GOSEND" && (!store?.shippingEnableGosend || store?.shippingJneOnly)) return null;
        const fee = Number(item?.price || item?.final_price || item?.amount || 0);
        return {
          provider,
          service: String(item?.courier_service_name || item?.courier_type || item?.service_type || "-"),
          fee: Number.isFinite(fee) ? fee : 0,
          eta: parseEta(item),
          type: provider === "GOSEND" ? "instant" : "regular"
        } as ShippingOption;
      })
      .filter(Boolean);

    if (mapped.length === 0) return getFallbackOptions(store);
    return mapped.sort((a, b) => a.fee - b.fee);
  } catch {
    return getFallbackOptions(store);
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
               item?.courier_type || 
               item?.service_type || 
               item?.service_code || 
               item?.courier_service_name || 
               item?.type ||
               "";
  return String(type).toLowerCase().trim();
}

function resolveCourierSelection(pricing: any[], preferredProvider?: string, preferredService?: string) {
  if (!pricing || !Array.isArray(pricing) || pricing.length === 0) return null;

  const company = resolveCourierCompany(preferredProvider);
  const byCompany = pricing.filter((x) => matchCourierCompany(x, company));
  const targetPool = byCompany.length > 0 ? byCompany : pricing;

  const preferred = String(preferredService || "").toLowerCase().trim();
  
  // 1. Try to find the exact service type or name
  if (preferred && preferred !== "-") {
    const preferredMatch = targetPool.find((x) => {
      const type = getServiceType(x);
      const name = String(x?.courier_service_name || x?.courier_type || x?.service_type || "").toLowerCase();
      return type === preferred || name === preferred || type.includes(preferred) || name.includes(preferred);
    });
    if (preferredMatch && getServiceType(preferredMatch)) {
      return {
        company: preferredMatch?.courier_code || preferredMatch?.courier_company || preferredMatch?.company || company,
        type: getServiceType(preferredMatch)
      };
    }
  }

  // 2. Fallback to first available from preferred company
  if (byCompany.length > 0) {
    const fallback = byCompany.find(x => getServiceType(x)) || byCompany[0];
    const type = getServiceType(fallback);
    if (type) {
      return {
        company: fallback?.courier_code || fallback?.courier_company || fallback?.company || company,
        type: type
      };
    }
  }

  // 3. Fallback to absolutely any available service
  const absoluteFallback = pricing.find(x => getServiceType(x)) || pricing[0];
  const absType = getServiceType(absoluteFallback);
  if (absType) {
    return {
      company: absoluteFallback?.courier_code || absoluteFallback?.courier_company || absoluteFallback?.company || "jne",
      type: absType
    };
  }

  return null;
}

async function createBiteshipDraftOrder(input: BiteshipCreateOrderInput) {
  const { store, order, items } = input;
  const apiKey = await getApiKey(store);
  if (!apiKey) return { ok: false, error: "BITESHIP_KEY_MISSING" as const };

  const destinationAddress = String(order?.shippingAddress || "").trim();
  if (!destinationAddress) return { ok: false, error: "DESTINATION_ADDRESS_MISSING" as const };

  const destinationPostalMatch = destinationAddress.match(/\b(\d{5})\b(?!.*\b\d{5}\b)/);
  const destinationPostalCode = destinationPostalMatch ? Number(destinationPostalMatch[1]) : undefined;

  const senderName = String(store?.shippingSenderName || store?.name || "Store").trim();
  const senderPhone = String(store?.shippingSenderPhone || store?.whatsapp || "").trim();
  const senderAddress = String(store?.shippingSenderAddress || "").trim();
  const senderPostalCode = store?.shippingSenderPostalCode ? Number(String(store.shippingSenderPostalCode).replace(/\D/g, "")) : undefined;
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
    destination_contact_name: "Customer",
    destination_contact_phone: customerPhone || senderPhone,
    destination_address: destinationAddress,
    destination_postal_code: destinationPostalCode,
    delivery_type: "now",
    items: (items || []).map((item) => ({
      name: item?.name || "Order Item",
      description: "WhatsApp Order",
      value: Number(item?.price || 0),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      weight: 200 // Use more realistic weight (200g per item)
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
  let ratesRes = await fetch(`https://api.biteship.com/v1/draft_orders/${encodeURIComponent(draftOrderId)}/rates`, {
    method: "GET",
    headers: { Authorization: apiKey }
  });
  let ratesData = await ratesRes.json().catch(() => ({}));
  let pricing = Array.isArray(ratesData?.pricing) 
    ? ratesData.pricing 
    : Array.isArray(ratesData?.data?.pricing) 
      ? ratesData.data.pricing 
      : Array.isArray(ratesData?.data)
        ? ratesData.data
        : [];

  // Small retry if pricing is empty (sometimes Biteship takes a moment to process the draft)
  if (pricing.length === 0) {
    await new Promise(r => setTimeout(r, 800));
    ratesRes = await fetch(`https://api.biteship.com/v1/draft_orders/${encodeURIComponent(draftOrderId)}/rates`, {
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
  }

  const selection = resolveCourierSelection(pricing, preferredProvider || order?.shippingProvider, preferredService || order?.shippingService);
  if (!selection?.type) {
    const errorMsg = pricing.length === 0 ? "NO_RATES_FOR_ADDRESS" : "COURIER_NOT_AVAILABLE";
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
  const applied = await applyCourierToDraft(draft.apiKey, draft.draftOrderId, input.order, input.order?.shippingProvider, input.order?.shippingService);
  if (!applied.ok) {
    return { ok: true, draftOrderId: draft.draftOrderId, shippingStatus: "draft_created" as const };
  }
  return { ok: true, draftOrderId: draft.draftOrderId, shippingStatus: "courier_selected" as const };
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

      return {
        ok: true,
        biteshipOrderId,
        trackingNo,
        shippingStatus: status
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
