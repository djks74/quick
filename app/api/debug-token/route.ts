import { NextRequest, NextResponse } from 'next/server';
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const platform = await prisma.platformSettings.findUnique({ where: { key: "default" } });
  const token = platform?.whatsappToken || process.env.WHATSAPP_TOKEN;
  const phoneId = platform?.whatsappPhoneId || process.env.WHATSAPP_PHONE_ID;

  if (!token) {
    return NextResponse.json({ status: 'error', message: 'WHATSAPP token is not configured (Platform or env)' });
  }

  try {
    // Check Token Debug Endpoint
    const debugRes = await fetch(`https://graph.facebook.com/v17.0/debug_token?input_token=${token}&access_token=${token}`);
    const debugData = await debugRes.json();

    // Check Phone ID
    let phoneData = null;
    if (phoneId) {
        const phoneRes = await fetch(`https://graph.facebook.com/v17.0/${phoneId}?access_token=${token}`);
        phoneData = await phoneRes.json();
    }

    return NextResponse.json({
      status: 'success',
      token_prefix: token.substring(0, 5) + '...',
      phone_id: phoneId,
      token_info: debugData,
      phone_info: phoneData
    });

  } catch (error: any) {
    return NextResponse.json({ status: 'error', message: error.message });
  }
}
