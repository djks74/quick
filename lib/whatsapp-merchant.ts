import { prisma } from "@/lib/prisma";
import { getWaUsageDashboard } from "@/lib/wa-credit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { ensureWaCreditSchema } from "@/lib/wa-credit";
import { createPaymentLink } from "@/lib/payment";
import { createBiteshipDraftForPendingOrder, createBiteshipOrderForPaidOrder, getShippingQuoteFromBiteship } from "@/lib/shipping-biteship";

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
      `- Set jne only on/off\n` +
      `- Mau kirim barang (Order GoSend/JNE)\n\n` +
      `*Pembayaran & Tagihan*\n` +
      `- Payment option\n` +
      `- Set payment midtrans on/off\n` +
      `- Set payment transfer on/off\n` +
      `- Mau kirim tagihan (Kirim link bayar)\n\n` +
      `*Operasional*\n` +
      `- Buka toko / Tutup toko\n\n` +
      `*Keuangan & Report*\n` +
      `- WA balance\n` +
      `- Report\n\n` +
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
    await prisma.whatsAppSession.upsert({
      where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } },
      update: { step: "MERCHANT_SHIP_RECIPIENT_NAME", cart: [] },
      create: { phoneNumber: from, storeId: 0, step: "MERCHANT_SHIP_RECIPIENT_NAME", cart: [] }
    });
    await sendWhatsAppMessage(from, "📦 *Kirim Barang*\n\nSiapa nama penerimanya?", store.id);
    return;
  }

  if (lowerText === "mau kirim tagihan" || lowerText === "kirim tagihan" || lowerText === "buat tagihan") {
    await prisma.whatsAppSession.upsert({
      where: { phoneNumber_storeId: { phoneNumber: from, storeId: 0 } },
      update: { step: "MERCHANT_INVOICE_PHONE", cart: [] },
      create: { phoneNumber: from, storeId: 0, step: "MERCHANT_INVOICE_PHONE", cart: [] }
    });
    await sendWhatsAppMessage(from, "💳 *Kirim Tagihan*\n\nBerapa nomor WhatsApp yang mau ditagih? (Contoh: 08123456789)", store.id);
    return;
  }

  // State Machine for Merchant Shipping & Invoicing
  if (merchantSession?.step?.startsWith("MERCHANT_SHIP_") || merchantSession?.step?.startsWith("MERCHANT_INVOICE_")) {
    const step = merchantSession.step;
    const cart = (merchantSession.cart as any[]) || [];

    // --- MERCHANT_INVOICE Steps ---
    if (step === "MERCHANT_INVOICE_PHONE") {
      const phone = textBody.replace(/\D/g, "");
      if (phone.length < 9) {
        await sendWhatsAppMessage(from, "❌ Nomor telepon tidak valid. Silakan kirim nomor yang benar.", store.id);
        return;
      }
      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_INVOICE_AMOUNT", cart: [{ targetPhone: phone }] }
      });
      await sendWhatsAppMessage(from, `📱 Nomor: *${phone}*\n\nBerapa nominal tagihannya? (Hanya angka, contoh: 50000)`, store.id);
      return;
    }

    if (step === "MERCHANT_INVOICE_AMOUNT") {
      const amount = parseInt(textBody.replace(/\D/g, "")) || 0;
      if (amount < 1000) {
        await sendWhatsAppMessage(from, "❌ Nominal minimal Rp 1.000.", store.id);
        return;
      }
      const updatedCart = [...cart];
      updatedCart[0].amount = amount;
      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_INVOICE_CONFIRM", cart: updatedCart }
      });
      await sendWhatsAppMessage(
        from,
        `📝 *Konfirmasi Tagihan*\n\n` +
          `Ke: ${updatedCart[0].targetPhone}\n` +
          `Nominal: ${formatMoney(amount)}\n\n` +
          `Ketik "OK" untuk kirim tagihan.`,
        store.id
      );
      return;
    }

    if (step === "MERCHANT_INVOICE_CONFIRM") {
      if (lowerText !== "ok") {
        await sendWhatsAppMessage(from, 'Ketik "OK" untuk kirim atau "Mau kirim tagihan" untuk mengulang.', store.id);
        return;
      }
      const info = cart[0];
      const amount = Number(info.amount);
      const targetPhone = String(info.targetPhone);

      const order = await prisma.order.create({
        data: {
          storeId: store.id,
          customerPhone: targetPhone,
          totalAmount: amount,
          status: "PENDING",
          orderType: "TAKEAWAY",
          paymentMethod: null,
          notes: JSON.stringify({ kind: "MERCHANT_INVOICE", requestedBy: from })
        } as any
      });

      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_PAYMENT_METHOD", cart: [{ ...info, orderId: order.id, isInvoice: true }] }
      });

      await sendWhatsAppMessage(
        from,
        `✅ Tagihan # ${order.id} dibuat.\n` +
          `Nominal: ${formatMoney(amount)}\n\n` +
          `Pilih metode pembayaran untuk dikirim ke customer:\n` +
          `1) WA Credit (Langsung lunas)\n` +
          `2) QRIS (Fee 1%)\n` +
          `3) Transfer Bank (Fee Rp 5.000)\n\n` +
          `Balas: 1 / 2 / 3`,
        store.id
      );
      return;
    }

    // --- MERCHANT_SHIP Steps ---
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
      await sendWhatsAppMessage(from, `📱 Nomor: *${phone}*\n\n📍 Ke mana alamat tujuannya?\nKirim *teks alamat + kode pos (5 digit)* atau *Share Location*.`, store.id);
      return;
    }

    if (step === "MERCHANT_SHIP_ADDRESS") {
      const updatedCart = [...cart];
      const info = updatedCart[0] || {};
      
      let lat = info.lat;
      let lng = info.lng;
      let address = info.address || "";

      if (location) {
        lat = location.latitude;
        lng = location.longitude;
        const locAddr = (location.address || location.name || "").trim();
        if (locAddr && !locAddr.toLowerCase().includes("lokasi via share location")) {
          address = locAddr;
        }
        updatedCart[0].lat = lat;
        updatedCart[0].lng = lng;
        if (address) updatedCart[0].address = address;
      } else {
        const text = textBody.trim();
        if (text) {
          address = text;
          updatedCart[0].address = address;
        }
      }

      const hasPostal = /\b\d{5}\b/.test(address);
      const hasCoords = !!(lat && lng);

      // 1. Both satisfied -> Move to next
      if (hasPostal && hasCoords) {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_SHIP_ITEM_NAME", cart: updatedCart }
        });
        await sendWhatsAppMessage(from, `✅ Lokasi & Alamat diterima.\n📍 Alamat: *${address}*\n\nApa nama barang yang dikirim?`, store.id);
        return;
      }

      // 2. Only location satisfied -> Ask for text
      if (hasCoords && !hasPostal) {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { cart: updatedCart }
        });
        await sendWhatsAppMessage(from, "📍 Lokasi diterima.\nSekarang ketik *alamat lengkap + kode pos (5 digit)*.\n\nContoh: \"Jl. Sudirman No 1, Bandung 40111\"", store.id);
        return;
      }

      // 3. Only text satisfied -> Ask for location
      if (hasPostal && !hasCoords) {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { cart: updatedCart }
        });
        await sendWhatsAppMessage(from, "✅ Alamat diterima.\nSekarang mohon *Share Location* (klik 📎 > Location) agar kurir GoSend bisa menjemput dengan akurat.", store.id);
        return;
      }

      // 4. Default / Initial
      await sendWhatsAppMessage(from, "❌ Alamat belum lengkap.\nSilakan kirim *alamat lengkap + kode pos (5 digit)* atau *Share Location*.", store.id);
      return;
    }

    // Step Detail is now merged into MERCHANT_SHIP_ADDRESS logic
    if (step === "MERCHANT_SHIP_ADDRESS_DETAIL") {
      const text = textBody.trim();
      const updatedCart = [...cart];
      if (text) updatedCart[0].address = text;
      
      const hasPostal = /\b\d{5}\b/.test(text);
      if (!hasPostal) {
        await sendWhatsAppMessage(from, "❌ Mohon sertakan *kode pos 5 digit*.\nContoh: \"Jl. Sudirman No 1, Bandung 40111\"", store.id);
        return;
      }

      await prisma.whatsAppSession.update({
        where: { id: merchantSession.id },
        data: { step: "MERCHANT_SHIP_ADDRESS", cart: updatedCart }
      });
      // Trigger the logic in the main step by calling it or just sending them there
      await sendWhatsAppMessage(from, "✅ Alamat disimpan. Memproses...", store.id);
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
          data: { step: "MERCHANT_SHIP_OPTIONS", cart: updatedCart, metadata: quotes } as any
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
      await sendWhatsAppMessage(from, "⏳ Sedang membuat draft pengiriman...", store.id);

      try {
        const recipientName = String(info?.recipientName || "").trim();
        const recipientPhone = String(info?.recipientPhone || "").trim();
        const address = String(info?.address || "").trim();
        const itemName = String(info?.itemName || "Barang").trim();
        const weight = Math.max(1, Number(info?.weight || 1000));
        const selected = info?.selectedCourier;
        const shippingFee = Math.max(0, Number(selected?.fee || 0));
        const provider = String(selected?.provider || "").toUpperCase();
        const service = String(selected?.service || "").trim();
        const eta = String(selected?.eta || "").trim();
        const normalizedService = service
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        const courierType =
          provider.includes("GO")
            ? normalizedService.includes("same_day") ? "same_day" : "instant"
            : normalizedService || "reg";

        const notes = JSON.stringify({
          kind: "MERCHANT_SHIPMENT",
          recipientName,
          itemName,
          weightGrams: weight,
          courierType,
          requestedBy: from
        });

        const order = await prisma.order.create({
          data: {
            storeId: store.id,
            customerPhone: recipientPhone,
            totalAmount: shippingFee,
            status: "PENDING",
            orderType: "TAKEAWAY",
            paymentMethod: null,
            shippingAddress: address,
            shippingProvider: provider,
            shippingService: service,
            shippingCost: shippingFee,
            shippingEta: eta || null,
            notes
          } as any
        });

        const draft = await createBiteshipDraftForPendingOrder({
          store,
          order,
          items: [{ name: itemName, quantity: 1, price: 0, weight }],
          destinationCoordinate:
            info?.lat && info?.lng
              ? { latitude: Number(info.lat), longitude: Number(info.lng) }
              : undefined
        });
        if (draft.ok) {
          const d = draft as any;
          await prisma.order.update({
            where: { id: order.id },
            data: {
              biteshipOrderId: d.draftOrderId || undefined,
              shippingStatus: d.shippingStatus || "draft_created"
            }
          });
          if (d.shippingStatus !== "courier_selected") {
            await prisma.whatsAppSession.update({
              where: { id: merchantSession.id },
              data: { step: "MERCHANT_SHIP_ADDRESS", cart: [{ ...info, address: "", lat: undefined, lng: undefined }] }
            });
            await sendWhatsAppMessage(
              from,
              "❌ Kurir belum bisa dipilih otomatis.\nSilakan kirim ulang *alamat lengkap + kode pos (5 digit)* atau *Share Location*.",
              store.id
            );
            return;
          }
        }

        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_SHIP_PAYMENT_METHOD", cart: [{ ...info, orderId: order.id }] }
        });

        await sendWhatsAppMessage(
          from,
          `📦 Draft pengiriman dibuat.\n` +
            `Order ID: #${order.id}\n` +
            `Kurir: ${provider} ${service}\n` +
            `Ongkir: ${formatMoney(shippingFee)}\n\n` +
            `Pilih pembayaran:\n` +
            `1) WA Credit\n` +
            `2) QRIS (Midtrans)\n` +
            `3) Transfer Bank\n\n` +
            `Atau balas:\n` +
            `- *Edit* (Ubah alamat/kurir)\n` +
            `- *Batal* (Batalkan booking)`,
          store.id
        );
      } catch (err) {
        console.error("Merchant Booking Error:", err);
        await sendWhatsAppMessage(from, "❌ Gagal membuat draft pengiriman. Pastikan alamat pengirim + Biteship sudah benar.", store.id);
      }
      return;
    }

    if (step === "MERCHANT_SHIP_PAYMENT_METHOD") {
      const info = cart[0] || {};
      const orderId = Number(info?.orderId || 0);
      if (!orderId) {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });
        await sendWhatsAppMessage(from, "❌ Session pengiriman tidak valid. Ketik 'Mau kirim barang' untuk mulai lagi.", store.id);
        return;
      }

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (!order) {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });
        await sendWhatsAppMessage(from, "❌ Order tidak ditemukan. Ketik 'Mau kirim barang' untuk mulai lagi.", store.id);
        return;
      }

      const choice = lowerText.replace(/\s+/g, " ").trim();
      const amount = Math.max(0, Number(order.totalAmount || 0));
      const itemName = String(info?.itemName || "Barang").trim();
      const weight = Math.max(1, Number(info?.weight || 1000));

      if (choice === "batal" || choice === "cancel") {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });
        await sendWhatsAppMessage(from, "❌ Booking dibatalkan.", store.id);
        return;
      }

      if (choice === "edit" || choice === "ubah") {
        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_SHIP_ADDRESS", cart: [{ ...info, address: "", lat: null, lng: null }] }
        });
        await sendWhatsAppMessage(from, "📍 Ke mana alamat tujuannya?\nSilakan kirim *alamat lengkap + kode pos (5 digit)* atau *Share Location*.", store.id);
        return;
      }

      if (choice === "1" || choice === "wa" || choice === "wa credit" || choice === "whatsapp credit") {
        await ensureWaCreditSchema();
        const ok = await prisma.$transaction(async (tx) => {
          const updated = await tx.store.updateMany({
            where: { id: store.id, waBalance: { gte: amount } },
            data: { waBalance: { decrement: amount } }
          });
          if (!updated.count) return false;
          const after = await tx.store.findUnique({ where: { id: store.id }, select: { waBalance: true } });
          await tx.waUsageLog.create({
            data: {
              storeId: store.id,
              type: "SHIPMENT_PAYMENT",
              amount: -amount,
              description: `Shipment payment for order #${order.id}`,
              balanceAfter: Number((after?.waBalance || 0).toFixed(2)),
              externalRef: `SHIPMENT-${order.id}`
            }
          });
          await tx.order.update({
            where: { id: order.id },
            data: { status: "PAID", paymentMethod: "wa_credit" }
          });
          return true;
        }).catch(() => false);

        if (!ok) {
          await sendWhatsAppMessage(from, `❌ Saldo WA tidak cukup. Total: ${formatMoney(amount)}\nBalas 2 untuk QRIS atau 3 untuk Transfer.`, store.id);
          return;
        }

        const booked = await createBiteshipOrderForPaidOrder({
          store,
          order: { ...order, status: "PAID" },
          items: [{ name: itemName, quantity: 1, price: 0, weight }]
        });

        let tracking = "";
        let driverInfo = "";
        if (booked.ok) {
          const b = booked as any;
          await prisma.order.update({
            where: { id: order.id },
            data: {
              biteshipOrderId: b.biteshipOrderId || order.biteshipOrderId || null,
              shippingTrackingNo: b.trackingNo || order.shippingTrackingNo || null,
              shippingStatus: b.shippingStatus || order.shippingStatus || "confirmed"
            }
          });
          if (b.trackingNo) tracking = b.trackingNo;
          if (b.driverName || b.driverPhone || b.vehicleNumber) {
            driverInfo = `\n👨‍✈️ Driver: ${b.driverName || "-"}\n`;
            if (b.driverPhone) driverInfo += `📱 Driver Telp: ${b.driverPhone}\n`;
            if (b.vehicleNumber) driverInfo += `🚗 Plat: ${b.vehicleNumber}\n`;
          }
        }

        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });

        await sendWhatsAppMessage(
          from,
          `✅ Pembayaran via WA Credit berhasil.\nOrder #${order.id}\nKurir: ${order.shippingProvider || "-"} ${order.shippingService || ""}\n` +
            (tracking ? `Resi: ${tracking}\n` : "") +
            driverInfo +
            `\nBalas "Cek Resi ${order.id}" untuk tracking.`,
          store.id
        );

        await sendWhatsAppMessage(
          order.customerPhone,
          `📦 Pengiriman dibuat!\nOrder #${order.id}\nKurir: ${order.shippingProvider || "-"} ${order.shippingService || ""}\n` +
            (tracking ? `Resi: ${tracking}\n` : "") +
            driverInfo +
            `\nBalas "Cek Resi ${order.id}" untuk lihat status.`,
          store.id
        );
        return;
      }

      if (choice === "2" || choice === "qris" || choice === "midtrans") {
        const fee = Math.ceil(amount * 0.01);
        const finalAmount = amount + fee;
        const paymentUrl = await createPaymentLink(order.id, finalAmount, from, store.id, "qris");
        
        await prisma.order.update({
          where: { id: order.id },
          data: { totalAmount: finalAmount, paymentFee: fee }
        });

        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });

        const msg = `💳 *Pembayaran QRIS*\nOrder #${order.id}\nTotal: ${formatMoney(finalAmount)}\n(Termasuk fee 1%: ${formatMoney(fee)})\n\nSilakan bayar melalui link di bawah.`;
        
        await sendWhatsAppMessage(from, msg, store.id, { buttonText: "Bayar QRIS", buttonUrl: paymentUrl });
        
        if (info.isInvoice) {
          await sendWhatsAppMessage(order.customerPhone, msg, store.id, { buttonText: "Bayar QRIS", buttonUrl: paymentUrl });
        }
        return;
      }

      if (choice === "3" || choice === "bank" || choice === "transfer") {
        const fee = 5000;
        const finalAmount = amount + fee;
        const paymentUrl = await createPaymentLink(order.id, finalAmount, from, store.id, "bank_transfer");

        await prisma.order.update({
          where: { id: order.id },
          data: { totalAmount: finalAmount, paymentFee: fee }
        });

        await prisma.whatsAppSession.update({
          where: { id: merchantSession.id },
          data: { step: "MERCHANT_MODE", cart: [] }
        });

        const msg = `🏦 *Pembayaran Transfer Bank*\nOrder #${order.id}\nTotal: ${formatMoney(finalAmount)}\n(Termasuk fee admin: ${formatMoney(fee)})\n\nSilakan bayar melalui link di bawah.`;

        await sendWhatsAppMessage(from, msg, store.id, { buttonText: "Bayar Transfer", buttonUrl: paymentUrl });

        if (info.isInvoice) {
          await sendWhatsAppMessage(order.customerPhone, msg, store.id, { buttonText: "Bayar Transfer", buttonUrl: paymentUrl });
        }
        return;
      }

      await sendWhatsAppMessage(from, "❌ Pilihan tidak valid. Balas 1 / 2 / 3.", store.id);
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
