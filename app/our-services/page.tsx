import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Wrench, Car, Zap, Thermometer, Battery, Disc } from "lucide-react";

export default function OurServices() {
  return (
    <main className="min-h-screen flex flex-col bg-background-shade">
      <Header />
      
      <div className="bg-gray-900 text-white py-16">
        <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">LCP SERVICE CENTER</h1>
            <p className="max-w-2xl mx-auto text-gray-300">
                Are you ready to give your car the service it is asking for? Schedule car maintenance or repair right here. Our top-notch service staff can get your car or truck in and out quickly.
            </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold mb-12 text-center text-text uppercase">Our Services Include</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ServiceCard 
                icon={<Wrench className="w-10 h-10 text-primary" />} 
                title="General Automotive Repair" 
                description="Comprehensive repair services for all vehicle makes and models."
            />
            <ServiceCard 
                icon={<Car className="w-10 h-10 text-primary" />} 
                title="Preventative Car Maintenance" 
                description="Regular maintenance to keep your vehicle running smoothly and prevent future issues."
            />
            <ServiceCard 
                icon={<Thermometer className="w-10 h-10 text-primary" />} 
                title="Air Conditioning and Heater Service" 
                description="Keep your cabin comfortable in all weather conditions with our AC and heating services."
            />
            <ServiceCard 
                icon={<Zap className="w-10 h-10 text-primary" />} 
                title="Auto Electric" 
                description="Expert diagnosis and repair of electrical systems, batteries, and alternators."
            />
             <ServiceCard 
                icon={<Disc className="w-10 h-10 text-primary" />} 
                title="Brake Repair" 
                description="Ensure your safety with our professional brake inspection and repair services."
            />
             <ServiceCard 
                icon={<Battery className="w-10 h-10 text-primary" />} 
                title="Transmission Services" 
                description="Transmission fluid exchange, filter replacement, and system flushes."
            />
        </div>
      </div>

      <div className="bg-white py-16">
         <div className="container mx-auto px-4">
             <div className="flex flex-col md:flex-row gap-12">
                 <div className="flex-1">
                     <h3 className="text-2xl font-bold mb-6 text-text">SCHEDULE SERVICE</h3>
                     <form className="space-y-4">
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <input type="text" placeholder="Name" className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-primary" />
                             <input type="text" placeholder="Phone" className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-primary" />
                         </div>
                         <input type="email" placeholder="Email" className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-primary" />
                         <textarea placeholder="Message / Service Needed" rows={4} className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-primary"></textarea>
                         <button className="bg-primary text-white font-bold py-3 px-8 rounded hover:bg-orange-600 transition uppercase">
                             Request Appointment
                         </button>
                     </form>
                 </div>
                 <div className="flex-1">
                     <h3 className="text-2xl font-bold mb-6 text-text">OPENING HOURS</h3>
                     <div className="space-y-3 text-gray-600">
                         <div className="flex justify-between border-b pb-2">
                             <span>Monday</span>
                             <span>9:00 AM - 9:00 PM</span>
                         </div>
                         <div className="flex justify-between border-b pb-2">
                             <span>Tuesday</span>
                             <span>9:00 AM - 9:00 PM</span>
                         </div>
                         <div className="flex justify-between border-b pb-2">
                             <span>Wednesday</span>
                             <span>9:00 AM - 9:00 PM</span>
                         </div>
                         <div className="flex justify-between border-b pb-2">
                             <span>Thursday</span>
                             <span>9:00 AM - 9:00 PM</span>
                         </div>
                         <div className="flex justify-between border-b pb-2">
                             <span>Friday</span>
                             <span>9:00 AM - 7:00 PM</span>
                         </div>
                         <div className="flex justify-between border-b pb-2">
                             <span>Saturday</span>
                             <span>9:00 AM - 7:00 PM</span>
                         </div>
                         <div className="flex justify-between border-b pb-2 text-red-500">
                             <span>Sunday</span>
                             <span>CLOSED</span>
                         </div>
                     </div>
                 </div>
             </div>
         </div>
      </div>

      <Footer />
    </main>
  );
}

function ServiceCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
    return (
        <div className="bg-white p-8 rounded-lg shadow-sm hover:shadow-md transition border border-gray-100 flex flex-col items-center text-center">
            <div className="mb-4 p-4 bg-gray-50 rounded-full">
                {icon}
            </div>
            <h3 className="text-xl font-bold mb-3 text-text">{title}</h3>
            <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
        </div>
    )
}
