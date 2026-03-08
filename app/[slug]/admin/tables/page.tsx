"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Plus, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";

import { useParams } from "next/navigation";

export default function AdminTables() {
  const { slug } = useParams();
  const [tables, setTables] = useState<number[]>([1, 2, 3, 4, 5]);
  const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}/${slug}` : `http://localhost:3000/${slug}`;

  const addTable = () => {
    const nextTable = tables.length > 0 ? Math.max(...tables) + 1 : 1;
    setTables([...tables, nextTable]);
  };

  const removeTable = (num: number) => {
    if (confirm(`Delete Table ${num}?`)) {
      setTables(tables.filter(t => t !== num));
    }
  };

  const printQR = (num: number) => {
    const printWindow = window.open('', '', 'width=600,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Table ${num} - QR Code</title>
            <style>
              body { 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                justify-content: center; 
                height: 100vh; 
                margin: 0; 
                font-family: sans-serif; 
              }
              .card {
                border: 2px solid #000;
                padding: 40px;
                border-radius: 20px;
                text-align: center;
              }
              h1 { font-size: 48px; margin: 0 0 20px 0; }
              p { font-size: 24px; margin: 20px 0 0 0; color: #666; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Table ${num}</h1>
              <div id="qrcode"></div>
              <p>Scan to Order</p>
            </div>
            <script>
              // Wait for React to render QR (simulated here by getting the SVG from parent or re-generating)
              // For simplicity in this popup, we'll ask user to just print the view or use a more complex printing lib
              // But effectively, printing the main page view is often easier.
              // Let's just close this and alert for now as a simple implementation.
            </script>
          </body>
        </html>
      `);
      // In a real app, we'd pass the SVG string or use a print specific component
      // For MVP, we will just instruct to print the page
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Table Management</h2>
          <p className="text-sm text-gray-500">Generate QR codes for your tables.</p>
        </div>
        <button 
          onClick={addTable}
          className="bg-primary hover:bg-orange-600 text-white px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors font-bold text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Add Table</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {tables.map((num) => (
          <div key={num} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col items-center text-center group hover:border-primary/30 transition-all">
            <div className="mb-4 bg-white p-2 rounded-lg shadow-sm border border-gray-100">
              <QRCodeSVG 
                value={`${baseUrl}?table=${num}`} 
                size={150}
                level="H"
                includeMargin={true}
              />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Table {num}</h3>
            <p className="text-xs text-gray-400 mb-4 break-all px-2">{`${baseUrl}?table=${num}`}</p>
            
            <div className="flex space-x-2 w-full">
              <Link 
                href={`/${slug}?table=${num}`}
                target="_blank"
                className="flex-1 py-2 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Test
              </Link>
              <button 
                onClick={() => window.print()} 
                className="flex-1 py-2 text-xs font-bold text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors flex items-center justify-center"
              >
                <Printer className="w-3 h-3 mr-1" />
                Print
              </button>
              <button 
                onClick={() => removeTable(num)}
                className="p-2 text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}