
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.trafficLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  const filtered = logs.filter((l: any) => l.metadata?.event === 'AI_CHAT');
  console.log(JSON.stringify(filtered, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
