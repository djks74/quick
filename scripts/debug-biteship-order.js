const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const orderId = Number(process.argv[2] || 55);
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    console.log("Order not found", orderId);
    return;
  }

  const store = await prisma.store.findUnique({ where: { id: order.storeId } });
  const platform = await prisma.platformSettings
    .findUnique({ where: { key: "default" } })
    .catch(() => null);

  const apiKey =
    (store && store.biteshipApiKey) ||
    (platform && platform.biteshipApiKey) ||
    process.env.BITESHIP_API_KEY ||
    "";

  console.log("ORDER", {
    id: order.id,
    storeId: order.storeId,
    orderType: order.orderType,
    shippingProvider: order.shippingProvider,
    shippingService: order.shippingService,
    shippingCost: order.shippingCost,
    shippingEta: order.shippingEta,
    shippingStatus: order.shippingStatus,
    biteshipOrderId: order.biteshipOrderId,
    shippingAddress: order.shippingAddress,
    customerPhone: order.customerPhone,
  });

  console.log("STORE", store ? {
    id: store.id,
    slug: store.slug,
    shippingEnableGosend: store.shippingEnableGosend,
    shippingEnableJne: store.shippingEnableJne,
    shippingJneOnly: store.shippingJneOnly,
    biteshipOriginAreaId: store.biteshipOriginAreaId,
    shippingSenderName: store.shippingSenderName,
    shippingSenderPhone: store.shippingSenderPhone,
    shippingSenderAddress: store.shippingSenderAddress,
    shippingSenderPostalCode: store.shippingSenderPostalCode,
    hasBiteshipKey: !!store.biteshipApiKey,
  } : null);

  if (!apiKey) {
    console.log("No BITESHIP api key available");
    return;
  }

  const draftId = String(order.biteshipOrderId || "").trim();
  if (!draftId) {
    console.log("Order has no biteshipOrderId (draft id)");
    return;
  }

  const res = await fetch(
    `https://api.biteship.com/v1/draft_orders/${encodeURIComponent(draftId)}/rates`,
    { method: "GET", headers: { Authorization: apiKey } }
  );
  const text = await res.text();
  console.log("RATES status", res.status);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  const pricing = Array.isArray(data?.pricing)
    ? data.pricing
    : Array.isArray(data?.data?.pricing)
      ? data.data.pricing
      : Array.isArray(data?.data)
        ? data.data
        : [];

  console.log("pricing_count", pricing.length);
  console.log(
    "pricing_sample",
    pricing.slice(0, 12).map((x) => ({
      courier_company: x.courier_company,
      courier_name: x.courier_name,
      courier_code: x.courier_code,
      courier_service_name: x.courier_service_name,
      courier_service_code: x.courier_service_code,
      courier_type: x.courier_type,
      service_type: x.service_type,
      price: x.price,
      final_price: x.final_price,
      duration: x.duration,
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

