import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Dealers() {
  return (
    <main className="min-h-screen flex flex-col bg-background-shade">
      <Header />
      
      <div className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">DEALERS</h1>
            <p className="max-w-2xl mx-auto text-gray-300">
                Find our authorized dealers and service centers near you.
            </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="bg-white p-4 rounded-lg shadow-md overflow-hidden">
             {/* Google Map Embed */}
             <div className="w-full h-[600px] bg-gray-200 relative">
                <iframe 
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d126907.08660851853!2d106.789173!3d-6.229728!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e69f3e945e34b9d%3A0x5371bf0fdad786a2!2sJakarta%2C%20Special%20Capital%20Region%20of%20Jakarta%2C%20Indonesia!5e0!3m2!1sen!2sus!4v1652885421345!5m2!1sen!2sus" 
                    width="100%" 
                    height="100%" 
                    style={{ border: 0 }} 
                    allowFullScreen 
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade"
                    title="LCP Dealers Map"
                ></iframe>
             </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded shadow border-l-4 border-primary">
                <h3 className="text-xl font-bold mb-2">Main Headquarters</h3>
                <p className="text-gray-600 mb-4">Jakarta, Indonesia</p>
                <p className="text-sm text-gray-500">123 Auto Street, Car City</p>
                <p className="text-sm text-gray-500 mt-2">+62 878-9674-4455</p>
            </div>
             <div className="bg-white p-6 rounded shadow border-l-4 border-secondary">
                <h3 className="text-xl font-bold mb-2">Surabaya Branch</h3>
                <p className="text-gray-600 mb-4">Surabaya, East Java</p>
                <p className="text-sm text-gray-500">456 Tuning Ave, Motor District</p>
                <p className="text-sm text-gray-500 mt-2">+62 812-3456-7890</p>
            </div>
             <div className="bg-white p-6 rounded shadow border-l-4 border-secondary">
                <h3 className="text-xl font-bold mb-2">Bali Branch</h3>
                <p className="text-gray-600 mb-4">Denpasar, Bali</p>
                <p className="text-sm text-gray-500">789 Performance Rd, Speed Zone</p>
                <p className="text-sm text-gray-500 mt-2">+62 813-9876-5432</p>
            </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
