import os
import requests
import google.generativeai as genai

# Konfigurasi
# Gunakan API Key yang sudah kamu simpan di Super Admin Dashboard
GEMINI_API_KEY = "AIzaSyCsCAkM_fKGJfrdYEnXhslfCVTRxcey8lk"
# Ganti dengan X-API-KEY yang kamu set di Vercel (default: gercep_ai_secret_123)
AI_API_KEY = "gercep_ai_secret_123"
BASE_URL = "https://gercep.click/api/ai"

genai.configure(api_key=GEMINI_API_KEY)

def call_gercep_api(endpoint, payload):
    headers = {"x-api-key": AI_API_KEY}
    resp = requests.post(f"{BASE_URL}/{endpoint}", json=payload, headers=headers)
    if resp.status_code != 200:
        return {"error": f"API Error {resp.status_code}: {resp.text}"}
    return resp.json()

# --- DEFINISI FUNGSI (LOGIKA API) ---

def search_stores(query: str):
    """Mencari toko berdasarkan nama atau kategori."""
    print(f"\n[Sistem] Mencari toko: {query}...")
    return call_gercep_api("search-stores", {"query": query})

def get_store_products(slug: str):
    """Mengambil daftar menu dari slug toko."""
    print(f"\n[Sistem] Mengambil menu untuk: {slug}...")
    return call_gercep_api("store-products", {"slug": slug})

def create_customer_order(slug: str, customer_phone: str, items: list, order_type: str, address: str = ""):
    """Melakukan pemesanan ke toko."""
    print(f"\n[Sistem] Membuat pesanan untuk {customer_phone}...")
    payload = {
        "slug": slug,
        "customer_phone": customer_phone,
        "items": items,
        "order_type": order_type,
        "address": address
    }
    return call_gercep_api("create-order", payload)

def get_store_stats(slug: str):
    """Melihat statistik penjualan toko."""
    print(f"\n[Sistem] Mengambil stats untuk: {slug}...")
    return call_gercep_api("stats", {"slug": slug})

# --- SETUP GEMINI ---

model = genai.GenerativeModel(
    model_name='gemini-1.5-flash',
    tools=[search_stores, get_store_products, create_customer_order, get_store_stats],
    system_instruction="Kamu adalah asisten AI Gercep.click. Gunakan fungsi yang tersedia untuk membantu user mencari toko, memesan makanan, atau melihat statistik toko jika mereka adalah pemilik."
)

chat = model.start_chat(enable_automatic_function_calling=True)

print("\n" + "="*40)
print("🚀 AI GERCEP BRIDGE LIVE")
print("Ketik 'keluar' untuk stop")
print("="*40 + "\n")

while True:
    try:
        user_input = input("User: ")
        if user_input.lower() in ['keluar', 'exit', 'quit']: break
        
        response = chat.send_message(user_input)
        print(f"\nGemini: {response.text}\n")
    except Exception as e:
        print(f"\n[Error] {str(e)}\n")
