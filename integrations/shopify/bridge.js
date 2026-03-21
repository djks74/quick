/**
 * Gercep Shopify Bridge (Node.js Example)
 * 
 * Setup a Webhook in Shopify Admin (Settings > Notifications) 
 * for "Product update" and point it to your server running this code.
 */

const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const GERCEP_API_KEY = 'YOUR_SOVEREIGN_API_KEY';
const GERCEP_API_URL = 'https://gercep.click/api/partner/sync-products';

app.post('/shopify-webhook', async (req, res) => {
    const shopifyProduct = req.body;

    const payload = {
        action: 'upsert',
        products: [{
            externalId: String(shopifyProduct.id),
            name: shopifyProduct.title,
            price: parseFloat(shopifyProduct.variants[0]?.price || 0),
            category: 'Shopify Product',
            description: shopifyProduct.body_html?.replace(/<[^>]*>?/gm, ''), // Strip HTML
            stock: shopifyProduct.variants[0]?.inventory_quantity || 0,
            image: shopifyProduct.image?.src || null
        }]
    };

    try {
        await axios.post(GERCEP_API_URL, payload, {
            headers: { 'x-api-key': GERCEP_API_KEY }
        });
        console.log(`Synced product: ${shopifyProduct.title}`);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Sync failed:', err.message);
        res.status(500).send('Error');
    }
});

app.listen(3000, () => console.log('Gercep Bridge listening on port 3000'));
