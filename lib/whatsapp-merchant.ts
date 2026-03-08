import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

// Mock Transcription (Replace with OpenAI Whisper)
async function transcribeAudio(audioId: string): Promise<string | null> {
  console.log('TODO: Transcribe Audio ID:', audioId);
  // In real implementation:
  // 1. Fetch media URL from Facebook Graph API
  // 2. Download file
  // 3. Send to OpenAI Whisper API
  return null;
}

export async function handleMerchantMessage(user: any, message: any, from: string) {
  const textBody = message.text?.body || "";
  const audioId = message.audio?.id;
  
  let commandText = textBody;

  if (audioId) {
    const transcribed = await transcribeAudio(audioId);
    if (transcribed) {
      commandText = transcribed;
      await sendWhatsAppMessage(from, `🎤 Transcribed: "${commandText}"`, user.stores[0]?.id || 0);
    } else {
      await sendWhatsAppMessage(from, `⚠️ Voice transcription is not configured yet. Please type your command.`, user.stores[0]?.id || 0);
      return;
    }
  }

  // Identify Store Context
  // For MVP, if user has 1 store, use it. If multiple, just use first one or ask (simpler: use first).
  const store = user.stores[0];
  if (!store) {
    await sendWhatsAppMessage(from, "You don't have any stores connected.", 0);
    return;
  }

  const lowerText = commandText.toLowerCase().trim();

  // 1. Help Command
  if (lowerText === 'help' || lowerText === 'menu') {
    await sendWhatsAppMessage(from, 
      `👨‍🍳 *Merchant Bot* 👨‍🍳\n\n` +
      `Commands:\n` +
      `1. *Update Price*: "Update price [Name] [Amount]"\n` +
      `   Example: "Update price Nasi Goreng 25000"\n` +
      `2. *Add Product*: "Add product [Name] [Amount]"\n` +
      `   Example: "Add product Es Teh 5000"\n` +
      `3. *List Products*: "List products"`,
      store.id
    );
    return;
  }

  // 2. List Products
  if (lowerText.includes('list product')) {
    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      take: 10
    });
    let msg = `📦 *Products (${store.name})*\n`;
    products.forEach(p => msg += `- ${p.name}: ${p.price}\n`);
    await sendWhatsAppMessage(from, msg, store.id);
    return;
  }

  // 3. Update Price
  // Regex: update price <name> <amount>
  const updateMatch = commandText.match(/(?:update|ubah)\s+(?:price|harga)\s+(.+?)\s+(\d+)/i);
  if (updateMatch) {
    const productName = updateMatch[1].trim();
    const newPrice = parseInt(updateMatch[2]);

    // Fuzzy Search
    const product = await prisma.product.findFirst({
      where: {
        storeId: store.id,
        name: { contains: productName, mode: 'insensitive' }
      }
    });

    if (product) {
      await prisma.product.update({
        where: { id: product.id },
        data: { price: newPrice }
      });
      await sendWhatsAppMessage(from, `✅ Updated *${product.name}* price to ${newPrice}`, store.id);
    } else {
      await sendWhatsAppMessage(from, `❌ Product "${productName}" not found.`, store.id);
    }
    return;
  }

  // 4. Add Product
  // Regex: add product <name> <amount>
  const addMatch = commandText.match(/(?:add|tambah)\s+(?:product|produk|menu)\s+(.+?)\s+(\d+)/i);
  if (addMatch) {
    const newName = addMatch[1].trim();
    const newPrice = parseInt(addMatch[2]);

    await prisma.product.create({
      data: {
        storeId: store.id,
        name: newName,
        price: newPrice,
        description: "Added via WhatsApp"
      }
    });
    await sendWhatsAppMessage(from, `✅ Added new product *${newName}* at ${newPrice}`, store.id);
    return;
  }

  // Default
  await sendWhatsAppMessage(from, `Unknown command. Reply 'Help' for options.`, store.id);
}
