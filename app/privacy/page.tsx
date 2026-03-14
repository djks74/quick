import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl md:text-4xl font-black">Privacy Policy</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Effective date: 1 January 2026</p>
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">1. Scope</h2>
          <p className="text-gray-700 dark:text-gray-300">
            This Privacy Policy explains how Gercep Ecosystem collects, uses, stores, and protects information when merchants
            and end users access Gercep products, including web ordering, WhatsApp workflows, POS, inventory, and related services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">2. Information We Collect</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
            <li>Account and business details such as name, email, phone, and store profile.</li>
            <li>Operational data such as product catalog, orders, inventory movement, and POS activity.</li>
            <li>Technical data such as device metadata, logs, and security events.</li>
            <li>Payment-related references required to process transactions through integrated providers.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">3. How We Use Information</h2>
          <ul className="list-disc pl-6 space-y-2 text-gray-700 dark:text-gray-300">
            <li>To deliver and improve platform functionality and merchant operations.</li>
            <li>To process and reconcile payments and transaction records.</li>
            <li>To provide support, security monitoring, and fraud prevention.</li>
            <li>To communicate product updates, service notices, and compliance information.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">4. Data Sharing</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Gercep shares data only with trusted service providers and payment partners as required for service delivery,
            legal compliance, and security obligations. We do not sell personal data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">5. Security and Retention</h2>
          <p className="text-gray-700 dark:text-gray-300">
            We use access controls, encryption, and monitoring safeguards to protect data. We retain information only as long
            as needed for operations, legal requirements, and legitimate business purposes.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">6. Your Rights</h2>
          <p className="text-gray-700 dark:text-gray-300">
            Subject to applicable law, users may request access, correction, or deletion of their personal information and may
            contact us for data-related inquiries.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-bold">7. Contact</h2>
          <p className="text-gray-700 dark:text-gray-300">
            For privacy requests, contact Gercep support at your official support channel.
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
