# FashFed — JMeter ile E-Ticaret Yük Testi

Yoğun trafikli bir moda e-ticaret sitesinde **flaş kampanya başladığı anda sistemin kaç eş zamanlı kullanıcıyı kaldırabildiğini** ölçen Apache JMeter projesi.

> ⚠️ **Önemli:** Testler, bu repodaki **FashFed Demo Store** (sahte API) üzerinde çalışır. Gerçek bir siteye sahibinin yazılı izni olmadan yük testi yapmak hizmet engelleme (DoS) saldırısı sayılır ve yasa dışıdır.

## Neden bu proje?

Kampanya anlarında trafik saniyeler içinde 10–50 katına çıkar. Bu proje şu sorulara cevap arar:

- Normal günde sistem hedeflenen kullanıcı sayısında yanıt süresi hedefini (SLA) tutturuyor mu? → **Load Test**
- Kampanya başladığında ani trafik sıçramasını kaldırıyor mu? → **Spike Test**
- Sistem kaç kullanıcıda bozulmaya başlıyor (kırılma noktası)? → **Stress Test**
- Sınırlı kampanya stoğu yoğunlukta doğru düşüyor mu, fazla satış oluyor mu? → **Veri doğruluğu**

## Teknolojiler

| Araç | Kullanım |
|---|---|
| Apache JMeter 5.6.3 | Test planları ve yük üretimi |
| Node.js 18+ | Demo mağaza API'si (bağımlılıksız) |
| GitHub Actions | Testlerin CI'da otomatik çalışması *(Aşama 5)* |

## Proje Yapısı

```
fashfed-jmeter-load-test/
├── mock-server/           # Test edilen sahte FashFed API'si
│   ├── server.js
│   └── package.json
├── test-plans/            # JMeter test planları (.jmx)
│   └── 01-smoke-test.jmx
├── docs/                  # Her aşamanın öğrenme notları
│   └── asama-1-jmeter-temelleri.md
├── results/               # Test çıktıları (.jtl) — git'e gönderilmez
└── reports/               # HTML raporlar — git'e gönderilmez
```

## Demo API Uç Noktaları

| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü |
| GET | `/` | Ana sayfa (HTML) |
| GET | `/api/products?category=kadin` | Ürün listesi (kadin, erkek, ayakkabi, aksesuar) |
| GET | `/api/products/{id}` | Ürün detayı |
| GET | `/api/campaigns/active` | Aktif flaş kampanya (`FLASH50`, ürün `1001`, sınırlı stok) |
| POST | `/api/auth/login` | Giriş — şifre: `Test1234!` |
| POST / GET | `/api/cart` | Sepete ekle / sepeti gör (Bearer token) |
| POST | `/api/checkout` | Sipariş ver — stok bitince `409` |
| GET | `/metrics` | Anlık yük, tepe eş zamanlı istek, reddedilen istek sayısı |
| POST | `/api/admin/reset` | Testler arasında stoğu ve oturumları sıfırlar |

Sunucu kapasite taklidi yapar: eş zamanlı istek `CAPACITY` (varsayılan 50) değerini aştıkça yavaşlar, `MAX_INFLIGHT` (varsayılan 200) üstünde `503` döner.

## Çalıştırma

**1. Demo mağazayı başlat**

```bash
cd mock-server
npm start
```

**2. Testi GUI'de aç (öğrenmek ve düzenlemek için)**

JMeter'ı aç → `File > Open` → `test-plans/01-smoke-test.jmx` → yeşil ▶ butonu.

**3. Testi komut satırından çalıştır (gerçek yük testleri hep böyle koşulur)**

```bash
jmeter -n -t test-plans/01-smoke-test.jmx -l results/smoke.jtl -e -o reports/smoke
```

Farklı sunucuya yönlendirmek için: `-Jhost=ornek.com -Jport=443 -Jprotocol=https`

## Yol Haritası

- [x] **Aşama 1 —** Proje iskeleti, demo mağaza, smoke test
- [ ] **Aşama 2 —** Kullanıcı yolculuğu: giriş → ürün → sepet → ödeme (CSV Data Set, JSON Extractor, think time)
- [ ] **Aşama 3 —** Load test: hedef kullanıcı sayısı, ramp-up, HTML dashboard raporu
- [ ] **Aşama 4 —** Kampanya senaryosu: spike + stress test, kırılma noktasının bulunması
- [ ] **Aşama 5 —** GitHub Actions ile otomatik koşum ve rapor
- [ ] **Aşama 6 —** Sonuç analizi ve bulgular raporu

## Yazar

**Beytullah Kerim Türkel** — Senior Software Testing & Quality Specialist
[LinkedIn](https://www.linkedin.com/in/bkerimt) · [GitHub](https://github.com/bkerimt)
