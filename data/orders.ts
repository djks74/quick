import { Product } from "@/lib/types";

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  variation?: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerEmail: string;
  status: 'pending' | 'processing' | 'on-hold' | 'completed' | 'cancelled' | 'refunded' | 'failed';
  total: number;
  currency: 'USD' | 'IDR';
  date: string;
  items: OrderItem[];
  shippingAddress: string;
}

export const sampleOrders: Order[] = [
  {
    id: "ORD-001",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    status: "completed",
    total: 1250.00,
    currency: "USD",
    date: "2024-03-01T10:30:00Z",
    items: [
      { id: "OI-001", productId: "1", productName: "BMW B58 Charge Pipe", quantity: 1, price: 1250.00 }
    ],
    shippingAddress: "123 Main St, New York, NY 10001"
  },
  {
    id: "ORD-002",
    customerName: "Budi Santoso",
    customerEmail: "budi@gmail.com",
    status: "processing",
    total: 15500000,
    currency: "IDR",
    date: "2024-03-05T14:15:00Z",
    items: [
      { id: "OI-002", productId: "2", productName: "Custom Stage 2 Tune", quantity: 1, price: 15500000, variation: "B58 Engine" }
    ],
    shippingAddress: "Jl. Sudirman No. 45, Jakarta, Indonesia"
  },
  {
    id: "ORD-003",
    customerName: "Jane Smith",
    customerEmail: "jane@company.com",
    status: "on-hold",
    total: 850.00,
    currency: "USD",
    date: "2024-03-06T09:00:00Z",
    items: [
      { id: "OI-003", productId: "3", productName: "Downpipe High Flow", quantity: 1, price: 850.00 }
    ],
    shippingAddress: "456 Oak Ave, Los Angeles, CA 90012"
  }
];
