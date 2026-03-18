# Google Gemini AI Tool Integration

This documentation defines the tool definitions and API endpoints required to connect this platform to Google Gemini via **Function Calling**.

## 1. Tool Definitions (for Gemini)

You can copy and paste these JSON definitions into Google AI Studio or use them in your Gemini API call.

### Get Store Stats
```json
{
  "name": "get_store_stats",
  "description": "Retrieve sales, orders, and balance for a specific store.",
  "parameters": {
    "type": "object",
    "properties": {
      "slug": {
        "type": "string",
        "description": "The unique URL slug of the store."
      }
    },
    "required": ["slug"]
  }
}
```

### Create Manual Invoice
```json
{
  "name": "create_manual_invoice",
  "description": "Create a new payment link (invoice) for a customer.",
  "parameters": {
    "type": "object",
    "properties": {
      "slug": {
        "type": "string",
        "description": "The store slug."
      },
      "customer_phone": {
        "type": "string",
        "description": "Customer WhatsApp number (e.g., 08123456789)."
      },
      "amount": {
        "type": "number",
        "description": "The invoice amount in IDR."
      },
      "payment_method": {
        "type": "string",
        "enum": ["qris", "bank_transfer"],
        "description": "The requested payment gateway."
      }
    },
    "required": ["slug", "customer_phone", "amount", "payment_method"]
  }
}
```

### List Recent Orders
```json
{
  "name": "list_recent_orders",
  "description": "Get the last 10 orders for a store.",
  "parameters": {
    "type": "object",
    "properties": {
      "slug": {
        "type": "string",
        "description": "The store slug."
      }
    },
    "required": ["slug"]
  }
}
```

## 2. API Endpoints (Base URL: https://gercep.click/api/ai)

All requests must include an `X-API-KEY` in the header for authentication.

### POST /stats
**Input**: `{ "slug": "store-slug" }`  
**Output**: Sales data, pending orders, and wallet balance.

### POST /invoice
**Input**: `{ "slug": "store-slug", "phone": "0812...", "amount": 50000, "method": "qris" }`  
**Output**: `{ "orderId": 123, "paymentUrl": "https://..." }`

### POST /orders
**Input**: `{ "slug": "store-slug" }`  
**Output**: Array of recent order objects with status and total.

---

## 3. How to Connect in Google AI Studio

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Select a Gemini 1.5 model (Pro or Flash).
3. In the right sidebar, find **Tools** > **Functions**.
4. Click **Add Function** and paste the definitions above.
5. In your prompt, you can now say: *"Gemini, check the sales for my store 'pasar-segar' and create a 50k invoice for 0877..."*
6. Gemini will generate the JSON call, which your server will execute.
