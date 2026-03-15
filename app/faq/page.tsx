import Link from "next/link";

const customerFaq = [
  {
    question: "How do I order from the digital menu?",
    answer:
      "Scan the QR code, open the menu page, add items to cart, and continue checkout. You can complete payment on the provided payment page or follow merchant instructions.",
  },
  {
    question: "Can I order using WhatsApp?",
    answer:
      "Yes. Tap Order via WhatsApp from the menu page. The bot will guide you to browse menu, search products, choose variations, and place your order.",
  },
  {
    question: "Why are some products not visible in menu?",
    answer:
      "Out-of-stock products are automatically hidden from the customer menu. Only products with available stock are shown.",
  },
  {
    question: "What if I search a product with many options?",
    answer:
      "The WhatsApp bot will ask you to select the exact product or variation, for example choosing between multiple nasi menu options.",
  },
  {
    question: "I submitted my phone number but did not get a message. What should I do?",
    answer:
      "Use the Open WhatsApp Chat action from the menu page and send a message manually. The system will continue your order flow from there.",
  },
];

const merchantFaq = [
  {
    question: "How do I update menu and prices?",
    answer:
      "Go to dashboard product management to update name, price, stock, and variations. Changes are reflected immediately on menu and WhatsApp flow.",
  },
  {
    question: "How does low-stock reminder work?",
    answer:
      "When ingredient stock crosses below minimum threshold, the system sends a WhatsApp reminder to merchant. Critical out-of-stock alerts are also triggered.",
  },
  {
    question: "Can I manage multiple branches?",
    answer:
      "Yes. The platform supports multi-store operations and centralized control from admin area, depending on your account setup.",
  },
  {
    question: "How are payments confirmed?",
    answer:
      "Payment callbacks update order status automatically. Merchants can monitor paid, pending, and failed statuses from the order dashboard.",
  },
  {
    question: "Can merchant and customer use Indonesian by default?",
    answer:
      "Yes. WhatsApp flows are configured with Indonesian as default, and users can switch to English when needed.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black">FAQ</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Common questions for customers and merchants using Gercep Ecosystem.
          </p>
        </div>

        <section className="space-y-5">
          <h2 className="text-2xl font-black">Customer FAQ</h2>
          <div className="space-y-4">
            {customerFaq.map((item) => (
              <article
                key={item.question}
                className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 space-y-2"
              >
                <h3 className="text-lg font-bold">{item.question}</h3>
                <p className="text-gray-700 dark:text-gray-300">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-black">Merchant FAQ</h2>
          <div className="space-y-4">
            {merchantFaq.map((item) => (
              <article
                key={item.question}
                className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 space-y-2"
              >
                <h3 className="text-lg font-bold">{item.question}</h3>
                <p className="text-gray-700 dark:text-gray-300">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="pt-2">
          <Link href="/" className="text-[#2271b1] font-bold hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
