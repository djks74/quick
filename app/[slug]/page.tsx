import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DigitalMenuClient from "@/components/DigitalMenuClient";

export const dynamic = 'force-dynamic';

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const store = await prisma.store.findUnique({
    where: { slug },
    include: { categories: true }
  });

  if (!store) {
    notFound();
  }

  const productsData = await prisma.product.findMany({
    where: { storeId: store.id },
    orderBy: { name: 'asc' }
  });

  // Serialize data
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

  return <DigitalMenuClient products={products} store={store} categories={store.categories || []} />;
}
