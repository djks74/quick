import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductGrid from "@/components/ProductGrid";
import { products } from "@/data/products";

export default function HardwareLicence() {
  const categoryProducts = products.filter(p => p.category === "hardware-licence");

  return (
    <main className="min-h-screen flex flex-col bg-background-shade">
      <Header />
      
      <div className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4 uppercase">Hardware & Licence</h1>
            <p className="max-w-2xl mx-auto text-gray-300">
                Official licenses for MHD, MG Flasher, Bootmod3, and xHP.
            </p>
        </div>
      </div>

      <ProductGrid products={categoryProducts} title="Hardware & Licence" />

      <Footer />
    </main>
  );
}
