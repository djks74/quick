import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="absolute top-4 right-4">
        <Link 
          href="/login" 
          className="px-4 py-2 text-gray-600 font-medium hover:text-gray-900"
        >
          Login
        </Link>
      </div>
      
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl font-bold text-gray-900">
          Launch Your Digital Menu in Seconds
        </h1>
        <p className="text-xl text-gray-600">
          Accept orders via WhatsApp, Midtrans, or Manual Transfer. No coding required.
        </p>
        <div className="flex gap-4 justify-center">
          <Link 
            href="/demo" 
            className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
          >
            View Demo Store
          </Link>
          <Link 
            href="/register" 
            className="px-8 py-3 bg-white border border-gray-300 text-gray-900 rounded-xl font-bold hover:bg-gray-50 transition-colors"
          >
            Create Your Store
          </Link>
        </div>
      </div>
    </div>
  );
}
