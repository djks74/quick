import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import RevSlider from "@/components/home/RevSlider";
import ProductGrid from "@/components/ProductGrid";
import { products } from "@/data/products";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-background-shade">
      <Header />
      <div className="flex-grow">
        <RevSlider />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <ProductGrid products={products} title="Latest Tuning Parts" />
        </div>
      </div>
      <Footer />
    </main>
  );
}
