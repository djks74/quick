import Link from "next/link";

const customerFaq = [
  {
    question: "Apa itu Gercep AI Assistant?",
    answer:
      "Gercep AI Assistant adalah asisten pintar berbasis kecerdasan buatan (AI) yang membantu Anda mencari toko, melihat menu, dan melakukan pemesanan secara natural melalui WhatsApp atau Chat di website kami.",
  },
  {
    question: "Bagaimana cara memesan menggunakan AI?",
    answer:
      "Cukup ketik apa yang Anda cari (contoh: 'Cari nasi uduk') di WhatsApp atau Chat Assistant kami. AI akan mencarikan toko yang sesuai, menunjukkan menu, dan membantu Anda membuat pesanan hingga mendapatkan link pembayaran.",
  },
  {
    question: "Apakah saya bisa menanyakan riwayat pesanan saya?",
    answer:
      "Ya! Anda bisa menanyakan 'Cek pesanan terakhir saya' dan AI akan memberikan detail pesanan terbaru Anda beserta link pembayarannya jika belum dibayar.",
  },
  {
    question: "Bagaimana cara kerja pengiriman dengan AI?",
    answer:
      "Untuk pesanan takeaway, cukup bagikan lokasi Anda atau ketik alamat Anda. AI akan menghitung ongkir secara otomatis menggunakan GoSend atau JNE dan menunjukkannya kepada Anda sebelum Anda membayar.",
  },
  {
    question: "Apakah saya bisa membayar langsung dari chat?",
    answer:
      "Ya. Setelah pesanan dibuat, AI akan memberikan tombol 'Pay Now' (Bayar Sekarang) yang akan mengarahkan Anda langsung ke halaman pembayaran Midtrans yang aman.",
  },
];

const merchantFaq = [
  {
    question: "Bagaimana AI membantu mengelola toko saya?",
    answer:
      "AI kami secara otomatis memahami katalog produk Anda. AI bisa menjawab pertanyaan pelanggan tentang menu, stok, dan harga 24/7 tanpa Anda perlu membalas manual.",
  },
  {
    question: "Dapatkah saya mengupdate harga atau produk via chat?",
    answer:
      "Ya! Sebagai merchant, Anda bisa mengupdate harga atau menambah produk cukup dengan mengirim pesan ke AI di WhatsApp, misalnya: 'Ubah harga Nasi Goreng jadi 25000'.",
  },
  {
    question: "Apakah ada biaya tambahan untuk menggunakan AI?",
    answer:
      "Fitur AI Assistant tersedia untuk membantu meningkatkan konversi penjualan Anda. Biaya transaksi tetap mengikuti standar (QRIS 1% atau Bank Transfer Rp 5.000).",
  },
  {
    question: "Bagaimana AI menangani stok yang habis?",
    answer:
      "AI hanya akan menawarkan produk yang memiliki stok tersedia di sistem Anda. Jika stok habis, AI akan memberitahu pelanggan dan menyarankan produk alternatif.",
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-[#0F1113] text-gray-900 dark:text-white">
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-3xl md:text-5xl font-black tracking-tight">FAQ & BANTUAN AI</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Segala hal yang perlu Anda ketahui tentang berbelanja pintar dengan Gercep AI Assistant.
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
            <span>Kembali ke Beranda</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
          </Link>
        </div>
      </div>
    </main>
  );
}
