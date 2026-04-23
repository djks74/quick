import Link from "next/link";

const customerFaq = [
  {
    question: "What is Gercep Assistant?",
    answer:
      "Gercep Assistant helps you shop via WhatsApp or Web Chat: find stores, browse products, calculate shipping, and complete payment when available.",
  },
  {
    question: "How do I place an order?",
    answer:
      "Tell us what you want and your area (or share your location). Gercep Assistant will show store options and help you pick items until checkout.",
  },
  {
    question: "Can I check my last order?",
    answer:
      "Yes. Ask for your last order status, and Gercep Assistant will show the latest order details (and payment link if applicable).",
  },
  {
    question: "How does delivery work?",
    answer:
      "For delivery, share your location or provide a full address. Gercep Assistant will calculate shipping options based on available couriers and store settings.",
  },
  {
    question: "Can I pay from chat?",
    answer:
      "Yes. After checkout, you may receive a secure payment link (for example via Midtrans) depending on the store configuration.",
  },
];

const merchantFaq = [
  {
    question: "How does Gercep help my store?",
    answer:
      "Customers can browse and order from your store via WhatsApp/Web Chat, while your dashboard remains the source of truth for catalog and orders.",
  },
  {
    question: "Can I update prices or products via chat?",
    answer:
      "In some flows, merchants can do quick updates via chat (for example updating a price). For full control, use the dashboard.",
  },
  {
    question: "Are there extra fees to use the assistant?",
    answer:
      "Transaction fees follow the configured payment method (for example QRIS or bank transfer). Store pricing depends on your subscription plan and setup.",
  },
  {
    question: "How is out-of-stock handled?",
    answer:
      "Gercep Assistant only shows items that are available according to your catalog and stock rules. If an item is unavailable, it will suggest alternatives.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">FAQ & HELP</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Everything you need to know about shopping, shipping, and payments with Gercep Assistant.
          </p>
        </div>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg">?</div>
            <h2 className="text-2xl font-black uppercase tracking-wider">Untuk Pelanggan</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {customerFaq.map((item) => (
              <article
                key={item.question}
                className="rounded-3xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-6 hover:shadow-xl transition-all duration-300 group"
              >
                <h3 className="text-lg font-bold group-hover:text-blue-600 transition-colors">{item.question}</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-600 flex items-center justify-center text-white font-bold shadow-lg">M</div>
            <h2 className="text-2xl font-black uppercase tracking-wider">Untuk Merchant</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {merchantFaq.map((item) => (
              <article
                key={item.question}
                className="rounded-3xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-6 hover:shadow-xl transition-all duration-300 group"
              >
                <h3 className="text-lg font-bold group-hover:text-green-600 transition-colors">{item.question}</h3>
                <p className="text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="pt-8 text-center border-t dark:border-white/10">
          <Link href="/" className="inline-flex items-center gap-2 text-blue-600 font-black hover:gap-3 transition-all">
            <span>Back to Home</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
