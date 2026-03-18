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
... (existing) ...

### Search Stores
```json
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
}
```

### List Store Products
```json
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
}
```

### Create Customer Order
```json
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
```

## 2. API Endpoints (Base URL: https://gercep.click/api/ai)
... (existing) ...

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
4. Click **Add Function** and paste the definitions above.
5. In your prompt, you can now say: *"Gemini, check the sales for my store 'pasar-segar' and create a 50k invoice for 0877..."*
6. Gemini will generate the JSON call, which your server will execute.
