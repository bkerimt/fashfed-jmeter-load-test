/**
 * FashFed Demo Store — yük testi için sahte (mock) e-ticaret API'si
 * ------------------------------------------------------------------
 * Gerçek bir siteye izinsiz yük testi yapmak yasa dışıdır (DoS sayılır).
 * Bu yüzden testlerimizi bu demo sunucuya karşı çalıştırıyoruz.
 *
 * Hiçbir paket gerektirmez, sadece Node.js (18+) yeterli:
 *     node server.js
 *
 * Gerçekçi olsun diye sunucu "kapasite" taklidi yapar:
 *   - CAPACITY     : rahatça kaldırdığı eş zamanlı istek sayısı
 *   - MAX_INFLIGHT : bunun üstünde gelen istekler 503 ile reddedilir
 * Eş zamanlı istek CAPACITY'yi aştıkça yanıt süreleri uzar.
 * Böylece JMeter ile "sistem kaç kullanıcıda bozulmaya başlıyor?"
 * sorusunu gerçekten gözlemleyebiliriz.
 */

const http = require("http");
const crypto = require("crypto");

// ---- Ayarlar (ortam değişkeniyle değiştirilebilir) -------------------------
const PORT = Number(process.env.PORT) || 8080;
const CAPACITY = Number(process.env.CAPACITY) || 50;
const MAX_INFLIGHT = Number(process.env.MAX_INFLIGHT) || 200;
const CAMPAIGN_STOCK = Number(process.env.CAMPAIGN_STOCK) || 500;
const DEMO_PASSWORD = "Test1234!";

// ---- Demo veri -------------------------------------------------------------
const categories = ["kadin", "erkek", "ayakkabi", "aksesuar"];
const names = {
  kadin: ["Saten Elbise", "Oversize Gömlek", "Yüksek Bel Jean", "Triko Hırka", "Keten Pantolon"],
  erkek: ["Slim Fit Gömlek", "Chino Pantolon", "Basic Tişört", "Kapüşonlu Sweat", "Deri Ceket"],
  ayakkabi: ["Beyaz Sneaker", "Chelsea Bot", "Koşu Ayakkabısı", "Loafer", "Sandalet"],
  aksesuar: ["Deri Kemer", "Güneş Gözlüğü", "Sırt Çantası", "İpek Fular", "Kol Saati"],
};

const products = [];
let id = 1001;
for (const category of categories) {
  for (let i = 0; i < 10; i++) {
    const name = names[category][i % 5] + (i >= 5 ? " Premium" : "");
    products.push({
      id: id++,
      name,
      category,
      price: 199.9 + ((id * 37) % 1800), // her çalıştırmada aynı fiyat
      stock: 10000,
    });
  }
}

// Kampanya: ilk ürün "flaş indirim" ürünü, stoğu sınırlı
const campaign = {
  code: "FLASH50",
  title: "Flaş Kampanya — %50 İndirim",
  discountPercent: 50,
  productId: 1001,
  stockLeft: CAMPAIGN_STOCK,
};

const sessions = new Map(); // token -> { email, cart: [] }
let orderSeq = 1;

// ---- Metrikler -------------------------------------------------------------
let inflight = 0;
let peakInflight = 0;
let totalRequests = 0;
let rejected503 = 0;

// ---- Yardımcılar -----------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Yük arttıkça yavaşlayan yanıt süresi
function latency(baseMs) {
  const over = Math.max(0, inflight - CAPACITY);
  const jitter = Math.random() * baseMs * 0.3;
  return baseMs + jitter + over * 12;
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = type.startsWith("application/json") ? JSON.stringify(body) : body;
  res.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

function auth(req) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  return token && sessions.has(token) ? sessions.get(token) : null;
}

// ---- Rotalar ---------------------------------------------------------------
async function route(req, res, url) {
  const path = url.pathname;
  const method = req.method;

  if (method === "GET" && path === "/health") {
    return send(res, 200, { status: "UP" });
  }

  if (method === "GET" && path === "/metrics") {
    return send(res, 200, {
      inflight,
      peakInflight,
      totalRequests,
      rejected503,
      capacity: CAPACITY,
      maxInflight: MAX_INFLIGHT,
      campaignStockLeft: campaign.stockLeft,
      activeSessions: sessions.size,
    });
  }

  if (method === "GET" && path === "/") {
    await sleep(latency(40));
    return send(
      res,
      200,
      "<!doctype html><html lang='tr'><head><meta charset='utf-8'><title>FashFed Demo Store</title></head>" +
        "<body><h1>FashFed Demo Store</h1><p>Yük testi için demo mağaza.</p>" +
        `<p>Aktif kampanya: ${campaign.title}</p></body></html>`,
      "text/html; charset=utf-8"
    );
  }

  if (method === "GET" && path === "/api/products") {
    await sleep(latency(60));
    const cat = url.searchParams.get("category");
    const list = cat ? products.filter((p) => p.category === cat) : products;
    return send(res, 200, { count: list.length, products: list });
  }

  const productMatch = path.match(/^\/api\/products\/(\d+)$/);
  if (method === "GET" && productMatch) {
    await sleep(latency(40));
    const p = products.find((x) => x.id === Number(productMatch[1]));
    return p ? send(res, 200, p) : send(res, 404, { error: "PRODUCT_NOT_FOUND" });
  }

  if (method === "GET" && path === "/api/campaigns/active") {
    await sleep(latency(30));
    return send(res, 200, campaign);
  }

  if (method === "POST" && path === "/api/auth/login") {
    await sleep(latency(120)); // şifre doğrulama pahalıdır
    const body = await readJson(req);
    if (!body || !body.email || body.password !== DEMO_PASSWORD) {
      return send(res, 401, { error: "INVALID_CREDENTIALS" });
    }
    const token = crypto.randomBytes(16).toString("hex");
    sessions.set(token, { email: body.email, cart: [] });
    return send(res, 200, { token, email: body.email });
  }

  if (method === "POST" && path === "/api/cart") {
    await sleep(latency(80));
    const session = auth(req);
    if (!session) return send(res, 401, { error: "UNAUTHORIZED" });
    const body = await readJson(req);
    const p = body && products.find((x) => x.id === Number(body.productId));
    if (!p) return send(res, 400, { error: "INVALID_PRODUCT" });
    const qty = Math.max(1, Number(body.quantity) || 1);
    session.cart.push({ productId: p.id, quantity: qty, unitPrice: p.price });
    return send(res, 200, { items: session.cart.length, cart: session.cart });
  }

  if (method === "GET" && path === "/api/cart") {
    await sleep(latency(40));
    const session = auth(req);
    if (!session) return send(res, 401, { error: "UNAUTHORIZED" });
    return send(res, 200, { items: session.cart.length, cart: session.cart });
  }

  if (method === "POST" && path === "/api/checkout") {
    await sleep(latency(200)); // ödeme en ağır işlem
    const session = auth(req);
    if (!session) return send(res, 401, { error: "UNAUTHORIZED" });
    if (session.cart.length === 0) return send(res, 400, { error: "EMPTY_CART" });

    const campaignItems = session.cart.filter((i) => i.productId === campaign.productId);
    const campaignQty = campaignItems.reduce((s, i) => s + i.quantity, 0);
    if (campaignQty > 0) {
      if (campaign.stockLeft < campaignQty) {
        return send(res, 409, { error: "CAMPAIGN_STOCK_OUT", stockLeft: campaign.stockLeft });
      }
      campaign.stockLeft -= campaignQty;
    }

    const total = session.cart.reduce((s, i) => {
      const discount = i.productId === campaign.productId ? campaign.discountPercent / 100 : 0;
      return s + i.unitPrice * i.quantity * (1 - discount);
    }, 0);
    const order = { orderId: `ORD-${orderSeq++}`, total: Math.round(total * 100) / 100 };
    session.cart = [];
    return send(res, 201, order);
  }

  // Testler arasında kampanya stoğunu ve oturumları sıfırlamak için
  if (method === "POST" && path === "/api/admin/reset") {
    campaign.stockLeft = CAMPAIGN_STOCK;
    sessions.clear();
    peakInflight = 0;
    totalRequests = 0;
    rejected503 = 0;
    return send(res, 200, { reset: true });
  }

  return send(res, 404, { error: "NOT_FOUND", path });
}

// ---- Sunucu ----------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const isOps = url.pathname === "/health" || url.pathname === "/metrics";

  if (!isOps) {
    totalRequests++;
    if (inflight >= MAX_INFLIGHT) {
      rejected503++;
      return send(res, 503, { error: "SERVICE_UNAVAILABLE", reason: "Sunucu kapasitesi doldu" });
    }
  }

  if (!isOps) inflight++;
  peakInflight = Math.max(peakInflight, inflight);
  try {
    await route(req, res, url);
  } catch (err) {
    send(res, 500, { error: "INTERNAL_ERROR", message: err.message });
  } finally {
    if (!isOps) inflight--;
  }
});

server.listen(PORT, () => {
  console.log(`FashFed Demo Store http://localhost:${PORT} adresinde çalışıyor`);
  console.log(`CAPACITY=${CAPACITY}  MAX_INFLIGHT=${MAX_INFLIGHT}  CAMPAIGN_STOCK=${CAMPAIGN_STOCK}`);
});
