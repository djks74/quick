import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DigitalMenuClient from "@/components/DigitalMenuClient";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { logTraffic } from "@/lib/traffic";

export const revalidate = 60; // Revalidate every minute (ISR)

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await ensureStoreSettingsSchema();

  const store = await prisma.store.findUnique({
    where: { slug },
    include: { categories: true }
  });

  if (!store) {
    notFound();
  }

  // Log Web Traffic
  await logTraffic(store.id, "WEB");

  const productsData = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      price: true,
      unit: true,
      image: true,
      description: true,
      category: true,
      variations: true
    }
  });

  // Serialize and prepare data efficiently
  const categories = store.categories.map((c: any) => ({
    id: c.id,
    name: c.name,
    slug: c.slug
  }));

  const products = productsData.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    unit: p.unit,
    image: p.image,
    description: p.description,
    category: p.category,
    variations: p.variations
  }));

  const storeData = {
    id: store.id,
    name: store.name,
    slug: store.slug,
    whatsapp: store.whatsapp,
    themeColor: store.themeColor,
    taxPercent: store.taxPercent,
    serviceChargePercent: store.serviceChargePercent,
    qrisFeePercent: store.qrisFeePercent,
    manualTransferFee: store.manualTransferFee,
    feePaidBy: store.feePaidBy,
    enableWhatsApp: store.enableWhatsApp,
    enableMidtrans: store.enableMidtrans,
    enableManualTransfer: store.enableManualTransfer,
    enableTakeawayDelivery: store.enableTakeawayDelivery,
    shippingEnableJne: store.shippingEnableJne,
    shippingEnableGosend: store.shippingEnableGosend,
    shippingJneOnly: store.shippingJneOnly,
    isOpen: store.isOpen
  };

  return <DigitalMenuClient products={products} store={storeData} categories={categories} />;
}
