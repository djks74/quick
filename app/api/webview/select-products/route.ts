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
        id: true,
        name: true,
        slug: true,
        image: true
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
        description: true,
        price: true,
        image: true,
        stock: true,
        variations: true,
        category: true
      }
    });

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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; overflow-x: hidden; }
        .container { max-width: 480px; margin: 0 auto; background: white; min-height: 100vh; width: 100%; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
        .store-name { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
        .store-desc { font-size: 14px; opacity: 0.9; }
        
        .categories { padding: 15px; background: white; }
        .category-tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; -webkit-overflow-scrolling: touch; }
        .category-tab { 
            flex-shrink: 0; padding: 10px 16px; background: #f1f5f9; 
            border-radius: 20px; font-size: 14px; font-weight: 500; 
            cursor: pointer; transition: all 0.2s;
        }
        .category-tab.active { background: #3b82f6; color: white; }
        
        .products { padding: 15px; padding-bottom: calc(120px + env(safe-area-inset-bottom)); }
        .product-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        @media (min-width: 420px) {
            .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        .product-card { 
            background: white; border-radius: 12px; padding: 10px; min-width: 0;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;
        }
        .product-card:active { transform: scale(0.98); }
        .product-image { 
            width: 100%; height: 96px; object-fit: cover; 
            border-radius: 8px; background: #f8fafc;
        }
        .product-name { 
            font-size: 13px; font-weight: 600; margin: 8px 0 4px; word-break: break-word;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .product-price { 
            font-size: 14px; font-weight: 700; color: #059669; 
            margin-bottom: 10px;
        }
        .product-actions { display: grid; grid-template-columns: 1fr; gap: 8px; }
        .qty-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
        .qty-btn { 
            width: 30px; height: 30px; border-radius: 50%; flex: 0 0 auto;
            background: #3b82f6; color: white; border: none;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; cursor: pointer; line-height: 1;
        }
        .qty-display { 
            min-width: 24px; text-align: center; font-weight: 700; flex: 1 1 auto;
        }
        .add-btn { 
            width: 100%; padding: 10px 12px; background: #10b981; 
            color: white; border: none; border-radius: 6px;
            font-weight: 700; cursor: pointer;
        }
        
        .cart-bar { 
            position: fixed; bottom: 0; left: 50%; transform: translateX(-50%);
            width: min(480px, 100%);
            background: white; padding: 14px 15px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid #e5e7eb;
            box-shadow: 0 -4px 12px rgba(0,0,0,0.1); z-index: 20;
        }
        .cart-total { 
            font-size: 16px; font-weight: 800; color: #059669;
            margin-bottom: 10px; text-align: center;
        }
        .checkout-btn { 
            width: 100%; padding: 14px; background: #3b82f6;
            color: white; border: none; border-radius: 8px;
            font-size: 16px; font-weight: 800; cursor: pointer;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="store-name">${store.name}</div>
            <div class="store-desc">Pilih produk yang ingin dipesan</div>
        </div>
        
        <div class="categories">
            <div class="category-tabs">
                <div class="category-tab active" data-category="all">Semua</div>
                ${categories.map(cat => 
                    `<div class="category-tab" data-category="${cat.id}">${cat.name}</div>`
                ).join('')}
            </div>
        </div>
        
        <div class="products">
            <div class="product-grid" id="product-grid">
                ${allProducts.map(product => `
                    <div class="product-card" data-product-id="${product.id}" data-category="${product.category || 'all'}">
                        <img src="${product.image || '/placeholder-product.jpg'}" alt="${product.name}" class="product-image" onerror="this.src='/placeholder-product.jpg'">
                        <div class="product-name">${product.name}</div>
                        <div class="product-price">Rp ${new Intl.NumberFormat('id-ID').format(product.price)}</div>
                        <div class="product-actions">
                            <div class="qty-row">
                                <button class="qty-btn" onclick="updateQuantity(${product.id}, -1)">-</button>
                                <span class="qty-display" id="qty-${product.id}">0</span>
                                <button class="qty-btn" onclick="updateQuantity(${product.id}, 1)">+</button>
                            </div>
                            <button class="add-btn" onclick="addToCart(${product.id})">Tambah</button>
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

        function updateQuantity(productId, change) {
            const currentQty = cart[productId] || 0;
            const newQty = Math.max(0, currentQty + change);
            
            if (newQty === 0) {
                delete cart[productId];
            } else {
                cart[productId] = newQty;
            }
            
            document.getElementById("qty-" + productId).textContent = newQty;
            updateCartTotal();
        }

        function addToCart(productId) {
            updateQuantity(productId, 1);
        }

        function updateCartTotal() {
            total = 0;
            Object.entries(cart).forEach(([productId, qty]) => {
                const productElement = document.querySelector("[data-product-id='" + productId + "']");
                const priceText = productElement.querySelector('.product-price').textContent;
                const price = parseInt(priceText.replace(/[^0-9]/g, ''));
                total += price * qty;
            });
            
            document.getElementById("cart-total").textContent = "Total: Rp " + total.toLocaleString('id-ID');
            document.querySelector(".checkout-btn").textContent = "Checkout - Rp " + total.toLocaleString('id-ID');
        }

        function checkout() {
            if (total === 0) {
                alert("Silakan pilih produk terlebih dahulu");
                return;
            }
            
            const cartItems = Object.entries(cart).map(([productId, qty]) => ({
                productId: parseInt(productId),
                quantity: qty
            }));
            
            // Send cart data back to WhatsApp
            const message = "Saya ingin memesan:\n" + 
                cartItems.map(item => 
                    "- " + item.quantity + "x " + 
                    document.querySelector("[data-product-id='" + item.productId + "'] .product-name").textContent
                ).join("\n") + 
                "\n\nTotal: Rp " + total.toLocaleString('id-ID');
            
            // Close webview and send message back to WhatsApp
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'CHECKOUT',
                message: message,
                cart: cartItems
            }));
            
            // Fallback for non-React Native environments
            alert("Pesanan akan diproses melalui WhatsApp. Silakan tutup halaman ini.");
            window.close();
        }

        // Category filtering
        document.querySelectorAll('.category-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const categoryId = tab.getAttribute('data-category');
                document.querySelectorAll('.product-card').forEach(card => {
                    const cardCategory = card.getAttribute('data-category');
                    if (categoryId === 'all' || cardCategory === categoryId) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });
    </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
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
