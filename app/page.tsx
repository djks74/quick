import { prisma } from "@/lib/prisma";
import DigitalMenuClient from "@/components/DigitalMenuClient";

export const dynamic = 'force-dynamic';

// Server Component for Digital Menu
export default async function DigitalMenu() {
  const productsData = await prisma.product.findMany({
    where: { stock: { gt: 0 } },
    orderBy: { name: 'asc' }
  });

  // Serialize data to avoid passing complex objects (like Date) to Client Component
  const products = productsData.map((p: any) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    unit: p.unit,
    image: p.image,
    description: p.description,
    category: p.category
  }));

  return <DigitalMenuClient products={products} />;
}
