# Shopify Integration for Gercep

Since Shopify is a closed platform, you can integrate using a **Shopify Custom App** and a small script.

## Setup Instructions

1. **Create a Custom App** in your Shopify Admin (Settings > App and sales channels > Develop apps).
2. **Configure Admin API scopes**: `read_products`, `write_products`.
3. **Install the app** and get your **Admin API access token**.
4. **Setup a Webhook** in Shopify for `product/update` and `product/create`.
5. Point the webhook to your bridge server or use this payload format to Gercep:

### Payload Mapping
Shopify Webhook $\rightarrow$ Gercep API:
- `id` $\rightarrow$ `externalId`
- `title` $\rightarrow$ `name`
- `variants[0].price` $\rightarrow$ `price`
- `body_html` $\rightarrow$ `description`
- `variants[0].inventory_quantity` $\rightarrow$ `stock`
- `image.src` $\rightarrow$ `image`

### API Endpoint
`POST https://gercep.click/api/partner/sync-products`
Header: `x-api-key: YOUR_SOVEREIGN_API_KEY`
