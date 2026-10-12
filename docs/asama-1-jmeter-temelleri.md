# Aşama 1 — JMeter Temelleri ve Smoke Test

## 1. Kurulum

1. **Java** kur (JDK 17 veya 21 önerilir). Kontrol: `java -version`
2. **JMeter** indir: jmeter.apache.org → *Download Releases* → `apache-jmeter-5.6.3.zip` (Binaries)
3. Zip'i boşluk ve Türkçe karakter içermeyen bir klasöre aç, ör. `C:\tools\apache-jmeter-5.6.3`
4. Aç:
   - Windows: `bin\jmeter.bat`
   - Mac/Linux: `bin/jmeter`
5. *(İsteğe bağlı)* `bin` klasörünü PATH'e ekle; böylece her yerden `jmeter` yazarak çalıştırırsın.
6. **Node.js** kur (18+) — demo mağazayı çalıştırmak için.

## 2. JMeter'ın Mantığı: Test Planı Bir Ağaçtır

JMeter'da her şey sol paneldeki ağaçtaki bir **eleman**dır. Hangi elemanın kimi etkileyeceği, ağaçtaki **konumuna** göre belirlenir: bir eleman, aynı seviyedeki ve altındaki her şeye uygulanır.

| Eleman türü | Ne işe yarar | Bizim planda |
|---|---|---|
| **Test Plan** | En üst kök; değişkenler burada | `PROTOCOL`, `HOST`, `PORT` |
| **Thread Group** | Sanal kullanıcılar. *Number of Threads* = kullanıcı sayısı, *Ramp-up* = hepsinin kaç saniyede devreye gireceği, *Loop* = her kullanıcının senaryoyu kaç kez tekrarlayacağı | 1 kullanıcı, 1 tur |
| **Sampler** | Gönderilen istek (HTTP Request) | 4 istek |
| **Config Element** | Ortak ayarlar | HTTP Request Defaults, Header Manager |
| **Assertion** | Yanıt doğru mu? Değilse istek *hatalı* sayılır | Durum kodu, süre, JSON alanları |
| **Listener** | Sonuçları gösterir/kaydeder | View Results Tree, Summary Report |

> **Kural:** Bir assertion bir sampler'ın **altına** konursa sadece o sampler'ı kontrol eder. Thread Group'un **doğrudan altına** konursa içindeki **tüm** sampler'ları kontrol eder. Bizim plandaki "Durum Kodu 200 Olmalı" ve "1 saniyeden kısa" bu yüzden Thread Group seviyesinde.

## 3. Planımızdaki Elemanlar

**User Defined Variables** — `${__P(host,localhost)}` şu demek: "Komut satırında `-Jhost=...` verilmişse onu kullan, verilmemişse `localhost`." Böylece aynı test planı farklı ortamlarda (test, staging) değiştirilmeden koşar.

**HTTP Request Defaults** — Her istekte tekrar tekrar sunucu adresi yazmamak için. Sampler'larda sadece *Path* doldurulur.

**HTTP Header Manager** — Tüm isteklere `Accept: application/json` başlığı ekler.

**Sampler'lar:**
1. `GET /health` → `$.status` değeri `UP` mı?
2. `GET /` → sayfada "FashFed" yazıyor mu?
3. `GET /api/products?category=kadin` → `$.count` 10 mu?
4. `GET /api/campaigns/active` → `$.code` `FLASH50` mi?

**JSON Assertion** — `$.status` bir **JSONPath** ifadesidir: `$` yanıtın kökü, `.status` içindeki alan. Postman'deki `pm.expect(json.status)` ile aynı mantık.

## 4. Neden Önce Smoke Test?

1000 kullanıcılık bir test başlatıp ilk dakikada hepsinin 404 aldığını görmek zaman kaybıdır. Smoke test, **tek kullanıcıyla** senaryonun doğru çalıştığını kanıtlar. Yük testinden önce her zaman koşulur.

## 5. GUI ve Komut Satırı (Non-GUI)

- **GUI**: Test planını **yazmak ve hata ayıklamak** için. View Results Tree'de her isteğin gidişini/dönüşünü görürsün.
- **Non-GUI (`-n`)**: **Gerçek yük** için. GUI çok bellek harcar; yük testleri asla GUI'de koşulmaz.

```bash
jmeter -n -t test-plans/01-smoke-test.jmx -l results/smoke.jtl -e -o reports/smoke
```

| Parametre | Anlamı |
|---|---|
| `-n` | GUI'siz mod |
| `-t` | Çalıştırılacak test planı |
| `-l` | Ham sonuç dosyası (.jtl) |
| `-e -o` | Test bitince HTML dashboard raporu üret, şu klasöre koy (klasör boş olmalı) |

Rapor sonra `reports/smoke/index.html` dosyasından açılır.

## 6. Summary Report Kolonlarını Okumak

| Kolon | Anlamı |
|---|---|
| **# Samples** | Kaç istek atıldı |
| **Average / Min / Max** | Yanıt süreleri (ms) |
| **Error %** | Assertion'ı geçemeyen veya hata dönen istek oranı |
| **Throughput** | Saniyede işlenen istek sayısı — sistemin "hızı" |

> Yük testlerinde ortalamaya değil **90. / 95. yüzdelik dilime (p90 / p95)** bakılır. "Ortalama 300 ms" iyi görünür ama kullanıcıların %5'i 4 saniye bekliyor olabilir. Bunu Aşama 3'te göreceğiz.

## 7. Kendin Dene (Alıştırmalar)

1. Thread Group'ta kullanıcı sayısını `10`, Loop'u `5` yap. Summary Report'ta kaç sample görmen gerekir? *(cevap: 4 istek × 10 × 5 = 200)*
2. `03 - Ürün Listesi` isteğinde `category` değerini `ayakkabi` yap ve testin hâlâ geçtiğini gör.
3. Kasıtlı olarak bir assertion'ı boz (ör. beklenen kodu `FLASH40` yap). View Results Tree'de kırmızı satırı ve hata mesajını incele, sonra geri al.
4. Yeni bir sampler ekle: `GET /api/products/1001` — sağ tık Thread Group → *Add → Sampler → HTTP Request*. Altına `$.id` = `1001` JSON Assertion'ı ekle.
5. Demo sunucuyu `CAPACITY=5` ile başlat (Windows PowerShell: `$env:CAPACITY=5; npm start`), 50 kullanıcıyla koş ve yanıt sürelerinin nasıl uzadığını izle. Sonra `http://localhost:8080/metrics` adresine bak.
