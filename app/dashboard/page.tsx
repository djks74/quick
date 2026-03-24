import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = (session as any).user;
  const dbUser = await prisma.user.findUnique({
    where: { id: parseInt(user.id) },
    include: {
      stores: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!dbUser) redirect("/login");

  const storeIds = dbUser.stores.map((s) => s.id);

  const productCounts = storeIds.length
    ? await prisma.product.groupBy({
        by: ["storeId"],
        where: {
          storeId: { in: storeIds },
          category: { not: "_ARCHIVED_" }
        },
        _count: { _all: true }
      })
    : [];

  const countMap = new Map<number, number>();
  for (const row of productCounts) {
    countMap.set(row.storeId, row._count._all);
  }

  const storesWithCounts = dbUser.stores.map((s) => ({
    ...s,
    productCount: countMap.get(s.id) || 0
  }));

  return <DashboardClient stores={storesWithCounts} user={user} />;
}
