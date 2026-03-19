import Link from "next/link";

const apiEndpoints = [
  {
    method: "POST",
    path: "/api/partner/sync-products",
    title: "Sinkronisasi Produk (Upsert)",
    description: "Menambah atau memperbarui daftar produk restoran Anda secara massal (bulk).",
    request: {
      action: "upsert",
      products: [
        {
          name: "Nasi Goreng Spesial",
          price: 25000,
          category: "Makanan Utama",
          description: "Nasi goreng dengan telur dan ayam",
          stock: 100
        }
      ]
    },
    response: {
      success: true,
      results: [{ name: "Nasi Goreng Spesial", status: "success", id: 123 }]
    }
  },
  {
    method: "POST",
    path: "/api/partner/sync-products",
    title: "Hapus Produk",
    description: "Menghapus produk dari sistem Gercep berdasarkan nama.",
    request: {
      action: "delete",
      products: [{ name: "Menu Lama" }]
    },
    response: {
      success: true,
      results: [{ name: "Menu Lama", status: "deleted" }]
    }
  }
];

const authGuide = [
  "Semua request API harus menyertakan header 'X-API-KEY'.",
  "API Key dapat ditemukan di dashboard Merchant pada bagian Settings > API.",
  "Gunakan API Key ini untuk mengautentikasi aplikasi eksternal Anda dengan platform Gercep.",
];

export default function ApiDocumentationPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-12">
        {/* Header Section */}
        <div className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-xs font-bold uppercase tracking-widest border border-blue-500/20">
            Developer Hub
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter">DOKUMENTASI API</h1>
          <p className="text-gray-600 dark:text-gray-400 text-xl max-w-2xl leading-relaxed">
            Integrasikan sistem restoran Anda dengan ekosistem Gercep AI menggunakan API RESTful kami yang tangguh.
          </p>
        </div>

        {/* Authentication Section */}
        <section className="bg-white dark:bg-white/5 p-8 rounded-[40px] border border-gray-100 dark:border-white/10 shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 border border-orange-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Autentikasi & Keamanan</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {authGuide.map((step, i) => (
              <div key={i} className="p-6 rounded-3xl bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/5 text-gray-600 dark:text-gray-400 text-sm font-medium leading-relaxed">
                <span className="text-orange-500 font-black mb-2 block">0{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
        </section>

        {/* API Endpoints Section */}
        <div className="space-y-8">
          <h2 className="text-3xl font-black tracking-tight uppercase">API Endpoints</h2>
          <div className="space-y-6">
            {apiEndpoints.map((endpoint) => (
              <article
                key={endpoint.path}
                className="group relative overflow-hidden rounded-[40px] border border-gray-100 dark:border-white/10 bg-white dark:bg-white/5 hover:border-blue-500/30 transition-all duration-300"
              >
                <div className="p-8 md:p-10 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="px-4 py-1.5 rounded-full bg-blue-600 text-white text-xs font-black tracking-widest uppercase">
                        {endpoint.method}
                      </span>
                      <code className="text-lg font-mono text-blue-500 font-bold tracking-tight">
                        {endpoint.path}
                      </code>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                      {endpoint.title}
                    </h3>
                  </div>
                  
                  <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed">
                    {endpoint.description}
                  </p>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">Request Body</h4>
                      <pre className="p-6 rounded-3xl bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-white/5 font-mono text-sm text-blue-400 overflow-x-auto">
                        {JSON.stringify(endpoint.request, null, 2)}
                      </pre>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-gray-400">Response</h4>
                      <pre className="p-6 rounded-3xl bg-gray-50 dark:bg-black/40 border border-gray-100 dark:border-white/5 font-mono text-sm text-green-400 overflow-x-auto">
                        {JSON.stringify(endpoint.response, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="pt-12 flex flex-col md:flex-row items-center justify-between gap-6 border-t dark:border-white/10">
          <Link href="/documentation" className="group flex items-center gap-3 text-gray-500 hover:text-blue-500 transition-colors font-bold uppercase tracking-widest text-sm">
            <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M7 16l-4-4m0 0l4-4m-4 4h18"></path></svg>
            Kembali ke Dokumentasi AI
          </Link>
          
          <div className="flex items-center gap-8">
             <Link href="mailto:api@gercep.click" className="text-gray-400 hover:text-white transition-colors">
                <span className="text-xs font-bold uppercase tracking-widest">Support</span>
             </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
