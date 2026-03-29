import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const phone = searchParams.get('phone');
    const sessionId = searchParams.get('sessionId');

    if (!storeId || !phone) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Get store information
    const store = await prisma.store.findUnique({
      where: { id: Number(storeId) },
      select: {
        id: true,
        name: true,
        slug: true,
        themeColor: true
      }
    });

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
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
        stock: { gt: 0 }
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

    const categorySlugs = new Set<string>(categories.map((c) => c.slug).filter(Boolean) as any);
    const hasUncategorized = allProducts.some((p) => !p.category || !categorySlugs.has(String(p.category)));

    // Generate HTML for the webview
    const html = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        body { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); overflow-x: hidden; }
        .container { max-width: 520px; margin: 0 auto; min-height: 100vh; width: 100%; padding-bottom: calc(110px + env(safe-area-inset-bottom)); }
        .header { padding: 18px 16px 12px; }
        .header-inner { background: linear-gradient(135deg, var(--brand) 0%, #111827 100%); border: 1px solid var(--border); border-radius: 16px; padding: 16px; }
        .store-name { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; margin-bottom: 4px; }
        .store-desc { font-size: 13px; color: var(--muted); }
        
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
        }
        .qty-btn:active { transform: scale(0.98); }
        .qty-display { 
            min-width: 24px; text-align: center; font-weight: 900; flex: 1 1 auto;
        }
        .add-btn { 
            width: 100%; padding: 10px 12px; background: #10b981; 
            color: white; border: none; border-radius: 6px;
            font-weight: 700; cursor: pointer;
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
        }
        .checkout-btn { background: linear-gradient(135deg, var(--brand) 0%, #111827 100%); border: 1px solid rgba(255,255,255,0.12); border-radius: 14px; }
        .checkout-btn:active { transform: scale(0.99); }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-inner">
                <div class="store-name">${store.name}</div>
                <div class="store-desc">Pilih produk yang ingin dipesan</div>
            </div>
        </div>
        
        <div class="categories">
            <div class="category-tabs">
                <div class="category-tab active" data-category="all">Semua</div>
                ${categories.map(cat => 
                    `<div class="category-tab" data-category="${cat.slug}">${cat.name}</div>`
                ).join('')}
                ${hasUncategorized ? `<div class="category-tab" data-category="uncategorized">Lainnya</div>` : ""}
            </div>
        </div>
        
        <div class="products">
            <div class="product-grid" id="product-grid">
                ${allProducts.map(product => `
                    <div class="product-card" data-product-id="${product.id}" data-category="${product.category && categorySlugs.has(String(product.category)) ? String(product.category) : "uncategorized"}" data-price="${Number(product.price)}" data-name="${String(product.name).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">
                        <img src="${product.image || '/placeholder-product.jpg'}" alt="${product.name}" class="product-image" loading="lazy" decoding="async" onerror="this.src='/placeholder-product.jpg'">
                        <div class="product-name">${product.name}</div>
                        <div class="meta-row">
                            <div class="product-price">Rp ${new Intl.NumberFormat('id-ID').format(product.price)}</div>
                            <div class="stock">${Number(product.stock) > 0 ? `Stok ${Number(product.stock)}` : ""}</div>
                        </div>
                        <div class="product-actions">
                            <div class="qty-row">
                                <button class="qty-btn" type="button" data-action="qty" data-delta="-1" data-product-id="${product.id}">-</button>
                                <span class="qty-display" id="qty-${product.id}">0</span>
                                <button class="qty-btn" type="button" data-action="qty" data-delta="1" data-product-id="${product.id}">+</button>
                            </div>
                            <button class="add-btn" type="button" data-action="add" data-product-id="${product.id}">Tambah</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
        
        <div class="cart-bar">
            <div class="cart-total" id="cart-total">Total: Rp 0</div>
            <button class="checkout-btn" onclick="checkout()">Checkout - Rp 0</button>
        </div>
    </div>

    <script>
        const cart = {};
        let total = 0;
        let activeCategory = 'all';

        function updateQuantity(productId, change) {
            const currentQty = cart[productId] || 0;
            const newQty = Math.max(0, currentQty + change);
            
            if (newQty === 0) {
                delete cart[productId];
            } else {
                cart[productId] = newQty;
            }
            
            const qtyEl = document.getElementById("qty-" + productId);
            if (qtyEl) qtyEl.textContent = String(newQty);
            updateCartTotal();
        }

        function addToCart(productId) { updateQuantity(productId, 1); }

        function updateCartTotal() {
            total = 0;
            Object.entries(cart).forEach(([productId, qty]) => {
                const productElement = document.querySelector("[data-product-id='" + productId + "']");
                if (!productElement) return;
                const price = Number(productElement.getAttribute('data-price') || 0);
                total += price * Number(qty || 0);
            });
            
            const totalText = "Total: Rp " + total.toLocaleString('id-ID');
            const totalEl = document.getElementById("cart-total");
            if (totalEl) totalEl.textContent = totalText;
            const checkoutBtn = document.querySelector(".checkout-btn");
            if (checkoutBtn) checkoutBtn.textContent = "Checkout - Rp " + total.toLocaleString('id-ID');
        }

        function checkout() {
            if (total === 0) {
                alert("Silakan pilih produk terlebih dahulu");
                return;
            }
            
            const cartItems = Object.entries(cart).map(([productId, qty]) => ({
                productId: parseInt(productId),
                quantity: Number(qty || 0)
            }));
            
            const lines = cartItems
                .filter(item => item.quantity > 0)
                .map(item => {
                    const productElement = document.querySelector("[data-product-id='" + item.productId + "']");
                    const name = productElement ? (productElement.getAttribute('data-name') || '') : '';
                    return "- " + item.quantity + "x " + name;
                })
                .filter(Boolean);
            const message = "Saya ingin memesan:\n" + lines.join("\n") + "\n\nTotal: Rp " + total.toLocaleString('id-ID');
            
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'CHECKOUT',
                message: message,
                cart: cartItems
            }));
            
            alert("Pesanan akan diproses melalui WhatsApp. Silakan tutup halaman ini.");
            window.close();
        }

        function applyCategoryFilter(categoryId) {
            activeCategory = categoryId || 'all';
            document.querySelectorAll('.product-card').forEach(card => {
                const cardCategory = card.getAttribute('data-category');
                if (activeCategory === 'all' || cardCategory === activeCategory) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!target || !target.closest) return;
            const tab = target.closest('.category-tab');
            if (tab) {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                applyCategoryFilter(tab.getAttribute('data-category') || 'all');
                return;
            }
            const btn = target.closest('button');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            const pid = Number(btn.getAttribute('data-product-id') || 0);
            if (!pid) return;
            if (action === 'add') {
                addToCart(pid);
                return;
            }
            if (action === 'qty') {
                const delta = Number(btn.getAttribute('data-delta') || 0);
                updateQuantity(pid, delta);
                return;
            }
        }, { passive: true });

        applyCategoryFilter('all');
    </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
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
