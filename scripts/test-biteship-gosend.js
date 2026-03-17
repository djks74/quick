const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fetchJson(url, apiKey, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: apiKey,
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function main() {
  const storeId = Number(process.argv[2] || 1);
  const originPostal = String(process.argv[3] || "11330");
  const destPostal = String(process.argv[4] || "11330");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  const platform = await prisma.platformSettings
    .findUnique({ where: { key: "default" } })
    .catch(() => null);
  const apiKey =
    (store && store.biteshipApiKey) ||
    (platform && platform.biteshipApiKey) ||
    process.env.BITESHIP_API_KEY ||
    "";

  if (!apiKey) {
    console.log("No BITESHIP api key available");
    return;
  }

  const originAreas = await fetchJson(
    `https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(originPostal)}&type=single`,
    apiKey
  );
  const destAreas = await fetchJson(
    `https://api.biteship.com/v1/maps/areas?countries=ID&input=${encodeURIComponent(destPostal)}&type=single`,
    apiKey
  );

  const originAreaId = originAreas.json?.areas?.[0]?.id;
  const destAreaId = destAreas.json?.areas?.[0]?.id;

  console.log("origin_area_lookup", { status: originAreas.status, originPostal, originAreaId });
  console.log("dest_area_lookup", { status: destAreas.status, destPostal, destAreaId });

  const items = [
    { name: "Test Item", description: "Test", value: 10000, weight: 200, quantity: 1 },
  ];

  const payloadByArea = {
    origin_area_id: originAreaId,
    destination_area_id: destAreaId,
    couriers: "gojek",
    items,
  };

  const payloadByPostal = {
    origin_postal_code: Number(originPostal),
    destination_postal_code: Number(destPostal),
    couriers: "gojek",
    items,
  };

  const ratesArea = await fetchJson("https://api.biteship.com/v1/rates/couriers", apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadByArea),
  });

  const ratesPostal = await fetchJson("https://api.biteship.com/v1/rates/couriers", apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadByPostal),
  });

  console.log("rates_by_area_status", ratesArea.status);
  if (ratesArea.status !== 200) console.log("rates_by_area_error", ratesArea.json);
  console.log(
    "rates_by_area_pricing_count",
    Array.isArray(ratesArea.json?.pricing) ? ratesArea.json.pricing.length : 0
  );
  console.log(
    "rates_by_area_pricing_sample",
    (ratesArea.json?.pricing || []).slice(0, 5).map((x) => ({
      courier_name: x.courier_name,
      courier_code: x.courier_code,
      courier_service_name: x.courier_service_name,
      courier_service_code: x.courier_service_code,
      service_type: x.service_type,
      price: x.price,
      duration: x.duration,
    }))
  );

  console.log("rates_by_postal_status", ratesPostal.status);
  if (ratesPostal.status !== 200) console.log("rates_by_postal_error", ratesPostal.json);
  console.log(
    "rates_by_postal_pricing_count",
    Array.isArray(ratesPostal.json?.pricing) ? ratesPostal.json.pricing.length : 0
  );
  console.log(
    "rates_by_postal_pricing_sample",
    (ratesPostal.json?.pricing || []).slice(0, 5).map((x) => ({
      courier_name: x.courier_name,
      courier_code: x.courier_code,
      courier_service_name: x.courier_service_name,
      courier_service_code: x.courier_service_code,
      service_type: x.service_type,
      price: x.price,
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
