export default function Hero() {
  return (
    <div className="relative bg-gray-900 text-white py-20 min-h-[500px] flex items-center">
      <div className="absolute inset-0 overflow-hidden">
         {/* Placeholder for hero background - simple gradient for now */}
         <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent z-10"></div>
      </div>
      
      <div className="container mx-auto px-4 relative z-20">
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          Professional <span className="text-primary">Car Tuning</span> & Parts
        </h1>
        <p className="text-xl mb-8 max-w-2xl text-gray-300">
          Get the best performance for your vehicle with our registered tuning licenses and high-quality parts.
        </p>
        <div className="flex space-x-4">
            <button className="bg-primary hover:bg-orange-700 text-white font-bold py-3 px-8 rounded transition">
              Shop Now
            </button>
            <button className="border border-white hover:bg-white hover:text-black text-white font-bold py-3 px-8 rounded transition">
              Contact Us
            </button>
        </div>
      </div>
    </div>
  );
}
