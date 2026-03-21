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

  return <DashboardClient stores={dbUser.stores} user={user} />;
}
