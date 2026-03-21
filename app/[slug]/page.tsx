import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DigitalMenuClient from "@/components/DigitalMenuClient";
import { ensureStoreSettingsSchema } from "@/lib/store-settings-schema";
import { logTraffic } from "@/lib/traffic";
import { isStoreOpen } from "@/lib/api";

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

  // Check if store is open based on schedule and manual toggle
  const isOpen = await isStoreOpen(store);

  // Handle Disabled Store
  if (!store.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black p-6">
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tighter">Temporarily Unavailable</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium max-w-xs mx-auto">This store is currently inactive. Please check back later or contact the business owner.</p>
        </div>
      </div>
    );
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
    isOpen: isOpen,
    manualOpen: store.isOpen
  };

  return <DigitalMenuClient products={products} store={storeData} categories={categories} />;
}
