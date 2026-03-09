import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { formatCurrency } from "@/lib/utils";

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  // Await params to satisfy Next.js 15+ requirements for async params
  const { id } = await params;
  const orderId = parseInt(id);
  
  if (isNaN(orderId)) return notFound();

  const order = await prisma.order.findUnique({
    where: { id: orderId }
  });

  if (!order) return notFound();

  // Get store settings for WhatsApp number
  const settings = await prisma.store.findUnique({ where: { id: order.storeId } });
  const whatsappNumber = settings?.whatsapp || "628123456789";

  // Construct message
  const message = `Hello, I have paid for Order #${order.id} with total amount ${formatCurrency(order.totalAmount, "IDR")}. Please process my order.`;
  const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-[#2271b1] p-6 text-white text-center">
          <h1 className="text-xl font-bold">Complete Payment</h1>
          <p className="text-blue-100 text-sm mt-1">Order #{order.id}</p>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="text-center">
            <p className="text-gray-500 text-sm mb-1">Total Amount</p>
            <h2 className="text-3xl font-black text-gray-900">{formatCurrency(order.totalAmount, "IDR")}</h2>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
            <h3 className="font-bold text-gray-900 text-sm">Bank Transfer (Manual)</h3>
            <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-md flex items-center justify-center text-white font-bold text-xs">BCA</div>
                <div>
                  <p className="font-bold text-sm text-gray-900">123 456 7890</p>
                  <p className="text-xs text-gray-500">Laku Store</p>
                </div>
              </div>
              <button className="text-xs text-blue-600 font-bold uppercase">Copy</button>
            </div>
          </div>

          <div className="text-center text-xs text-gray-400">
            Please transfer the exact amount. <br/>
            Your order will be processed after confirmation.
          </div>

          <a 
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center space-x-2"
          >
            <span>Confirm via WhatsApp</span>
          </a>
        </div>
      </div>
    </div>
  );
}