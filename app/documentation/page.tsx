import Link from "next/link";

const customerSteps = [
  "Buka Chat Assistant di website atau kirim pesan ke WhatsApp Gercep.",
  "Ketik apa yang Anda cari, misalnya 'Cari nasi uduk' atau 'Ada promo apa hari ini?'.",
  "AI akan mencarikan toko dan menu yang sesuai dengan permintaan Anda.",
  "Pilih menu dan beritahu AI jumlah yang ingin dipesan.",
  "Untuk pengiriman, bagikan lokasi Anda atau ketik alamat lengkap Anda.",
  "AI akan menghitung total biaya termasuk pajak, biaya layanan, dan ongkir.",
  "Klik tombol 'Pay Now' untuk menyelesaikan pembayaran via QRIS atau Bank Transfer.",
];

const merchantSteps = [
  "Daftarkan toko Anda dan lengkapi profil melalui dashboard.",
  "Upload katalog produk Anda dengan harga dan stok yang akurat.",
  "AI akan secara otomatis mempelajari menu Anda untuk membantu pelanggan.",
  "Gunakan WhatsApp untuk update cepat: ketik 'Update harga Es Teh jadi 5000'.",
  "Pantau semua pesanan masuk secara real-time di dashboard merchant.",
  "Terima pembayaran otomatis tanpa perlu verifikasi manual.",
];

const operationsGuide = [
  {
    title: "Pencarian Produk Pintar",
    points: [
      "Pelanggan bisa mencari berdasarkan nama makanan, kategori, atau nama toko.",
      "AI bisa memberikan rekomendasi berdasarkan ketersediaan stok.",
      "Pencarian berfungsi lintas-toko di seluruh ekosistem Gercep.",
    ],
  },
  {
    title: "Manajemen Merchant via AI",
    points: [
      "Merchant bisa menambah produk baru cukup dengan chat ke AI.",
      "Update harga dan variasi produk bisa dilakukan instan via WhatsApp.",
      "AI mendeteksi nomor telepon merchant secara otomatis untuk keamanan.",
    ],
  },
  {
    title: "Sistem Pembayaran & Biaya",
    points: [
      "Kalkulasi biaya (Pajak, Service, Ongkir) dilakukan otomatis oleh AI.",
      "Mendukung pembayaran QRIS (biaya 1%) dan Bank Transfer (biaya Rp 5.000).",
      "Link pembayaran Midtrans dihasilkan secara dinamis untuk setiap pesanan.",
    ],
  },
  {
    title: "Pengiriman & Logistik",
    points: [
      "Integrasi langsung dengan Biteship untuk tarif GoSend dan JNE.",
      "AI membutuhkan alamat atau koordinat GPS untuk menghitung ongkir.",
      "Status pengiriman dapat dilacak langsung melalui chat assistant.",
    ],
  },
];

export default function DocumentationPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">DOKUMENTASI AI</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Panduan lengkap penggunaan fitur AI untuk pelanggan dan pemilik toko.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-6 bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-100 dark:border-white/10 shadow-sm">
            <h2 className="text-2xl font-black text-blue-600">Panduan Pelanggan</h2>
            <ol className="list-decimal pl-5 space-y-4 text-gray-700 dark:text-gray-300 font-medium">
              {customerSteps.map((step) => (
                <li key={step} className="pl-2">{step}</li>
              ))}
            </ol>
          </section>

          <section className="space-y-6 bg-white dark:bg-white/5 p-8 rounded-3xl border border-gray-100 dark:border-white/10 shadow-sm">
            <h2 className="text-2xl font-black text-green-600">Panduan Merchant</h2>
            <ol className="list-decimal pl-5 space-y-4 text-gray-700 dark:text-gray-300 font-medium">
              {merchantSteps.map((step) => (
                <li key={step} className="pl-2">{step}</li>
              ))}
            </ol>
          </section>
        </div>

        <section className="space-y-8">
          <h2 className="text-3xl font-black text-center">Detail Operasional AI</h2>
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
            Kembali ke Beranda
          </Link>
          
          <Link href="/documentation/api" className="group flex items-center gap-4 px-10 py-5 rounded-[30px] bg-blue-600 text-white font-black hover:bg-blue-700 transition-all hover:scale-105 shadow-xl hover:shadow-blue-500/20 active:scale-95 uppercase tracking-tighter text-lg">
            <span>DOKUMENTASI API</span>
            <svg className="w-6 h-6 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
