import { prisma } from "@/lib/prisma";
import { getWaUsageDashboard } from "@/lib/wa-credit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getShippingQuoteFromBiteship } from "@/lib/shipping-biteship";

// Mock Transcription (Replace with OpenAI Whisper)
async function transcribeAudio(audioId: string): Promise<string | null> {
  console.log('TODO: Transcribe Audio ID:', audioId);
  return null;
}

export async function handleMerchantMessage(user: any, message: any, from: string, merchantSession?: any) {
  const textBody = message.text?.body || "";
  const audioId = message.audio?.id;
  const location = message.location;
  
  let commandText = textBody;

  if (audioId) {
    const transcribed = await transcribeAudio(audioId);
    if (transcribed) {
      commandText = transcribed;
      await sendWhatsAppMessage(from, `🎤 Hasil transkripsi: "${commandText}"`, user.stores[0]?.id || 0);
    } else {
      await sendWhatsAppMessage(from, `⚠️ Fitur transkripsi suara belum aktif. Silakan ketik perintah.`, user.stores[0]?.id || 0);
      return;
    }
  }

  // Identify Store Context
  const store = user.stores[0];
  if (!store) {
    await sendWhatsAppMessage(from, "Kamu belum punya toko yang terhubung.", 0);
    return;
  }

  const lowerText = commandText.toLowerCase().trim();
  const formatMoney = (value: number) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(Number(value) || 0))}`;
  const onOff = (value: boolean | null | undefined) => (value ? "ON" : "OFF");

  // 1. Help Command
  if (lowerText === 'help' || lowerText === 'menu') {
    await sendWhatsAppMessage(from, 
      `👨‍🍳 *Admin Mode (Merchant)*\n\n` +
      `Ketik salah satu perintah di bawah:\n\n` +
      `*Produk*\n` +
      `- Ubah harga [Nama] [Nominal]\n` +
      `  Contoh: "Ubah harga Nasi Goreng 25000"\n` +
      `- Tambah produk [Nama] [Nominal]\n` +
      `  Contoh: "Tambah produk Es Teh 5000"\n` +
      `- Daftar produk\n\n` +
      `*Pengiriman*\n` +
      `- Shipping option\n` +
      `- Set shipping jne on/off\n` +
      `- Set shipping gosend on/off\n` +
      `- Set jne only on/off\n\n` +
      `*Pembayaran*\n` +
      `- Payment option\n` +
      `- Set payment midtrans on/off\n` +
      `- Set payment transfer on/off\n\n` +
      `*Operasional*\n` +
      `- Buka toko / Tutup toko\n\n` +
      `*Keuangan & Report*\n` +
      `- WA balance\n` +
      `- Report\n` +
      `- Mau kirim barang (Order GoSend/JNE)\n\n` +
      `*Pengiriman (Manual)*\n` +
      `- Update resi [OrderID] [NoResi] [Kurir] [Service]\n` +
      `  Contoh: "Update resi 123 JX123456789 JNE REG"\n\n` +
      `*Bahasa*\n` +
      `- EN / ID`,
      store.id
    );
    return;
  }

  if (lowerText === "report" || lowerText === "laporan" || lowerText === "summary") {
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [pendingCount, pendingSum, paidCount, paidSum, cancelledCount, dash] = await Promise.all([
      prisma.order.count({ where: { storeId: store.id, status: "PENDING" } }),
      prisma.order.aggregate({ where: { storeId: store.id, status: "PENDING" }, _sum: { totalAmount: true } }),
      prisma.order.count({ where: { storeId: store.id, status: "PAID", createdAt: { gte: since } } }),
      prisma.order.aggregate({ where: { storeId: store.id, status: "PAID", createdAt: { gte: since } }, _sum: { totalAmount: true } }),
      prisma.order.count({ where: { storeId: store.id, status: "CANCELLED", createdAt: { gte: since } } }),
      getWaUsageDashboard(store.id).catch(() => null)
    ]);

    const msg =
      `📊 *Report (${store.name})*\n` +
      `Periode: 24 jam terakhir\n\n` +
      `*Order Pending (belum dibayar)*\n` +
      `- Jumlah: ${pendingCount}\n` +
      `- Total: ${formatMoney(Number(pendingSum?._sum?.totalAmount || 0))}\n\n` +
      `*Order Paid (24 jam)*\n` +
      `- Jumlah: ${paidCount}\n` +
      `- Total: ${formatMoney(Number(paidSum?._sum?.totalAmount || 0))}\n\n` +
      `*Cancelled (24 jam)*\n` +
      `- Jumlah: ${cancelledCount}\n\n` +
      `*Saldo Merchant*\n` +
      `- Balance: ${formatMoney(Number(store.balance || 0))}\n` +
      (dash
        ? `\n*WA Balance*\n- Saldo: ${formatMoney(dash.balance)}\n- Est. sisa msg: ${dash.remainingMessages}\n`
        : ``);

    await sendWhatsAppMessage(from, msg, store.id);
    return;
  }

  if (
    lowerText === "wa balance" ||
    lowerText === "saldo wa" ||
    lowerText === "saldo whatsapp" ||
    lowerText === "whatsapp balance"
  ) {
    const dash = await getWaUsageDashboard(store.id).catch(() => null);
    if (!dash) {
      await sendWhatsAppMessage(from, `❌ Gagal ambil WA balance. Coba lagi ya.`, store.id);
      return;
    }
    await sendWhatsAppMessage(
      from,
      `💬 *WA Balance (${store.name})*\n` +
        `Saldo: ${formatMoney(dash.balance)}\n` +
        `Harga/Msg: ${formatMoney(dash.pricePerMessage)}\n` +
        `Perkiraan sisa msg: ${dash.remainingMessages}\n\n` +
        `Balas "Report" untuk ringkasan order.`,
      store.id
    );
    return;
  }

  if (lowerText === "mau kirim barang" || lowerText === "kirim barang") {
    if (merchantSession) {
      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_RECIPIENT_NAME", cart: [] }
      });
    }
    await sendWhatsAppMessage(from, "📦 *Kirim Barang*\n\nSiapa nama penerimanya?", store.id);
    return;
  }

  // State Machine for Merchant Shipping
  if (merchantSession?.step?.startsWith("MERCHANT_SHIP_")) {
    const step = merchantSession.step;
    const cart = (merchantSession.cart as any[]) || [];

    if (step === "MERCHANT_SHIP_RECIPIENT_NAME") {
      const name = textBody.trim();
      if (!name) return;
      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_RECIPIENT_PHONE", cart: [{ recipientName: name }] }
      });
      await sendWhatsAppMessage(from, `👤 Penerima: *${name}*\n\nBerapa nomor teleponnya?`, store.id);
      return;
    }

    if (step === "MERCHANT_SHIP_RECIPIENT_PHONE") {
      const phone = textBody.replace(/\D/g, "");
      if (phone.length < 9) {
        await sendWhatsAppMessage(from, "❌ Nomor telepon tidak valid. Silakan kirim nomor yang benar.", store.id);
        return;
      }
      const updatedCart = [...cart];
      updatedCart[0].recipientPhone = phone;
      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_ADDRESS", cart: updatedCart }
      });
      await sendWhatsAppMessage(from, `📱 Nomor: *${phone}*\n\nKe mana alamat tujuannya? (Kirim teks alamat atau Share Location)`, store.id);
      return;
    }

    if (step === "MERCHANT_SHIP_ADDRESS") {
      let address = "";
      let lat: number | undefined;
      let lng: number | undefined;

      if (location) {
        lat = location.latitude;
        lng = location.longitude;
        address = location.address || location.name || "Lokasi via Share Location";
      } else {
        address = textBody.trim();
      }

      if (!address) return;

      const updatedCart = [...cart];
      updatedCart[0].address = address;
      if (lat) updatedCart[0].lat = lat;
      if (lng) updatedCart[0].lng = lng;

      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_ITEM_NAME", cart: updatedCart }
      });
      await sendWhatsAppMessage(from, `📍 Alamat: *${address}*\n\nApa nama barang yang dikirim?`, store.id);
      return;
    }

    if (step === "MERCHANT_SHIP_ITEM_NAME") {
      const itemName = textBody.trim();
      if (!itemName) return;
      const updatedCart = [...cart];
      updatedCart[0].itemName = itemName;
      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_ITEM_WEIGHT", cart: updatedCart }
      });
      await sendWhatsAppMessage(from, `📦 Barang: *${itemName}*\n\nBerapa beratnya dalam gram? (Contoh: 1000 untuk 1kg)`, store.id);
      return;
    }

    if (step === "MERCHANT_SHIP_ITEM_WEIGHT") {
      const weight = parseInt(textBody.replace(/\D/g, "")) || 1000;
      const updatedCart = [...cart];
      updatedCart[0].weight = weight;

      const shipInfo = updatedCart[0];
      await sendWhatsAppMessage(from, "⏳ Sedang mengecek ongkir...", store.id);

      try {
        const quotes = await getShippingQuoteFromBiteship({
          store,
          destinationAddress: shipInfo.address,
          destinationLatitude: shipInfo.lat,
          destinationLongitude: shipInfo.lng,
          weightGrams: weight
        });

        if (quotes.length === 0) {
          await sendWhatsAppMessage(from, "❌ Tidak ditemukan opsi pengiriman untuk alamat tersebut. Silakan ketik 'Mau kirim barang' untuk mengulang.", store.id);
          await prisma.whatsAppSession.update({
            where: { id: merchantSession.id },
            data: { step: "MERCHANT_MODE", cart: [] }
          });
          return;
        }

        let msg = `🚚 *Pilih Kurir*\n\n`;
        quotes.forEach((q, i) => {
          msg += `${i + 1}. ${q.provider} ${q.service} - ${formatMoney(q.fee)} (${q.eta})\n`;
        });
        msg += `\nBalas dengan nomor kurir (1-${quotes.length}).`;

        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_SHIP_OPTIONS", cart: updatedCart, metadata: quotes }
        });
        await sendWhatsAppMessage(from, msg, store.id);
      } catch (err) {
        console.error("Biteship Quote Error:", err);
        await sendWhatsAppMessage(from, "❌ Gagal mengecek ongkir. Pastikan Biteship API Key sudah benar.", store.id);
      }
      return;
    }

    if (step === "MERCHANT_SHIP_OPTIONS") {
      const index = parseInt(textBody.replace(/\D/g, "")) - 1;
      const quotes = merchantSession.metadata as any[];
      if (isNaN(index) || !quotes || !quotes[index]) {
        await sendWhatsAppMessage(from, `❌ Pilihan tidak valid. Silakan balas 1-${quotes?.length || 0}.`, store.id);
        return;
      }

      const selected = quotes[index];
      const updatedCart = [...cart];
      updatedCart[0].selectedCourier = selected;

      const info = updatedCart[0];
      const summary = 
        `📝 *Konfirmasi Pengiriman*\n\n` +
        `Penerima: ${info.recipientName}\n` +
        `Telp: ${info.recipientPhone}\n` +
        `Alamat: ${info.address}\n` +
        `Barang: ${info.itemName} (${info.weight}g)\n` +
        `Kurir: ${selected.provider} ${selected.service}\n` +
        `Ongkir: ${formatMoney(selected.fee)}\n\n` +
        `Ketik "OK" untuk konfirmasi booking.`;

      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_CONFIRM", cart: updatedCart }
      });
      await sendWhatsAppMessage(from, summary, store.id);
      return;
    }

    if (step === "MERCHANT_SHIP_CONFIRM") {
      if (lowerText !== "ok") {
        await sendWhatsAppMessage(from, 'Ketik "OK" untuk konfirmasi atau "Mau kirim barang" untuk mengulang.', store.id);
        return;
      }

      const info = cart[0];
      await sendWhatsAppMessage(from, "🚀 Sedang memproses booking...", store.id);

      try {
        const order = await prisma.order.create({
          data: {
            storeId: store.id,
            customerPhone: info.recipientPhone,
            shippingAddress: info.address,
            shippingProvider: info.selectedCourier.provider,
            shippingService: info.selectedCourier.service,
            totalAmount: 0,
            status: "PAID",
            paymentMethod: "manual",
            notes: `Merchant Shipment: ${info.itemName}`
          }
        });

        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });

        await sendWhatsAppMessage(from, `✅ Berhasil booking pengiriman!\nOrder ID: #${order.id}\n\nKurir akan segera memproses.`, store.id);
      } catch (err) {
        console.error("Merchant Booking Error:", err);
        await sendWhatsAppMessage(from, "❌ Gagal memproses booking. Silakan coba lagi nanti.", store.id);
      }
      return;
    }
  }

  if (
    lowerText === "shipping option" ||
    lowerText === "shipping options" ||
    lowerText === "opsi pengiriman" ||
    lowerText === "pengiriman"
  ) {
    await sendWhatsAppMessage(
      from,
      `🚚 *Shipping Option (${store.name})*\n\n` +
        `JNE: ${onOff(store.shippingEnableJne)}\n` +
        `GoSend: ${onOff(store.shippingEnableGosend)}\n` +
        `JNE Only: ${onOff(store.shippingJneOnly)}\n\n` +
        `Update:\n` +
        `- Set shipping jne on/off\n` +
        `- Set shipping gosend on/off\n` +
        `- Set jne only on/off`,
      store.id
    );
    return;
  }

  const setShippingMatch = lowerText.match(/^(?:set|ubah|update)\s+(?:shipping|pengiriman)\s+(jne|gosend|gojek)\s+(on|off|enable|disable)$/i);
  if (setShippingMatch) {
    const target = setShippingMatch[1].toLowerCase();
    const action = setShippingMatch[2].toLowerCase();
    const enabled = action === "on" || action === "enable";
    const updated = await prisma.store.update({
      where: { id: store.id },
      data:
        target === "jne"
          ? { shippingEnableJne: enabled }
          : { shippingEnableGosend: enabled }
    });
    await sendWhatsAppMessage(
      from,
      `✅ Shipping updated.\nJNE: ${onOff(updated.shippingEnableJne)}\nGoSend: ${onOff(updated.shippingEnableGosend)}\nJNE Only: ${onOff(updated.shippingJneOnly)}`,
      store.id
    );
    return;
  }

  const setJneOnlyMatch = lowerText.match(/^(?:set|ubah|update)\s+jne\s+only\s+(on|off|enable|disable)$/i);
  if (setJneOnlyMatch) {
    const action = setJneOnlyMatch[1].toLowerCase();
    const enabled = action === "on" || action === "enable";
    const updated = await prisma.store.update({
      where: { id: store.id },
      data: { shippingJneOnly: enabled }
    });
    await sendWhatsAppMessage(
      from,
      `✅ Shipping updated.\nJNE: ${onOff(updated.shippingEnableJne)}\nGoSend: ${onOff(updated.shippingEnableGosend)}\nJNE Only: ${onOff(updated.shippingJneOnly)}`,
      store.id
    );
    return;
  }

  if (
    lowerText === "payment option" ||
    lowerText === "payment options" ||
    lowerText === "opsi pembayaran" ||
    lowerText === "pembayaran"
  ) {
    await sendWhatsAppMessage(
      from,
      `💳 *Payment Option (${store.name})*\n\n` +
        `Midtrans: ${onOff(store.enableMidtrans)}\n` +
        `Manual Transfer: ${onOff(store.enableManualTransfer)}\n\n` +
        `Update:\n` +
        `- Set payment midtrans on/off\n` +
        `- Set payment transfer on/off`,
      store.id
    );
    return;
  }

  const setPaymentMatch = lowerText.match(/^(?:set|ubah|update)\s+(?:payment|pembayaran)\s+(midtrans|transfer|manual)\s+(on|off|enable|disable)$/i);
  if (setPaymentMatch) {
    const target = setPaymentMatch[1].toLowerCase();
    const action = setPaymentMatch[2].toLowerCase();
    const enabled = action === "on" || action === "enable";
    const updated = await prisma.store.update({
      where: { id: store.id },
      data:
        target === "midtrans"
          ? { enableMidtrans: enabled }
          : { enableManualTransfer: enabled }
    });
    await sendWhatsAppMessage(
      from,
      `✅ Payment updated.\nMidtrans: ${onOff(updated.enableMidtrans)}\nManual Transfer: ${onOff(updated.enableManualTransfer)}`,
      store.id
    );
    return;
  }

  if (lowerText === "buka toko" || lowerText === "open store" || lowerText === "open" || lowerText === "start") {
    const updated = await prisma.store.update({ where: { id: store.id }, data: { isOpen: true } });
    await sendWhatsAppMessage(from, `✅ Toko dibuka. Status: ${onOff(updated.isOpen)}`, store.id);
    return;
  }

  if (lowerText === "tutup toko" || lowerText === "close store" || lowerText === "close" || lowerText === "stop") {
    const updated = await prisma.store.update({ where: { id: store.id }, data: { isOpen: false } });
    await sendWhatsAppMessage(from, `✅ Toko ditutup. Status: ${onOff(updated.isOpen)}`, store.id);
    return;
  }

  // 2. List Products
  if (lowerText.includes('list product') || lowerText.includes('daftar produk')) {
    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      take: 10
    });
    let msg = `📦 *Produk (${store.name})*\n`;
    products.forEach(p => msg += `- ${p.name}: ${p.price}\n`);
    await sendWhatsAppMessage(from, msg, store.id);
    return;
  }

  const updateResiMatch = commandText.match(/(?:update|set|ubah)\s+resi\s+#?(\d+)\s+([A-Za-z0-9\-_.\/]+)(?:\s+([A-Za-z]+))?(?:\s+([A-Za-z0-9\-_.\/]+))?/i);
  if (updateResiMatch) {
    const orderId = parseInt(updateResiMatch[1], 10);
    const trackingNo = updateResiMatch[2];
    const providerInput = (updateResiMatch[3] || "").toUpperCase();
    const serviceInput = updateResiMatch[4] || "";
    const provider = providerInput === "GOSEND" || providerInput === "GOJEK" ? "GOSEND" : providerInput === "JNE" ? "JNE" : undefined;

    const order = await prisma.order.findFirst({
      where: { id: orderId, storeId: store.id }
    });
    if (!order) {
      await sendWhatsAppMessage(from, `❌ Order #${orderId} tidak ditemukan untuk toko ini.`, store.id);
      return;
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        shippingTrackingNo: trackingNo,
        shippingProvider: provider || order.shippingProvider || null,
        shippingService: serviceInput || order.shippingService || null,
        shippingStatus: "SHIPPED"
      }
    });

    await sendWhatsAppMessage(
      from,
      `✅ Resi untuk order #${orderId} berhasil diupdate.\nKurir: ${updated.shippingProvider || "-"} ${updated.shippingService || ""}\nResi: ${updated.shippingTrackingNo}`,
      store.id
    );

    await sendWhatsAppMessage(
      updated.customerPhone,
      `📦 Update Pengiriman Order #${orderId}\nKurir: ${updated.shippingProvider || "-"} ${updated.shippingService || ""}\nResi: ${updated.shippingTrackingNo}\n\nBalas "Cek Resi ${orderId}" kapan saja untuk lihat status terbaru.`,
      store.id
    );
    return;
  }

  // 3. Update Price
  const updateMatch = commandText.match(/(?:update|ubah)\s+(?:price|harga)\s+(.+?)\s+(\d+)/i);
  if (updateMatch) {
    const inputString = updateMatch[1].trim(); 
    const newPrice = parseInt(updateMatch[2]);

    const products = await prisma.product.findMany({
      where: { storeId: store.id },
      select: { id: true, name: true, variations: true, price: true }
    });

    const sortedProducts = products.sort((a, b) => b.name.length - a.name.length);
    const product = sortedProducts.find(p => inputString.toLowerCase().includes(p.name.toLowerCase()));

    if (product) {
      const remainder = inputString.replace(new RegExp(product.name, 'i'), '').trim();
      
      if (remainder && product.variations && Array.isArray(product.variations)) {
         const variations = product.variations as any[];
         const variationIndex = variations.findIndex(v => v.name.toLowerCase() === remainder.toLowerCase());
         
         if (variationIndex >= 0) {
            variations[variationIndex].price = newPrice;
            await prisma.product.update({
               where: { id: product.id },
               data: { variations: variations }
            });
            await sendWhatsAppMessage(from, `✅ Harga *${product.name} (${variations[variationIndex].name})* diubah jadi ${newPrice}`, store.id);
         } else {
            variations.push({ name: remainder, price: newPrice }); 
            await prisma.product.update({
               where: { id: product.id },
               data: { variations: variations }
            });
            await sendWhatsAppMessage(from, `✅ Varian *${remainder}* ditambahkan ke *${product.name}* dengan harga ${newPrice}`, store.id);
         }
      } else {
         await prisma.product.update({
            where: { id: product.id },
            data: { price: newPrice }
         });
         await sendWhatsAppMessage(from, `✅ Harga *${product.name}* diubah menjadi ${newPrice}`, store.id);
      }
    } else {
      await sendWhatsAppMessage(from, `❌ Produk dengan nama "${inputString}" tidak ditemukan.`, store.id);
    }
    return;
  }

  // 4. Add Product
  const addMatch = commandText.match(/(?:add|tambah)\s+(?:product|produk|menu)\s+(.+?)\s+(\d+)/i);
  if (addMatch) {
    const newName = addMatch[1].trim();
    const newPrice = parseInt(addMatch[2]);

    await prisma.product.create({
      data: {
        storeId: store.id,
        name: newName,
        price: newPrice,
        description: "Added via WhatsApp",
        stock: 100 
      }
    });
    await sendWhatsAppMessage(from, `✅ Produk baru *${newName}* ditambahkan dengan harga ${newPrice}`, store.id);
    return;
  }

  // Default
  await sendWhatsAppMessage(from, `Perintah tidak dikenali. Balas 'Help' atau 'Menu' untuk lihat opsi.`, store.id);
}
