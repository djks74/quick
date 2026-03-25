import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { prisma } from '@/lib/prisma';
import { GuardError, requireSuperAdminUser } from "@/lib/guards";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdminUser();
    const searchParams = req.nextUrl.searchParams;
    const phone = searchParams.get('phone');
    if (!phone) {
      return NextResponse.json({ error: 'Missing phone parameter. Usage: ?phone=62812...' }, { status: 400 });
    }

    // Get Demo Store ID (assuming it exists from seed)
    const store = await prisma.store.findFirst({ where: { slug: 'demo' } });
    
    if (!store) {
      return NextResponse.json({ error: 'Demo store not found in DB' }, { status: 404 });
    }

    const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } });
    const phoneId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID || 'MISSING';
    const maskedPhoneId = phoneId.length > 4 ? phoneId.substring(0, 5) + '...' : phoneId;

    console.log(`[TEST] Sending WhatsApp message to ${phone} using Store ${store.id}`);
    
    // Trigger Send
    await sendWhatsAppMessage(
      phone, 
      "🔔 Hello! This is a test message from Quick (LCP Auto). If you see this, the API is working!", 
      store.id
    );

    return NextResponse.json({ 
      success: true, 
      message: `Message sent to ${phone}`,
      debug: { storeId: store.id, usingPlatformPhoneId: platform?.whatsappPhoneId ? `Yes (${maskedPhoneId})` : 'No' }
    });

  } catch (error: any) {
    if (error instanceof GuardError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[TEST_ERROR]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
