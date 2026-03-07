
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Clear existing data
  await prisma.orderItem.deleteMany()
  await prisma.order.deleteMany()
  await prisma.product.deleteMany()
  await prisma.storeSettings.deleteMany()
  await prisma.user.deleteMany()

  console.log('Cleaned up existing data...')

  // Seed Store Settings
  await prisma.storeSettings.create({
    data: {
      storeName: "Ayam Bakar Pak Haji",
      whatsapp: "628123456789",
      themeColor: "#FF5733"
    }
  })

  // Seed Products (Warung/Restaurant Theme)
  const products = [
    {
      name: "Ayam Bakar Madu",
      price: 25000,
      image: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?w=800",
      category: "makanan",
      description: "Ayam bakar dengan olesan madu spesial, manis gurih meresap sampai tulang.",
      unit: "porsi",
      stock: 50,
      type: "simple"
    },
    {
      name: "Nasi Goreng Spesial",
      price: 22000,
      image: "https://images.unsplash.com/photo-1603133872878-684f208fb74b?w=800",
      category: "makanan",
      description: "Nasi goreng dengan telur, ayam suwir, dan ati ampela.",
      unit: "porsi",
      stock: 50,
      type: "simple"
    },
    {
      name: "Es Teh Manis",
      price: 5000,
      image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=800",
      category: "minuman",
      description: "Teh manis dingin segar.",
      unit: "gelas",
      stock: 100,
      type: "simple"
    },
    {
      name: "Es Jeruk",
      price: 8000,
      image: "https://images.unsplash.com/photo-1616118132534-381148898bb4?w=800",
      category: "minuman",
      description: "Jeruk peras asli dengan es batu.",
      unit: "gelas",
      stock: 100,
      type: "simple"
    },
    {
      name: "Kerupuk Putih",
      price: 2000,
      image: "https://upload.wikimedia.org/wikipedia/commons/2/25/Krupuk_in_jar.JPG",
      category: "tambahan",
      description: "Kerupuk kaleng renyah.",
      unit: "pcs",
      stock: 200,
      type: "simple"
    }
  ]

  for (const product of products) {
    await prisma.product.create({
      data: product
    })
  }

  // Create Admin User
  await prisma.user.create({
    data: {
      username: "admin",
      email: "admin@laku.com",
      name: "Pak Haji",
      role: "Administrator"
    }
  })

  console.log('Seeding finished.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
