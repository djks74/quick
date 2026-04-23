import Link from "next/link";

const customerSteps = [
  "Open the web chat assistant or message Gercep on WhatsApp.",
  "Tell us what you want to buy and your area (e.g., \"vegetables in Ciputat\").",
  "Gercep Assistant will show store options and the relevant menu/products.",
  "Pick a store and select items (or ask for categories/full menu).",
  "For delivery, share your location or type your full address.",
  "Gercep Assistant will calculate totals (items + fees + shipping) and give payment options.",
  "Complete payment using the provided checkout link when available.",
];

const merchantSteps = [
  "Register your store and complete the profile in the dashboard.",
  "Upload your product catalog with accurate prices and stock.",
  "Customers can browse and order via WhatsApp/Web Chat using Gercep Assistant.",
  "Use chat shortcuts for quick updates (e.g., \"Update Es Teh price to 5000\").",
  "Track incoming orders in real-time from the merchant dashboard.",
  "Accept payments through the available checkout flow.",
];

const operationsGuide = [
  {
    title: "Product & Store Discovery",
    points: [
      "Customers can search by product name, category, or store name.",
      "Results can be shown across stores (based on availability and eligibility).",
      "Share location or area to get nearby options faster.",
    ],
  },
  {
    title: "Merchant Operations",
    points: [
      "Merchants can do quick updates via chat (prices / products where supported).",
      "Store context and eligibility rules keep actions scoped to the right store.",
      "Use the dashboard for full control and reporting.",
    ],
  },
  {
    title: "Payment & Fees",
    points: [
      "Fees (tax/service/shipping) are calculated automatically during checkout.",
      "Supports common payment methods depending on store/platform configuration.",
      "A secure payment link can be generated per order when available.",
    ],
  },
  {
    title: "Shipping & Delivery",
    points: [
      "Shipping rates depend on the store configuration and your destination.",
      "Share GPS location or provide a complete address to calculate shipping.",
      "Gercep Assistant can guide you through available delivery options.",
    ],
  },
];

export default function DocumentationPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">DOCUMENTATION</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            A practical guide for customers and merchants using Gercep Assistant for shopping, shipping, and payments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-6 bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-100 dark:border-white/10 shadow-sm">
            <h2 className="text-2xl font-black text-blue-600">For Customers</h2>
            <ol className="list-decimal pl-5 space-y-4 text-gray-700 dark:text-gray-300 font-medium">
              {customerSteps.map((step) => (
                <li key={step} className="pl-2">{step}</li>
              ))}
            </ol>
          </section>

          <section className="space-y-6 bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-100 dark:border-white/10 shadow-sm">
            <h2 className="text-2xl font-black text-green-600">For Merchants</h2>
            <ol className="list-decimal pl-5 space-y-4 text-gray-700 dark:text-gray-300 font-medium">
              {merchantSteps.map((step) => (
                <li key={step} className="pl-2">{step}</li>
              ))}
            </ol>
          </section>
        </div>

        <section className="space-y-8">
          <h2 className="text-3xl font-black text-center">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {operationsGuide.map((section) => (
              <article
                key={section.title}
                className="rounded-3xl border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 p-8 hover:border-blue-500/50 transition-colors"
              >
                <h3 className="text-xl font-bold mb-4">{section.title}</h3>
                <ul className="space-y-3">
                  {section.points.map((point) => (
                    <li key={point} className="flex items-start gap-3 text-gray-600 dark:text-gray-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <div className="pt-12 flex flex-col md:flex-row items-center justify-between gap-6 border-t dark:border-white/10">
          <Link href="/" className="group flex items-center gap-3 text-gray-500 hover:text-blue-500 transition-colors font-bold uppercase tracking-widest text-sm">
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16l-4-4m0 0l4-4m-4 4h18"></path></svg>
            Back to Home
          </Link>
          
          <Link href="/documentation/api" className="group flex items-center gap-4 px-10 py-5 rounded-[30px] bg-blue-600 text-white font-black hover:bg-blue-700 transition-all hover:scale-105 shadow-xl hover:shadow-blue-500/20 active:scale-95 uppercase tracking-tighter text-lg">
            <span>API DOCUMENTATION</span>
            <svg className="w-6 h-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
