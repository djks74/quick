const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

async function main() {
  const arg = process.argv.slice(2).find((v) => v && !v.startsWith("--"));
  const bySlug = process.argv.includes("--slug");
  const storeWhere = arg
    ? (bySlug ? { slug: String(arg) } : { id: Number(arg) })
    : {};

  const stores = await prisma.store.findMany({
    where: storeWhere,
    select: { id: true, slug: true, name: true }
  });

  if (stores.length === 0) {
    console.log("No stores found for the given filter.");
    return;
  }

  for (const store of stores) {
    const categories = await prisma.category.findMany({
      where: { storeId: store.id },
      select: { name: true, slug: true }
    });

    const slugSet = new Set(categories.map((c) => normalize(c.slug)));
    const nameToSlug = new Map(categories.map((c) => [normalize(c.name), String(c.slug)]));

    let totalUpdated = 0;
    for (const c of categories) {
      if (c?.name && c?.slug) {
        const updatedByName = await prisma.product.updateMany({
          where: {
            storeId: store.id,
            category: { equals: String(c.name), mode: "insensitive" }
          },
          data: { category: String(c.slug) }
        });
        totalUpdated += updatedByName.count || 0;
      }

      if (c?.slug) {
        const updatedBySlugCase = await prisma.product.updateMany({
          where: {
            storeId: store.id,
            category: { equals: String(c.slug), mode: "insensitive" }
          },
          data: { category: String(c.slug) }
        });
        totalUpdated += updatedBySlugCase.count || 0;
      }
    }

    const distinct = await prisma.product.findMany({
      where: {
        storeId: store.id,
        category: { notIn: ["_ARCHIVED_", "System"] }
      },
      distinct: ["category"],
      select: { category: true }
    });

    const unknown = [];
    for (const row of distinct) {
      const cat = row.category;
      if (!cat) continue;
      const n = normalize(cat);
      if (slugSet.has(n)) continue;
      if (nameToSlug.has(n)) continue;
      unknown.push(cat);
    }

    console.log(
      JSON.stringify(
        {
          storeId: store.id,
          slug: store.slug,
          name: store.name,
          categories: categories.length,
          updated: totalUpdated,
          unknownCategories: unknown.slice(0, 30),
          unknownCount: unknown.length
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

