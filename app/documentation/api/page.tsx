import Link from "next/link";

const apiEndpoints = [
  {
    method: "GET",
    path: "/api/partner/sync-products",
    title: "Ambil Daftar Produk",
    description: "Mengambil semua daftar produk yang saat ini terdaftar di Gercep untuk toko Anda. Berguna untuk memverifikasi hasil sinkronisasi.",
    request: null,
    response: {
      success: true,
      store: "Nama Toko Anda",
      products: [
        {
          id: 123,
          externalId: "POS-123",
          name: "Nasi Goreng",
          price: 25000,
          stock: 100
        }
      ]
    }
  },
  {
    method: "POST",
    path: "/api/partner/sync-products",
    title: "Tambah / Edit Produk (Upsert)",
    description: "Endpoint tunggal untuk menambah produk baru ATAU memperbarui yang sudah ada. Jika 'externalId' sudah ada, sistem akan memperbarui data. Jika belum, sistem akan membuat produk baru.",
    request: {
      action: "upsert",
      products: [
        {
          externalId: "POS-123",
          name: "Nasi Goreng Spesial",
          price: 25000,
          category: "Makanan Utama",
          description: "Nasi goreng dengan telur dan ayam",
          image: "https://example.com/image.jpg",
          stock: 100
        }
      ]
    },
    response: {
      success: true,
      results: [
        {
          name: "Nasi Goreng Spesial",
          status: "success",
          id: 123,
          externalId: "POS-123"
        }
      ]
    }
  },
    {
      method: "POST",
      path: "/api/partner/sync-products",
      title: "Hapus Produk",
      description: "Menghapus produk dari sistem Gercep. Anda dapat menghapus berdasarkan 'externalId' (ID sistem Anda) atau 'name'.",
      request: {
        action: "delete",
        products: [
          { externalId: "POS-123" },
          { name: "Menu Lama" }
        ]
      },
      response: {
        success: true,
        results: [
          { externalId: "POS-123", status: "deleted" },
          { name: "Menu Lama", status: "deleted" }
        ]
      }
    },
    {
      method: "WEBHOOK",
      path: "URL Anda (Konfigurasi di Dashboard)",
      title: "Notifikasi Order (Paid)",
      description: "Gercep akan mengirimkan data pesanan ke URL Webhook Anda setiap kali ada pesanan yang berhasil dibayar (Lunas).",
      request: {
        event: "order.paid",
        data: {
          id: 456,
          storeSlug: "nama-toko",
          customerPhone: "08123456789",
          totalAmount: 50000,
          paymentMethod: "qris",
          orderType: "DELIVERY",
          items: [
            {
              externalId: "POS-123",
              name: "Nasi Goreng Spesial",
              quantity: 2,
              price: 25000
            }
          ]
        }
      },
      response: "HTTP 200 OK"
    }
  ];

const plugins = [
  {
    name: "WCFM (Multivendor)",
    description: "Integrasikan toko WCFM Anda dengan sinkronisasi produk real-time dan manajemen vendor.",
    icon: "https://ps.w.org/wc-frontend-manager/assets/icon-256x256.png",
    link: "/integrations/wcfm-sync.zip"
  },
  {
    name: "WooCommerce",
    description: "Plugin standar untuk sinkronisasi produk WooCommerce ke platform Gercep.",
    icon: "https://ps.w.org/woocommerce/assets/icon-256x256.png",
    link: "/integrations/woocommerce-sync.zip"
  },
  {
    name: "Shopify",
    description: "Panduan integrasi Shopify menggunakan Custom App dan Webhook.",
    icon: "https://cdn.shopify.com/assets/images/logos/shopify-bag.png",
    link: "/integrations/shopify-sync.zip"
  },
  {
    name: "Magento 2",
    description: "Modul integrasi Magento 2 via REST API untuk sinkronisasi katalog.",
    icon: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Magento_logo.svg/1200px-Magento_logo.svg.png",
    link: "/integrations/magento2-sync.zip"
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

        {/* Plugins Section */}
        <section className="space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
            </div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Plugins & Integrasi</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plugins.map((plugin) => (
              <div key={plugin.name} className="p-6 rounded-[32px] bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 flex flex-col justify-between space-y-4 hover:border-blue-500/30 transition-all duration-300">
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/10 overflow-hidden p-2">
                    <img src={plugin.icon} alt={plugin.name} className="w-full h-full object-contain" />
                  </div>
                  <h3 className="font-black text-lg uppercase tracking-tight">{plugin.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                    {plugin.description}
                  </p>
                </div>
                <Link 
                  href={plugin.link} 
                  target="_blank"
                  className="inline-flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                >
                  Download / Doc
                </Link>
              </div>
            ))}
          </div>
        </section>

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
