import { prisma } from "./prisma";

export async function triggerPartnerWebhook(orderId: number) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        store: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!order || !order.store.webhookUrl) return;

    const payload = {
      event: "order.paid",
      data: {
        id: order.id,
        storeSlug: order.store.slug,
        customerPhone: order.customerPhone,
        totalAmount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        orderType: order.orderType,
        status: order.status,
        createdAt: order.createdAt,
        items: order.items.map(item => ({
          productId: item.productId,
          externalId: item.product.externalId,
          name: item.product.name,
          quantity: item.quantity,
          price: item.price
        }))
      }
    };

    console.log(`[WEBHOOK_PARTNER] Sending to ${order.store.webhookUrl} for order #${orderId}`);

    const response = await fetch(order.store.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gercep-Event": "order.paid"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`[WEBHOOK_PARTNER] Failed to send webhook: ${response.statusText}`);
    } else {
      console.log(`[WEBHOOK_PARTNER] Successfully sent webhook for order #${orderId}`);
    }
  } catch (error) {
    console.error(`[WEBHOOK_PARTNER] Error triggering webhook:`, error);
  }
}
