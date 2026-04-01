import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureStoreSettingsSchema } from '@/lib/store-settings-schema';

export async function GET(req: NextRequest) {
  try {
    await ensureStoreSettingsSchema();
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const phone = searchParams.get('phone');
    const sessionId = searchParams.get('sessionId');
    const resetCart = searchParams.get('reset') === '1';

    if (!storeId || !phone) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get store information
    const numericStoreId = Number(storeId);
    const sessionIdNum = Number(sessionId || 0) || 0;
    const normalizedPhone = String(phone)
      .replace(/\D/g, "")
      .replace(/^0/, "62")
      .replace(/^8/, "628");

    const store = await prisma.store.findUnique({
      where: { id: numericStoreId },
      select: {
        id: true,
        name: true,
        slug: true,
        themeColor: true,
        whatsapp: true,
        feePaidBy: true,
        taxPercent: true,
        serviceChargePercent: true,
        qrisFeePercent: true,
        gopayFeePercent: true,
        manualTransferFee: true
      }
    });

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const rawGopayFeePercent = Number((store as any).gopayFeePercent);
    const safeGopayFeePercent = Number.isFinite(rawGopayFeePercent) && rawGopayFeePercent > 0 ? rawGopayFeePercent : 2.5;

    const [sessionByPair, sessionById] = await Promise.all([
      prisma.whatsAppSession
        .findUnique({
          where: {
            phoneNumber_storeId: {
              phoneNumber: normalizedPhone,
              storeId: numericStoreId
            }
          },
          select: { metadata: true }
        })
        .catch(() => null),
      sessionIdNum
        ? prisma.whatsAppSession.findUnique({ where: { id: sessionIdNum }, select: { metadata: true } }).catch(() => null)
        : Promise.resolve(null)
    ]);

    let initialCartRaw = ((sessionByPair?.metadata as any)?.webviewCart ?? (sessionById?.metadata as any)?.webviewCart ?? null) as any;
    if (resetCart) {
      initialCartRaw = {};
      await prisma.whatsAppSession
        .upsert({
          where: { phoneNumber_storeId: { phoneNumber: normalizedPhone, storeId: numericStoreId } },
          update: {
            metadata: {
              ...((sessionByPair?.metadata as any) || {}),
              webviewCart: {}
            } as any
          },
          create: {
            phoneNumber: normalizedPhone,
            storeId: numericStoreId,
            step: "START",
            cart: [],
            metadata: { webviewCart: {} } as any
          }
        })
        .catch(() => null);

      if (sessionIdNum) {
        await prisma.whatsAppSession
          .update({
            where: { id: sessionIdNum },
            data: {
              metadata: {
                ...((sessionById?.metadata as any) || {}),
                webviewCart: {}
              } as any
            }
          })
          .catch(() => null);
      }
    }

    // Get all categories for this store
    const categories = await prisma.category.findMany({
      where: { storeId: Number(storeId) },
      select: {
        name: true,
        slug: true
      }
    });

    // Get all active products with stock for this store
    const allProducts = await prisma.product.findMany({
      where: { 
        storeId: Number(storeId), 
        stock: { gt: 0 },
        category: { notIn: ["_ARCHIVED_", "System"] }
      },
      select: {
        id: true,
        name: true,
        price: true,
        image: true,
        stock: true,
        category: true
      }
    });

    const brandColor = store.themeColor || "#6366f1";
    const hex = String(brandColor).trim();
    const brandRgb =
      /^#?[0-9a-fA-F]{6}$/.test(hex)
        ? (() => {
            const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
            const r = parseInt(normalized.slice(0, 2), 16);
            const g = parseInt(normalized.slice(2, 4), 16);
            const b = parseInt(normalized.slice(4, 6), 16);
            return `${r},${g},${b}`;
          })()
        : "99,102,241";

    const storeWhatsAppNumber = String(store.whatsapp || "")
      .replace(/\D/g, "")
      .replace(/^0/, "62");

    const categorySlugs = new Set<string>(categories.map((c) => c.slug).filter(Boolean) as any);
    const categoryNameToSlug = new Map<string, string>(
      categories
        .filter((c) => c && c.slug && c.name)
        .map((c) => [String(c.name).toLowerCase(), String(c.slug)])
    );
    const resolveCategorySlug = (raw: any) => {
      const v = String(raw ?? "").trim();
      if (!v) return "uncategorized";
      if (categorySlugs.has(v)) return v;
      const byName = categoryNameToSlug.get(v.toLowerCase());
      if (byName) return byName;
      return "uncategorized";
    };
    const hasUncategorized = allProducts.some((p) => resolveCategorySlug(p.category) === "uncategorized");

    // Generate HTML for the webview
    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="dns-prefetch" href="https://app.midtrans.com">
    <link rel="dns-prefetch" href="https://api.midtrans.com">
    <link rel="dns-prefetch" href="https://app.sandbox.midtrans.com">
    <link rel="dns-prefetch" href="https://api.sandbox.midtrans.com">
    <link rel="preconnect" href="https://app.midtrans.com" crossorigin>
    <link rel="preconnect" href="https://api.midtrans.com" crossorigin>
    <link rel="preconnect" href="https://app.sandbox.midtrans.com" crossorigin>
    <link rel="preconnect" href="https://api.sandbox.midtrans.com" crossorigin>
    <title>${store.name} - Pilih Produk</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root{
            --bg: #0b1220;
            --panel: rgba(255,255,255,0.06);
            --panel2: rgba(255,255,255,0.08);
            --border: rgba(255,255,255,0.10);
            --text: rgba(255,255,255,0.92);
            --muted: rgba(255,255,255,0.65);
            --brand: ${brandColor};
            --brand2: #22c55e;
            --danger: #ef4444;
        }
        a, button, input { -webkit-tap-highlight-color: transparent; }
        body { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; }
        .container { max-width: 520px; margin: 0 auto; min-height: 100vh; width: 100%; padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
        .header { padding: 18px 16px 12px; }
        .header-inner { background: linear-gradient(135deg, var(--brand) 0%, #111827 100%); border: 1px solid var(--border); border-radius: 16px; padding: 16px; }
        .store-name { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 4px; }
        .store-desc { font-size: 13px; color: var(--muted); }
        .search { margin-top: 12px; }
        .search-input {
            width: 100%;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.12);
            color: var(--text);
            border-radius: 12px;
            padding: 12px 12px;
            font-size: 14px;
            outline: none;
        }
        .search-input::placeholder { color: rgba(255,255,255,0.55); }
        .search-input:focus { border-color: rgba(${brandRgb},0.45); box-shadow: 0 0 0 3px rgba(${brandRgb},0.18); }
        
        .categories { padding: 8px 16px 10px; }
        .category-tabs { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; -webkit-overflow-scrolling: touch; }
        .category-tabs::-webkit-scrollbar { height: 0; }
        .category-tab { 
            flex-shrink: 0; padding: 10px 14px; background: var(--panel); 
            border: 1px solid var(--border);
            border-radius: 999px; font-size: 13px; font-weight: 700; 
            cursor: pointer; transition: transform 0.15s, background 0.15s, border-color 0.15s;
            color: var(--text);
            user-select: none;
            white-space: nowrap;
        }
        .category-tab:active { transform: scale(0.98); }
        .category-tab.active { background: rgba(${brandRgb},0.18); border-color: rgba(${brandRgb},0.35); }
        
        .products { padding: 6px 16px 16px; }
        .product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        @media (min-width: 410px) { .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .product-card { 
            background: var(--panel); border-radius: 14px; padding: 10px; min-width: 0;
            border: 1px solid var(--border);
            box-shadow: 0 10px 24px rgba(0,0,0,0.25); transition: transform 0.15s, border-color 0.15s;
            backdrop-filter: blur(12px);
        }
        .product-card:active { transform: scale(0.99); }
        .product-image { 
            width: 100%; height: 104px; object-fit: cover; 
            border-radius: 12px; background: rgba(255,255,255,0.05);
            display: block;
        }
        .product-name { 
            font-size: 13px; font-weight: 800; margin: 10px 0 6px; word-break: break-word;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .product-price { 
            font-size: 14px; font-weight: 900; color: rgba(255,255,255,0.92); 
            margin-bottom: 10px;
        }
        .product-actions { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .qty-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
        .qty-btn { 
            width: 30px; height: 30px; border-radius: 999px; flex: 0 0 auto;
            background: rgba(${brandRgb},0.35); color: white; border: 1px solid rgba(${brandRgb},0.40);
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; cursor: pointer; line-height: 1;
            touch-action: manipulation;
        }
        .qty-btn:active { transform: scale(0.98); }
        .qty-display { 
            min-width: 24px; text-align: center; font-weight: 900; flex: 1 1 auto;
        }
        .add-btn { 
            width: 100%; padding: 10px 12px; background: #10b981; 
            color: white; border: none; border-radius: 6px;
            font-weight: 700; cursor: pointer;
            touch-action: manipulation;
        }
        .add-btn { background: linear-gradient(135deg, var(--brand2) 0%, var(--brand) 100%); border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; }
        .add-btn:active { transform: scale(0.99); }
        .meta-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
        .stock { font-size: 11px; color: var(--muted); font-weight: 700; }
        
        .cart-bar { 
            position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
            width: min(520px, 100%);
            background: rgba(17,24,39,0.90); padding: 12px 14px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid rgba(255,255,255,0.10);
            box-shadow: 0 -12px 28px rgba(0,0,0,0.35); z-index: 30;
            backdrop-filter: blur(12px);
        }
        .cart-total { 
            font-size: 14px; font-weight: 900; color: rgba(255,255,255,0.92);
            margin-bottom: 10px; text-align: center;
        }
        .checkout-btn { 
            width: 100%; padding: 14px; background: #3b82f6;
            color: white; border: none; border-radius: 8px;
            font-size: 16px; font-weight: 800; cursor: pointer;
            touch-action: manipulation;
        }
        .checkout-btn { background: linear-gradient(135deg, var(--brand) 0%, #111827 100%); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; }
        .checkout-btn:active { transform: scale(0.99); }

        .debug {
            position: fixed;
            top: 8px;
            left: 50%;
            transform: translateX(-50%);
            width: min(520px, calc(100% - 16px));
            background: rgba(17,24,39,0.92);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 12px;
            padding: 10px 12px;
            z-index: 9999;
            backdrop-filter: blur(10px);
            display: none;
        }
        .debug-title { font-weight: 900; font-size: 12px; margin-bottom: 4px; }
        .debug-line { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 11px; color: rgba(255,255,255,0.78); white-space: pre-wrap; }

        .modal {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.55);
            z-index: 60;
            display: none;
            padding: 12px;
            overflow: auto;
            -webkit-overflow-scrolling: touch;
        }
        .sheet {
            width: min(520px, 100%);
            margin: 0 auto;
            background: rgba(17,24,39,0.96);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            box-shadow: 0 22px 60px rgba(0,0,0,0.55);
            overflow: hidden;
            max-height: calc(100vh - 24px);
            display: flex;
            flex-direction: column;
        }
        .sheet-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 14px;
            border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .sheet-title { font-weight: 900; font-size: 14px; letter-spacing: -0.01em; }
        .sheet-close {
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.10);
            color: rgba(255,255,255,0.85);
            border-radius: 10px;
            padding: 8px 10px;
            font-weight: 800;
            cursor: pointer;
        }
        .sheet-body { padding: 14px; overflow: auto; -webkit-overflow-scrolling: touch; }
        .field { margin-bottom: 12px; }
        .label { font-size: 12px; font-weight: 900; color: rgba(255,255,255,0.78); margin-bottom: 6px; }
        .input, .textarea, .select {
            width: 100%;
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.12);
            color: var(--text);
            border-radius: 12px;
            padding: 10px 12px;
            font-size: 14px;
            outline: none;
        }
        .textarea { min-height: 74px; resize: vertical; }
        .row { display: flex; gap: 10px; }
        .row > .field { flex: 1 1 0; }
        .mini { font-size: 12px; color: var(--muted); margin-top: 6px; }
        .btn {
            width: 100%;
            padding: 12px 12px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.08);
            color: rgba(255,255,255,0.92);
            font-weight: 900;
            cursor: pointer;
            touch-action: manipulation;
        }
        .btn-primary {
            background: linear-gradient(135deg, var(--brand) 0%, #111827 100%);
        }
        .btn:active { transform: scale(0.99); }
        .options { display: grid; gap: 10px; margin-top: 10px; }
        .opt {
            width: 100%;
            text-align: left;
            padding: 12px 12px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.12);
            background: rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.92);
            cursor: pointer;
            touch-action: manipulation;
        }
        .opt.active { border-color: rgba(${brandRgb},0.55); background: rgba(${brandRgb},0.18); }
        .opt-title { font-weight: 900; font-size: 13px; }
        .opt-sub { margin-top: 4px; font-size: 12px; color: rgba(255,255,255,0.70); }
        .summary { margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.10); background: rgba(255,255,255,0.05); }
        .summary-line { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.85); }
        .summary-line strong { color: rgba(255,255,255,0.95); }
        .link { color: rgba(255,255,255,0.88); text-decoration: underline; }
        .items-list { margin: 0 0 10px 0; border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; overflow: hidden; background: rgba(255,255,255,0.04); }
        .items-row { display: flex; justify-content: space-between; gap: 10px; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); }
        .items-row:last-child { border-bottom: none; }
        .items-left { min-width: 0; }
        .items-name { font-weight: 900; font-size: 12px; color: rgba(255,255,255,0.92); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
        .items-qty { margin-top: 2px; font-size: 11px; color: rgba(255,255,255,0.66); font-weight: 800; }
        .items-price { font-weight: 900; font-size: 12px; color: rgba(255,255,255,0.92); white-space: nowrap; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-inner">
                <div class="store-name">${store.name}</div>
                <div class="store-desc">Pilih produk yang ingin dipesan</div>
                <div class="search">
                    <input class="search-input" id="search-input" type="search" placeholder="Cari produk..." autocomplete="off" />
                </div>
            </div>
        </div>
        
        <div class="categories">
            <div class="category-tabs">
                <div class="category-tab active" data-category="all" onclick="setActiveCategory('all')">Semua</div>
                ${categories.map(cat => 
                    `<div class="category-tab" data-category="${cat.slug}" onclick="setActiveCategory('${String(cat.slug).replace(/'/g, "\\'")}')">${cat.name}</div>`
                ).join('')}
                ${hasUncategorized ? `<div class="category-tab" data-category="uncategorized" onclick="setActiveCategory('uncategorized')">Lainnya</div>` : ""}
            </div>
        </div>
        
        <div class="products">
            <div class="product-grid" id="product-grid">
                ${allProducts.map(product => `
                    <div class="product-card" data-product-id="${product.id}" data-category="${resolveCategorySlug(product.category)}" data-price="${Number(product.price)}" data-name="${String(product.name).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">
                        <img src="${product.image || '/placeholder-product.jpg'}" alt="${product.name}" class="product-image" loading="lazy" decoding="async" onerror="this.src='/placeholder-product.jpg'">
                        <div class="product-name">${product.name}</div>
                        <div class="meta-row">
                            <div class="product-price">Rp ${new Intl.NumberFormat('id-ID').format(product.price)}</div>
                            <div class="stock">${Number(product.stock) > 0 ? `Stok ${Number(product.stock)}` : ""}</div>
                        </div>
                        <div class="product-actions">
                            <div class="qty-row">
                                <button class="qty-btn" type="button" data-action="qty" data-delta="-1" data-product-id="${product.id}" onclick="updateQuantity(${product.id}, -1)">-</button>
                                <span class="qty-display" id="qty-${product.id}">0</span>
                                <button class="qty-btn" type="button" data-action="qty" data-delta="1" data-product-id="${product.id}" onclick="updateQuantity(${product.id}, 1)">+</button>
                            </div>
                            <button class="add-btn" type="button" data-action="add" data-product-id="${product.id}" onclick="addToCart(${product.id})">Tambah</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="cart-bar">
            <div class="cart-total" id="cart-total">Total: Rp 0</div>
            <button class="checkout-btn" type="button" data-action="checkout" onclick="openCheckout()">Checkout - Rp 0</button>
        </div>
    </div>

    <div class="modal" id="checkout-modal">
        <div class="sheet">
            <div class="sheet-header">
                <div class="sheet-title">Checkout</div>
                <button class="sheet-close" type="button" onclick="closeCheckout()">Close</button>
            </div>
            <div class="sheet-body">
                <div class="field">
                    <div class="label">Phone</div>
                    <input class="input" id="customer-phone" type="tel" value="${String(phone).replace(/"/g, "&quot;")}" />
                    <div class="mini">Used for order receipt & courier contact.</div>
                </div>

                <div class="field">
                    <div class="label">Delivery Address</div>
                    <textarea class="textarea" id="delivery-address" placeholder="Full address + postal code (5 digits)"></textarea>
                    <div class="row" style="margin-top:10px;">
                        <div class="field" style="margin-bottom:0;">
                            <button class="btn" type="button" onclick="shareLocation()">Use my location</button>
                        </div>
                        <div class="field" style="margin-bottom:0;">
                            <button class="btn" type="button" onclick="getShippingQuotes()">Get shipping</button>
                        </div>
                    </div>
                    <div class="mini" id="loc-status">Location: not set</div>
                    <div class="mini"><a class="link" id="map-link" href="#" target="_blank" rel="noreferrer" style="display:none;">Open map</a></div>
                </div>

                <div class="field">
                    <div class="label">Shipping Options</div>
                    <div class="options" id="shipping-options"></div>
                </div>

                <div class="field">
                    <div class="label">Payment</div>
                    <select class="select" id="payment-type" onchange="setPaymentType(this.value)">
                        <option value="qris">QRIS</option>
                        <option value="gopay">GoPay</option>
                        <option value="bank_transfer">Bank Transfer</option>
                    </select>
                    <div class="mini">Payment will open here.</div>
                    <div class="mini" id="fee-hint"></div>
                </div>

                <div class="summary" id="checkout-summary">
                    <div class="items-list" id="items-list"></div>
                    <div class="summary-line"><span>Tax</span><strong id="sum-tax">Rp 0</strong></div>
                    <div class="summary-line"><span>Service</span><strong id="sum-service">Rp 0</strong></div>
                    <div class="summary-line"><span>Fee</span><strong id="sum-fee">Rp 0</strong></div>
                    <div class="summary-line"><span>Shipping</span><strong id="sum-ship">Rp 0</strong></div>
                    <div class="summary-line" style="margin-top:6px;"><span>Total</span><strong id="sum-total">Rp 0</strong></div>
                </div>

                <div style="margin-top:12px;">
                    <button class="btn btn-primary" id="pay-now-btn" type="button" onclick="payNow()">Pay Now</button>
                </div>
            </div>
        </div>
    </div>

    <div class="debug" id="debug">
        <div class="debug-title" id="debug-title">Debug</div>
        <div class="debug-line" id="debug-line"></div>
    </div>

    <script>
        var STORE_ID = ${Number(store.id) || 0};
        var STORE_WA_NUMBER = "${storeWhatsAppNumber}";
        var STORE_FEE_PAID_BY = "${String(store.feePaidBy || "CUSTOMER").replace(/"/g, "&quot;")}";
        var STORE_TAX_PERCENT = ${Number(store.taxPercent || 0)};
        var STORE_SERVICE_PERCENT = ${Number(store.serviceChargePercent || 0)};
        var STORE_QRIS_FEE_PERCENT = ${Number(store.qrisFeePercent || 0)};
        var STORE_GOPAY_FEE_PERCENT = ${Number(safeGopayFeePercent || 0)};
        var STORE_MANUAL_FEE = ${Number(store.manualTransferFee || 0)};
        var SESSION_ID = ${sessionIdNum};
        var RESET_CART = ${resetCart ? "true" : "false"};
        var CUSTOMER_PHONE = "${normalizedPhone}";
        var CART_STORAGE_KEY = "gercep_cart_" + String(STORE_ID) + "_" + String(CUSTOMER_PHONE);
        var INITIAL_CART_RAW = ${JSON.stringify(initialCartRaw ?? {})};
        var cart = {};
        var saveTimer = null;
        var total = 0;
        var activeCategory = 'all';
        var searchQuery = '';
        var shippingCost = 0;
        var shippingProvider = '';
        var shippingService = '';
        var shippingEta = '';
        var shippingKey = '';
        var deliveryLat = null;
        var deliveryLng = null;
        var paymentSpecificType = 'qris';

        function debugOn() {
            try {
                var params = (window.location && window.location.search) ? String(window.location.search) : '';
                return params.indexOf('debug=1') !== -1;
            } catch (e) { return false; }
        }

        function debugSet(title, line) {
            try {
                if (!debugOn()) return;
                var box = document.getElementById('debug');
                var titleEl = document.getElementById('debug-title');
                var lineEl = document.getElementById('debug-line');
                if (!box || !titleEl || !lineEl) return;
                box.style.display = 'block';
                titleEl.textContent = String(title || 'Debug');
                lineEl.textContent = String(line || '');
            } catch (e) {}
        }

        window.onerror = function (msg, src, line, col) {
            debugSet('JS Error', String(msg || '') + "\\n" + String(src || '') + ":" + String(line || 0) + ":" + String(col || 0));
        };

        function formatIdr(n) {
            var v = Number(n || 0);
            if (!isFinite(v)) v = 0;
            v = Math.round(v);
            try { return "Rp " + v.toLocaleString('id-ID'); } catch (e) { return "Rp " + String(v); }
        }

        function normalizeCartRaw(raw) {
            try {
                if (!raw) return {};
                if (Array.isArray(raw)) {
                    var obj = {};
                    for (var i = 0; i < raw.length; i++) {
                        var it = raw[i] || {};
                        var id = String(it.id || it.productId || '').trim();
                        var qty = Number(it.quantity || it.qty || 0);
                        if (!id || !isFinite(qty) || qty <= 0) continue;
                        obj[id] = Math.round(qty);
                    }
                    return obj;
                }
                if (typeof raw === 'object') return raw;
                return {};
            } catch (e) { return {}; }
        }

        function loadCart() {
            try {
                if (RESET_CART) {
                    try { localStorage.removeItem(CART_STORAGE_KEY); } catch (e) {}
                }
                var saved = localStorage.getItem(CART_STORAGE_KEY);
                if (saved) {
                    var parsed = JSON.parse(saved);
                    return normalizeCartRaw(parsed);
                }
            } catch (e) {}
            return normalizeCartRaw(INITIAL_CART_RAW);
        }

        function hydrateCartUI() {
            try {
                var all = document.querySelectorAll("[id^='qty-']");
                for (var i = 0; i < all.length; i++) {
                    try { all[i].textContent = "0"; } catch (e) {}
                }
                for (var productId in cart) {
                    if (!Object.prototype.hasOwnProperty.call(cart, productId)) continue;
                    var qty = Number(cart[productId] || 0);
                    var qtyEl = document.getElementById("qty-" + productId);
                    if (qtyEl) qtyEl.textContent = String(qty);
                }
            } catch (e) {}
        }

        function persistCart() {
            try {
                localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
            } catch (e) {}
            if (saveTimer) {
                try { clearTimeout(saveTimer); } catch (e) {}
            }
            saveTimer = setTimeout(function () {
                try {
                    fetch('/api/webview/cart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            storeId: STORE_ID,
                            phone: CUSTOMER_PHONE,
                            sessionId: SESSION_ID || null,
                            cart: cart
                        })
                    }).catch(function () { return null; });
                } catch (e) {}
            }, 450);
        }

        cart = loadCart();

        function updateQuantity(productId, change) {
            var currentQty = cart[productId] || 0;
            var newQty = currentQty + change;
            if (newQty < 0) newQty = 0;
            
            if (newQty === 0) {
                delete cart[productId];
            } else {
                cart[productId] = newQty;
            }
            
            var qtyEl = document.getElementById("qty-" + productId);
            if (qtyEl) qtyEl.textContent = String(newQty);
            updateCartTotal();
            debugSet('Action', 'updateQuantity(' + String(productId) + ', ' + String(change) + ') -> ' + String(newQty));
        }

        function addToCart(productId) { updateQuantity(productId, 1); }

        function itemsSubtotal() {
            var sum = 0;
            for (var productId in cart) {
                if (!Object.prototype.hasOwnProperty.call(cart, productId)) continue;
                var qty = Number(cart[productId] || 0);
                if (!qty) continue;
                var productElement = document.querySelector("[data-product-id='" + productId + "']");
                if (!productElement) continue;
                var price = Number(productElement.getAttribute('data-price') || 0);
                sum += price * qty;
            }
            return sum;
        }

        function calculateFees(subtotal) {
            var sub = Number(subtotal || 0);
            if (!isFinite(sub)) sub = 0;
            sub = Math.round(sub);

            var tax = Math.round(sub * (Number(STORE_TAX_PERCENT || 0) / 100));
            var service = Math.round(sub * (Number(STORE_SERVICE_PERCENT || 0) / 100));
            var base = sub + tax + service;
            var fee = 0;
            if (String(STORE_FEE_PAID_BY || '').toUpperCase() === 'CUSTOMER') {
                if (paymentSpecificType === 'qris' && Number(STORE_QRIS_FEE_PERCENT || 0)) {
                    fee = Math.round(base * (Number(STORE_QRIS_FEE_PERCENT || 0) / 100));
                } else if (paymentSpecificType === 'gopay' && Number(STORE_GOPAY_FEE_PERCENT || 0)) {
                    fee = Math.round(base * (Number(STORE_GOPAY_FEE_PERCENT || 0) / 100));
                } else if (paymentSpecificType === 'bank_transfer' && Number(STORE_MANUAL_FEE || 0)) {
                    fee = Math.round(Number(STORE_MANUAL_FEE || 0));
                }
            }
            return { tax: tax, service: service, fee: fee, base: base };
        }

        function cartWeightGrams() {
            var grams = 0;
            for (var productId in cart) {
                if (!Object.prototype.hasOwnProperty.call(cart, productId)) continue;
                var qty = Number(cart[productId] || 0);
                if (!qty) continue;
                grams += qty * 200;
            }
            return grams > 0 ? grams : 1000;
        }

        function updateCartTotal() {
            persistCart();
            var subtotal = itemsSubtotal();
            var fees = calculateFees(subtotal);
            var ship = Number(shippingCost || 0);
            if (!isFinite(ship)) ship = 0;
            ship = Math.round(ship);
            total = Number(fees.base || 0) + Number(fees.fee || 0) + ship;
            var totalText = "Total: " + formatIdr(total);
            var totalEl = document.getElementById("cart-total");
            if (totalEl) totalEl.textContent = totalText;
            var checkoutBtn = document.querySelector(".checkout-btn");
            if (checkoutBtn) checkoutBtn.textContent = "Checkout - " + formatIdr(total);
        }

        function setPaymentType(v) {
            paymentSpecificType = String(v || 'qris');
            updateCartTotal();
            refreshCheckoutSummary();
        }

        function openCheckout() {
            if (itemsSubtotal() <= 0) {
                alert("Please select products first.");
                return;
            }
            var modal = document.getElementById('checkout-modal');
            if (modal) modal.style.display = 'block';
            try { document.body.style.overflow = 'hidden'; } catch (e) {}
            refreshCheckoutSummary();
        }

        function closeCheckout() {
            var modal = document.getElementById('checkout-modal');
            if (modal) modal.style.display = 'none';
            try { document.body.style.overflow = ''; } catch (e) {}
        }

        function refreshCheckoutSummary() {
            var sub = itemsSubtotal();
            var fees = calculateFees(sub);
            var ship = Number(shippingCost || 0);
            if (!isFinite(ship)) ship = 0;
            ship = Math.round(ship);
            var tot = Number(fees.base || 0) + Number(fees.fee || 0) + ship;
            var elShip = document.getElementById('sum-ship');
            var elTotal = document.getElementById('sum-total');
            var elTax = document.getElementById('sum-tax');
            var elService = document.getElementById('sum-service');
            var elFee = document.getElementById('sum-fee');
            var elList = document.getElementById('items-list');

            if (elTax) elTax.textContent = formatIdr(fees.tax || 0);
            if (elService) elService.textContent = formatIdr(fees.service || 0);
            if (elFee) elFee.textContent = formatIdr(fees.fee || 0);
            if (elShip) elShip.textContent = formatIdr(ship);
            if (elTotal) elTotal.textContent = formatIdr(tot);

            if (elList) {
                var html = "";
                for (var productId in cart) {
                    if (!Object.prototype.hasOwnProperty.call(cart, productId)) continue;
                    var qty = Number(cart[productId] || 0);
                    if (!qty) continue;
                    var productElement = document.querySelector(\"[data-product-id='\" + productId + \"']\");
                    if (!productElement) continue;
                    var name = String(productElement.getAttribute('data-name') || '');
                    var price = Number(productElement.getAttribute('data-price') || 0);
                    var lineTotal = Math.round(price * qty);
                    html += \"<div class='items-row'><div class='items-left'><div class='items-name'>\" + name + \"</div><div class='items-qty'>x\" + String(qty) + \"</div></div><div class='items-price'>\" + formatIdr(lineTotal) + \"</div></div>\";
                }
                elList.innerHTML = html || (\"<div class='items-row'><div class='items-left'><div class='items-name'>No items</div></div><div class='items-price'>\" + formatIdr(0) + \"</div></div>\");
            }
        }

        function shareLocation() {
            if (!navigator || !navigator.geolocation) {
                alert("Geolocation is not supported on this device.");
                return;
            }
            var statusEl = document.getElementById('loc-status');
            if (statusEl) statusEl.textContent = "Location: detecting...";
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    deliveryLat = pos.coords.latitude;
                    deliveryLng = pos.coords.longitude;
                    if (statusEl) statusEl.textContent = "Location: " + String(deliveryLat) + ", " + String(deliveryLng);
                    var mapLink = document.getElementById('map-link');
                    if (mapLink) {
                        mapLink.style.display = 'inline';
                        mapLink.href = "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(String(deliveryLat)) + "&mlon=" + encodeURIComponent(String(deliveryLng)) + "#map=18/" + encodeURIComponent(String(deliveryLat)) + "/" + encodeURIComponent(String(deliveryLng));
                    }
                },
                function () {
                    if (statusEl) statusEl.textContent = "Location: not set";
                    alert("Unable to get your location. Please allow location permission.");
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
            );
        }

        function xhrJson(method, url, body, cb) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open(method, url, true);
                xhr.setRequestHeader('Content-Type', 'application/json');
                xhr.onreadystatechange = function () {
                    if (xhr.readyState !== 4) return;
                    var ok = xhr.status >= 200 && xhr.status < 300;
                    var data = null;
                    try { data = JSON.parse(xhr.responseText || "{}"); } catch (e) { data = { error: xhr.responseText || "Invalid JSON" }; }
                    cb(ok, data);
                };
                xhr.send(body ? JSON.stringify(body) : null);
            } catch (e) {
                cb(false, { error: String(e && e.message ? e.message : e) });
            }
        }

        function getShippingQuotes() {
            var addressEl = document.getElementById('delivery-address');
            var address = addressEl ? String(addressEl.value || '').replace(/^\\s+|\\s+$/g, '') : '';
            if (!address) {
                alert("Please enter your delivery address first (include postal code).");
                return;
            }
            var match = address.match(/\\b(\\d{5})\\b/);
            var postal = match && match[1] ? String(match[1]) : null;
            var payload = {
                storeId: STORE_ID,
                destinationAddress: address,
                destinationPostalCode: postal || undefined,
                destinationLatitude: (deliveryLat != null ? Number(deliveryLat) : undefined),
                destinationLongitude: (deliveryLng != null ? Number(deliveryLng) : undefined),
                weightGrams: cartWeightGrams()
            };
            var container = document.getElementById('shipping-options');
            if (container) container.innerHTML = "<div class='mini'>Loading shipping options...</div>";
            xhrJson('POST', '/api/shipping/quote', payload, function (ok, data) {
                if (!ok || !data || !data.success) {
                    if (container) container.innerHTML = "<div class='mini'>Failed to load shipping options.</div>";
                    return;
                }
                var options = data.options || [];
                if (!options || !options.length) {
                    if (container) container.innerHTML = "<div class='mini'>No shipping options available for this address.</div>";
                    return;
                }
                renderShippingOptions(options);
            });
        }

        function renderShippingOptions(options) {
            var container = document.getElementById('shipping-options');
            if (!container) return;
            while (container.firstChild) container.removeChild(container.firstChild);
            for (var i = 0; i < options.length; i++) {
                var o = options[i] || {};
                var provider = String(o.provider || '');
                var service = String(o.service || '');
                var eta = String(o.eta || '');
                var fee = Number(o.fee || 0);
                var key = provider + "|" + service + "|" + String(Math.round(Number(fee || 0))) + "|" + eta;
                var active = (key === shippingKey);

                var btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'opt' + (active ? ' active' : '');
                btn.setAttribute('data-provider', provider);
                btn.setAttribute('data-service', service);
                btn.setAttribute('data-key', key);
                var handler = (function (p, s, f, e) {
                    return function () { selectShipping(p, s, f, e); };
                })(provider, service, fee, eta);
                btn.onclick = handler;
                btn.ontouchend = handler;
                btn.onpointerup = handler;

                var t = document.createElement('div');
                t.className = 'opt-title';
                t.textContent = provider + ' ' + service + ' • ' + formatIdr(fee);
                var sub = document.createElement('div');
                sub.className = 'opt-sub';
                sub.textContent = 'ETA: ' + (eta || '-');

                btn.appendChild(t);
                btn.appendChild(sub);
                container.appendChild(btn);
            }
        }

        function selectShipping(provider, service, fee, eta) {
            shippingProvider = String(provider || '');
            shippingService = String(service || '');
            shippingCost = Math.round(Number(fee || 0));
            shippingEta = String(eta || '');
            shippingKey = shippingProvider + "|" + shippingService + "|" + String(shippingCost) + "|" + shippingEta;
            updateCartTotal();
            refreshCheckoutSummary();
            debugSet('Action', 'selectShipping ' + shippingProvider + ' ' + shippingService + ' fee=' + String(shippingCost));

            var container = document.getElementById('shipping-options');
            if (container) {
                var buttons = container.querySelectorAll('.opt');
                for (var i = 0; i < buttons.length; i++) {
                    var b = buttons[i];
                    var k = b.getAttribute('data-key');
                    if (k === shippingKey) b.classList.add('active');
                    else b.classList.remove('active');
                }
            }
        }

        function payNow() {
            var sub = itemsSubtotal();
            if (sub <= 0) {
                alert("Please select products first.");
                return;
            }
            var payBtn = document.getElementById('pay-now-btn');
            if (payBtn) {
                payBtn.setAttribute('disabled', 'disabled');
                payBtn.textContent = 'Opening payment...';
            }
            var customerPhoneEl = document.getElementById('customer-phone');
            var customerPhone = customerPhoneEl ? String(customerPhoneEl.value || '').replace(/\\D/g, '') : '';

            var addressEl = document.getElementById('delivery-address');
            var address = addressEl ? String(addressEl.value || '').replace(/^\\s+|\\s+$/g, '') : '';

            if (!address) {
                alert("Please fill delivery address.");
                return;
            }
            if (!shippingProvider || !shippingService || !shippingCost) {
                alert("Please select a shipping option.");
                return;
            }

            var items = [];
            for (var productId in cart) {
                if (!Object.prototype.hasOwnProperty.call(cart, productId)) continue;
                var qty = Number(cart[productId] || 0);
                if (!qty) continue;
                items.push({ id: parseInt(productId, 10), quantity: qty });
            }

            var fees = calculateFees(sub);
            var finalTotal = Math.round(Number(fees.base || 0) + Number(fees.fee || 0) + Number(shippingCost || 0));
            var customerInfo = {
                phone: customerPhone ? ("62" + customerPhone.replace(/^62/, "")) : "${String(phone).replace(/\D/g, "")}",
                shippingProvider: shippingProvider,
                shippingService: shippingService,
                shippingAddress: address,
                shippingCost: Math.round(Number(shippingCost || 0)),
                shippingEta: shippingEta || null,
                destinationLatitude: (deliveryLat != null ? Number(deliveryLat) : null),
                destinationLongitude: (deliveryLng != null ? Number(deliveryLng) : null)
            };
            var payload = {
                storeId: STORE_ID,
                items: items,
                total: finalTotal,
                customerInfo: customerInfo,
                paymentMethod: "midtrans",
                specificType: paymentSpecificType,
                orderType: "DELIVERY",
                fast: 1
            };
            debugSet('Action', 'payNow provider=' + shippingProvider + ' total=' + String(finalTotal));
            xhrJson('POST', '/api/checkout', payload, function (ok, data) {
                if (!ok || !data || !data.success) {
                    alert(String((data && data.error) ? data.error : "Checkout failed. Please try again."));
                    if (payBtn) {
                        payBtn.removeAttribute('disabled');
                        payBtn.textContent = 'Pay Now';
                    }
                    return;
                }

                if (data && data.isManual && data.orderId) {
                    window.location.href = "/checkout/pay/" + encodeURIComponent(String(data.orderId));
                    return;
                }

                var paymentUrl = data.paymentUrl || data.redirect_url || (data.paymentResult && (data.paymentResult.paymentUrl || data.paymentResult.invoiceUrl || data.paymentResult.redirect_url));
                if (paymentUrl) {
                    try { window.location.href = String(paymentUrl); } catch (e) { window.location.assign(String(paymentUrl)); }
                    return;
                }
                if (data && data.orderId) {
                    window.location.href = "/checkout/pay/" + encodeURIComponent(String(data.orderId));
                    return;
                }
                alert("Payment link unavailable. Please try again.");
                if (payBtn) {
                    payBtn.removeAttribute('disabled');
                    payBtn.textContent = 'Pay Now';
                }
            });
        }

        function applyFilters() {
            var cards = document.querySelectorAll('.product-card');
            for (var i = 0; i < cards.length; i++) {
                var card = cards[i];
                var cardCategory = card.getAttribute('data-category');
                var name = (card.getAttribute('data-name') || '');
                name = String(name).toLowerCase();
                var matchCategory = (activeCategory === 'all' || cardCategory === activeCategory);
                var matchSearch = (!searchQuery || name.indexOf(searchQuery) !== -1);
                card.style.display = (matchCategory && matchSearch) ? 'block' : 'none';
            }
            debugSet('Filter', 'category=' + String(activeCategory) + ' search=' + String(searchQuery) + ' total=' + String(total));
        }

        function setActiveCategory(categoryId) {
            activeCategory = categoryId || 'all';
            var tabs = document.querySelectorAll('.category-tab');
            for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
            var activeTab = document.querySelector(".category-tab[data-category='" + activeCategory + "']") || document.querySelector(".category-tab[data-category='all']");
            if (activeTab) activeTab.classList.add('active');
            applyFilters();
            debugSet('Action', 'setActiveCategory(' + String(activeCategory) + ')');
        }

        var searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', function (e) {
                var v = (e && e.target && e.target.value) ? String(e.target.value) : '';
                searchQuery = String(v).replace(/^\\s+|\\s+$/g, '').toLowerCase();
                applyFilters();
            });
        }

        try {
            var fh = document.getElementById('fee-hint');
            if (fh) {
                fh.textContent =
                    "FeePaidBy: " + String(STORE_FEE_PAID_BY || "-") +
                    " • QRIS " + String(Number(STORE_QRIS_FEE_PERCENT || 0)) + "%" +
                    " • GoPay " + String(Number(STORE_GOPAY_FEE_PERCENT || 0)) + "%" +
                    " • Transfer Rp " + formatIdr(Number(STORE_MANUAL_FEE || 0));
            }
        } catch (e) {}
        debugSet('Boot', 'script_loaded=true ua=' + String(navigator && navigator.userAgent ? navigator.userAgent : ''));
        hydrateCartUI();
        updateCartTotal();
        setActiveCategory('all');
    </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[WEBVIEW_ERROR]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
