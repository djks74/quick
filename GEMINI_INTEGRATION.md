# Google Gemini AI Tool Integration

This documentation defines the tool definitions and API endpoints required to connect this platform to Google Gemini via **Function Calling**.

## 1. Tool Definitions (for Gemini)

You can copy and paste these JSON definitions into Google AI Studio or use them in your Gemini API call.

```json
[
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
  },
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
  },
  {
    "name": "search_stores",
    "description": "Find restaurants or stores by name or food category.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search keyword (e.g., 'Pizza', 'Coffee', 'Burger')."
        }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_store_products",
    "description": "Get the menu/products list for a specific store slug.",
    "parameters": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string",
          "description": "The unique slug of the store."
        }
      },
      "required": ["slug"]
    }
  },
  {
    "name": "create_customer_order",
    "description": "Place an order for a user at a specific store.",
    "parameters": {
      "type": "object",
      "properties": {
        "slug": {
          "type": "string",
          "description": "Store slug."
        },
        "customer_phone": {
          "type": "string",
          "description": "User's WhatsApp number."
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "productId": { "type": "integer" },
              "quantity": { "type": "integer" }
            }
          },
          "description": "List of product IDs and quantities."
        },
        "order_type": {
          "type": "string",
          "enum": ["DINE_IN", "TAKEAWAY"],
          "description": "Order type."
        },
        "address": {
          "type": "string",
          "description": "Delivery address (if takeaway)."
        }
      },
      "required": ["slug", "customer_phone", "items", "order_type"]
    }
  }
]
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

### POST /search-stores
**Input**: `{ "query": "pizza" }`  
**Output**: Array of `{ name, slug, image }`

### POST /store-products
**Input**: `{ "slug": "store-slug" }`  
**Output**: Array of `{ id, name, price, category }`

### POST /create-order
**Input**: `{ "slug", "customer_phone", "items": [{ productId, quantity }], "order_type", "address" }`  
**Output**: `{ success, orderId, paymentUrl }`

---

## 3. How to Connect in Google AI Studio

1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Select a Gemini 1.5 model (Pro or Flash).
3. In the right sidebar, find **Tools** > **Functions**.
4. Click **Add Function** and paste the JSON array above.
5. In your prompt, you can now say: *"Gemini, check the sales for my store 'pasar-segar' and create a 50k invoice for 0877..."*

---

## 4. How to Connect in the Gemini App (Mobile/Web)

To use Gercep directly inside the consumer Gemini App (gemini.google.com), you need to create a **Gem** with an **OpenAPI Extension**.

### Step A: Prepare the OpenAPI Spec
The platform automatically hosts an OpenAPI specification at:
`https://gercep.click/openapi.yaml`

### Step B: Create a Custom Gem
1. Open [Gemini](https://gemini.google.com/).
2. Click on **Gems Manager** (or "Create a Gem").
3. Give it a name like **"Gercep Assistant"**.
4. In **Instructions**, paste:
   > "You are the Gercep Platform Assistant. You help users search for stores, browse menus, and create orders. When a user asks for food, search for stores first. If they want to order, show them the products and then use create_order. Always ask for their WhatsApp number and preferred payment method (QRIS or Bank Transfer)."
5. Click **Add Tool** or **Extensions**.
6. Select **OpenAPI** (if available) or paste the content of `openapi.yaml`.
7. For **Authentication**, choose **API Key**:
   - **Key Name**: `X-API-KEY`
   - **Value**: `gercep_ai_secret_123` (or your configured key)

### Step C: Chat!
You can now talk to your Gem on your phone:
- *"Cari nasi uduk yang enak"*
- *"Pesan 2 porsi dari resto 'nasi-uduk-bahari' ke nomor 08123456789 via QRIS"*
- Gemini will execute the tool call, create the order, and give you the payment link.
