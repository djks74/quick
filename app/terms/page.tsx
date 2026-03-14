import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black">Terms of Service</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Effective date: 1 January 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">1. Agreement</h2>
          <p className="text-gray-700 dark:text-gray-300">
            By accessing or using Gercep Ecosystem services, you agree to these Terms. If you use the platform on behalf of a
            business, you confirm you have authority to bind that business.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">2. Services</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Gercep provides tools for commerce operations, including digital ordering, WhatsApp workflow automation, POS,
            inventory management, and analytics. We may update features to improve service quality and compliance.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">3. Merchant Responsibilities</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
            <li>Maintain accurate business, menu, pricing, and inventory data.</li>
            <li>Comply with applicable tax, consumer protection, and commercial regulations.</li>
            <li>Protect account credentials and ensure authorized access only.</li>
            <li>Use the platform lawfully and avoid abusive, fraudulent, or harmful activity.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">4. Fees and Payments</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Subscription fees and transaction-related charges follow the plan and payment configuration agreed by the merchant.
            Third-party payment providers may apply additional terms and fees.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">5. Data and Privacy</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Data handling is governed by our Privacy Policy. You are responsible for obtaining required consent from your end users
            where applicable.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">6. Service Availability</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We aim for reliable operations but do not guarantee uninterrupted service. Scheduled maintenance, provider outages,
            or force majeure events may affect availability.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">7. Limitation of Liability</h2>
          <p className="text-gray-700 dark:text-gray-300">
            To the extent permitted by law, Gercep is not liable for indirect, incidental, or consequential damages arising from
            platform use, third-party service failures, or merchant operational errors.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">8. Contact</h2>
          <p className="text-gray-700 dark:text-gray-300">
            For legal and terms-related inquiries, contact Gercep support through your official support channel.
          </p>
        </section>

        <div className="pt-4">
          <Link href="/" className="text-[#2271b1] font-bold hover:underline">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
