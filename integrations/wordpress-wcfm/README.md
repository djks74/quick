# Gercep WCFM Sync Plugin

This plugin allows WCFM (WooCommerce Multivendor Marketplace) vendors to sync their products automatically with the Gercep platform. Once synced, the Gercep AI Assistant will be able to handle customer orders for these products via WhatsApp.

## Installation

1. Create a new folder named `gercep-wcfm-sync` in your WordPress `wp-content/plugins` directory.
2. Copy the `gercep-wcfm-sync.php` file into that folder.
3. Activate the plugin from the WordPress Admin Dashboard.

## Setup for Vendors

1. Go to your **WCFM Vendor Dashboard**.
2. Navigate to **Settings** > **General**.
3. You will see a new field: **Gercep API Key**.
4. Log in to your Gercep account, go to **Integrations**, and copy your **Sovereign API Key**.
5. Paste the key into the WCFM field and save.

## How it works

- **Real-time Sync**: Whenever you add or update a product in WCFM, it is instantly pushed to Gercep.
- **Deletions**: Deleting a product in WCFM will also remove it from your Gercep store.
- **AI Ready**: Gercep's AI assistant uses the name, price, category, and description synced from WCFM to help customers on WhatsApp.
- **Category Flattening**: The plugin automatically takes the most specific category from WooCommerce to keep the AI search efficient.
