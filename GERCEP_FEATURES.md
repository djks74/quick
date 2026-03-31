# Gercep — Feature Overview (Presentation-Ready)

This document summarizes the end-to-end features available in **Gercep** (customer ordering + merchant operations), including WhatsApp flows, web storefront/webview, and the merchant back office.

---

## 1) Customer Experience

### Store discovery
- Search stores by name, category/type (e.g., grocery/cafe/restaurant), or by what the customer wants to buy.
- Location-aware suggestions (ask for area or share-location when needed).
- Multi-store browsing and selection.

### Ordering channels
- **Web storefront / web chat**: used primarily for discovery and guidance.
- **WhatsApp ordering**: primary flow for shopping and completing orders.
- **WebView checkout**: fast checkout experience that can open payment gateway inside the checkout flow.

### Shopping & cart
- Browse product categories and product lists (interactive).
- Add items, adjust quantity, and review cart.
- Notes/instructions (where supported).

### Delivery / pickup
- Customer delivery address capture and order type selection (store-dependent).
- Shipping options selection during checkout (carrier/service/ETA/price).

### Payment
- Online payment gateway (e.g., QRIS / Midtrans where enabled).
- Manual transfer option (store-dependent).
- Invoice/tagihan payment flow (merchant-driven).

### Order lifecycle visibility
- Order created and processed in-store.
- Store can mark paid / completed (merchant operations).

---

## 2) Merchant Admin (Back Office)

### Dashboard
- Business summary widgets (orders, activity, key metrics).
- Live order notifications panel (new orders, payment success, etc.).

### Product & catalog management
- Create/edit products (name, price, stock, images, descriptions).
- Categories and sub-categories.
- Product types:
  - Simple products
  - Variable products (variations/options)
- Bulk import via CSV (with mapping guidance).
- Duplicate products for faster catalog building.

### Barcode & SKU management (Products)
- Barcode/SKU field available on products.
- Auto-generated product barcodes for POS scanning (EAN-13 support).
- Print/download barcode labels (Save as PDF via browser print).

### Ingredients & recipes (Inventory linkage)
- Attach ingredients (inventory items) to products with quantities and units.
- Supports unit conversions (gram/kg/pcs + conversion factor).

### Store configuration
- Store open/close and active/inactive controls (role/plan dependent).
- Tax & service charge configuration.
- POS settings (grid columns, payment methods, enable/disable).
- Payment settings (enable Midtrans / QRIS, manual transfer, fees).

### Staff management
- Staff roles (e.g., cashier/manager) and access controls per store.

---

## 3) POS (Point of Sale)

### Fast checkout workflow
- Product search, category filtering, quick cart operations.
- Discount and tipping controls (where enabled in POS flow).
- Multiple POS payment methods configuration (cash/card/QRIS/other).

### Barcode scanning (Products Sold)
- **Hardware scanner support** (keyboard-wedge scanners: scan → adds to cart).
- **Camera barcode scanning** (phone/tablet camera overlay in POS):
  - Auto-detects barcodes and adds matching products to cart.
  - Shows feedback if barcode not found.

### Receipt printing
- Print receipt from POS (browser print flow).

---

## 4) Inventory (Ingredients / Raw Materials)

### Inventory item management
- Create/manage ingredients (name, unit, stock, min stock, cost price).
- Ingredient barcode field (unique per store).
- Auto-generated ingredient barcodes if not provided.

### Stock adjustments
- Add stock / reduce stock quickly.
- Min-stock alerts.

### Camera stock scanner
- Dedicated inventory scanner page (camera-based scanning).
- Scan ingredient barcode → tap to add/reduce stock.

### Barcode label printing (Ingredients)
- Print ingredient barcode labels (Save as PDF via print).

---

## 5) Shipping & Logistics

### Shipping quotes
- Calculate shipping options (provider/service/ETA/fee) when delivery is enabled.
- Customer selects shipping option during checkout.

### Shipping order handling
- Delivery orders can create shipping draft/orders with provider integrations (store-dependent).

---

## 6) Payments

### Online payments
- Payment gateway integration (e.g., Midtrans, QRIS) where enabled.
- “Pay Now” flows optimized to open payment gateway quickly.

### Invoice / Tagihan (Merchant flows)
- Merchants can create invoices/tagihan and share payment links (merchant-only utilities).

---

## 7) WhatsApp Automation & Customer Support

### WhatsApp commerce flows
- Start shopping from WhatsApp using store context (store ID / slug resolution).
- Interactive browsing via WhatsApp message buttons (categories/products).

### AI assistant (Gercep Assistant)
- Helps customer discover stores and products.
- Supports merchant-only utilities (e.g., shipping-only / invoice-only workflows).
- Channel-aware guidance (web vs WhatsApp).

---

## 8) Notifications

### Real-time-ish store notifications
- New order notifications
- Payment success notifications
- Mark read / mark all read actions

---

## 9) Super Admin (Platform Operations)

- Manage merchants/stores and platform settings.
- View platform analytics/traffic/usage pages.
- Admin-level controls for troubleshooting and oversight.

---

## 10) Security & Reliability (Highlights)

- Role-based access controls for sensitive actions (merchant/admin-only tools).
- Input sanitization on signup to prevent stored XSS in profile/store fields.
- Safer APIs with fallbacks to reduce noisy client failures (where appropriate).

---

## Appendix: Practical “How to Present” Slides (Suggested)

1. What is Gercep? (omnichannel ordering + merchant OS)
2. Customer Journey (discover → shop → delivery → pay)
3. Merchant Back Office (catalog, pricing, store controls)
4. POS + Barcode (hardware + camera)
5. Inventory + Ingredient Barcode + Recipe linkage
6. Shipping + Payments (gateway + invoice/tagihan)
7. WhatsApp + AI Assistant
8. Operational tooling (notifications + super admin)

