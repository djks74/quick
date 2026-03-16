import Link from "next/link";

const customerSteps = [
  "Scan table or store QR code to open digital menu.",
  "Browse in-stock items and add products to cart.",
  "For Takeaway, provide your address and select a courier (GoSend or JNE).",
  "Use search in WhatsApp if you need faster product lookup.",
  "Choose variations when the bot asks for product options.",
  "Complete checkout and follow payment instructions.",
  "Track order status updates from chat or order page.",
];

const merchantSteps = [
  "Register store and complete profile details.",
  "Add product catalog with price, stock, and variations.",
  "Set ingredient inventory and minimum stock thresholds.",
  "Connect WhatsApp and ensure webhook is active.",
  "Use dashboard to monitor orders, payments, and fulfillment.",
  "Review daily summary and resolve low-stock alerts quickly.",
];

const operationsGuide = [
  {
    title: "Menu and Stock Management",
    points: [
      "Only in-stock products are shown to customers.",
      "Low stock and out-of-stock reminders can be sent to merchant WhatsApp.",
      "Keep minimum threshold values updated for accurate reminders.",
    ],
  },
  {
    title: "WhatsApp Ordering Flow",
    points: [
      "Customer can type menu, search, and order directly in chat.",
      "Bot asks for clarification if product name is ambiguous.",
      "Language default is Indonesian with option to switch to English.",
    ],
  },
  {
    title: "Payment and Status",
    points: [
      "Pay Now opens internal payment route first for better in-app experience.",
      "Payment callback updates order status automatically.",
      "Merchant can monitor pending, paid, failed, and cancelled orders in dashboard.",
    ],
  },
  {
    title: "Shipping and Fulfillment",
    points: [
      "When an order is marked as Paid, the system automatically books the shipment using the selected courier (GoSend or JNE).",
      "A tracking number (Resi) is generated immediately and sent to the customer.",
    ],
  },
];

export default function DocumentationPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black">Documentation</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Quick usage guide for customers and merchants on Gercep Ecosystem.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-black">Customer Quick Start</h2>
          <ol className="list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-300">
            {customerSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-black">Merchant Onboarding</h2>
          <ol className="list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-300">
            {merchantSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="text-2xl font-black">Operations Guide</h2>
          <div className="space-y-4">
            {operationsGuide.map((section) => (
              <article
                key={section.title}
                className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 p-5 space-y-2"
              >
                <h3 className="text-lg font-bold">{section.title}</h3>
                <ul className="list-disc pl-6 space-y-1 text-gray-700 dark:text-gray-300">
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
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
