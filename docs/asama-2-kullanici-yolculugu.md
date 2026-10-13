# Aşama 2 — Gerçekçi Kullanıcı Yolculuğu

Aşama 1'de tek kullanıcı birbirinden bağımsız 4 isteği sırayla attı. Gerçek bir müşteri böyle davranmaz: siteye girer, ürünlere bakar, giriş yapar, sepete ekler ve öder. Her adım bir öncekinin sonucuna bağlıdır. Bu aşamada JMeter'a bunu öğretiyoruz.

## Senaryo

```
setUp: Demo mağazayı sıfırla (stok 500'e döner)
        │
        ▼
01 Ana Sayfa → 02 Kategori Listele → 03 Ürün Detayı → 04 Aktif Kampanya
                        │ ürün ID'sini yakala
                        ▼
05 Giriş Yap ──── token'ı yakala
        │
        ▼
[Giriş Yapmış Kullanıcı İşlemleri]  ← Authorization: Bearer ${token}
   06 Sepete Ekle → 07 Sepeti Görüntüle → 08 Ödeme ── sipariş no'yu yakala
```

Varsayılan ayar: **5 kullanıcı**, **5 saniyede** devreye girer, her biri yolculuğu **2 kez** tekrarlar. Toplam 10 sipariş oluşur.

## Yeni Öğrendiğin 6 Kavram

### 1. CSV Data Set Config: her kullanıcıya farklı veri

`test-data/users.csv` dosyasında 200 test kullanıcısı var:

```
email,password,category
user001@fashfed.test,Test1234!,kadin
user002@fashfed.test,Test1234!,erkek
```

JMeter her turda dosyadan **bir sonraki satırı** okur ve kolonları değişkene çevirir: `${email}`, `${password}`, `${category}`.

**Neden önemli?** 1000 kullanıcının hepsi aynı hesapla giriş yaparsa sunucu önbelleğe alır ve gerçekte olmayan kadar hızlı görünür. Ayrıca gerçek sistemlerde aynı hesapla yüzlerce eş zamanlı oturum kilitlenmelere yol açar.

| Ayar | Değer | Anlamı |
|---|---|---|
| Filename | `../test-data/users.csv` | Yol, **.jmx dosyasının bulunduğu klasöre göre** çözülür |
| Ignore first line | True | İlk satır başlık, veri değil |
| Recycle on EOF | True | Dosya bitince başa dön |
| Sharing mode | All threads | Tüm kullanıcılar aynı sırayı paylaşır, iki kullanıcı aynı satırı almaz |

### 2. JSON Extractor: yanıttan değer yakalamak (korelasyon)

Postman'de `pm.environment.set("token", json.token)` yazıp sonraki istekte `{{token}}` kullanmak gibi. Performans testinde bunun adı **korelasyon**.

| Extractor | JSONPath | Match No | Sonuç |
|---|---|---|---|
| Token'ı Yakala | `$.token` | 1 | İlk eşleşme → `${token}` |
| Rastgele Ürün ID'si Seç | `$.products[*].id` | **0** | 10 ürün ID'sinden **rastgele** biri → `${productId}` |
| orderId'yi Yakala | `$.orderId` | 1 | → `${orderId}` |

**Match No:** `1` ilk eşleşme, `0` rastgele bir eşleşme, `-1` hepsi (`productId_1`, `productId_2`… olarak).

**Default Value** (`TOKEN_YOK` gibi): Değer bulunamazsa değişkene bu yazılır. Debug sırasında "token gelmemiş" diye hemen anlarsın.

### 3. Header Manager'ın kapsamı

Ağaçta iki Header Manager var:
- **Test Plan seviyesinde:** `Accept` ve `Content-Type`. **Tüm** isteklere eklenir.
- **"Giriş Yapmış Kullanıcı İşlemleri" içinde:** `Authorization: Bearer ${token}`. **Sadece** o klasördeki 3 isteğe eklenir.

Aşama 1'deki kuralın aynısı: eleman, bulunduğu seviyeye ve altına etki eder. **Simple Controller** (`Giriş Yapmış Kullanıcı İşlemleri`) burada sadece bir klasör görevi görüyor, istekleri gruplayıp onlara ortak ayar vermemizi sağlıyor.

### 4. Think Time: gerçek kullanıcı gibi beklemek

**Uniform Random Timer**: her istekten önce **1 sn + 0–2 sn arası rastgele** bekler.

Think time olmadan 5 sanal kullanıcı saniyede onlarca istek atar. Bu da gerçekte 500 kullanıcının oluşturacağı yük demektir. Sonuçta "sistem 5 kullanıcıda çöktü" gibi yanlış bir sonuca varırsın.

> Timer, Thread Group seviyesinde olduğu için **her** sampler'dan önce çalışır. Timer'lar kendi bulundukları seviyedeki her sampler'a uygulanır.

### 5. setUp Thread Group: testten önce bir kez çalışan hazırlık

Ana kullanıcılar başlamadan **önce** bir kez çalışır. Burada demo mağazanın kampanya stoğunu ve oturumlarını sıfırlıyoruz, böylece her test aynı başlangıç noktasından başlar. Karşılığı **tearDown Thread Group**: test bitince temizlik yapar.

Playwright'taki `globalSetup` veya TestNG'deki `@BeforeSuite` ile aynı mantık.

### 6. Debug Sampler: değişkenleri görmek

`99 - Debug` her turun sonunda o anki tüm değişkenleri gösterir. View Results Tree'de ona tıkla → **Response data**:

```
category=ayakkabi
email=user003@fashfed.test
orderId=ORD-3
productId=1024
token=8f2a...
```

Bir şey çalışmadığında ilk bakılacak yer burası.

> Yük testlerinde (Aşama 3) Debug Sampler'ı kapatacağız: sağ tık → **Disable**. Raporu kirletir.

## Komut Satırı Parametreleri

Thread Group değerleri sabit değil, `${__P(users,5)}` şeklinde yazıldı. Test planına dokunmadan dışarıdan değiştirebilirsin:

```
jmeter -n -t test-plans/02-user-journey.jmx -Jusers=20 -Jrampup=10 -Jloops=3 -l results/journey.jtl -e -o reports/journey -f
```

| Parametre | Varsayılan | Anlamı |
|---|---|---|
| `-Jusers` | 5 | Sanal kullanıcı sayısı |
| `-Jrampup` | 5 | Hepsinin kaç saniyede devreye gireceği |
| `-Jloops` | 2 | Her kullanıcının yolculuğu kaç kez tekrarlayacağı |
| `-JthinkMin` | 1000 | Minimum bekleme (ms) |
| `-JthinkRange` | 2000 | Üstüne eklenen rastgele bekleme (ms) |

Bu, Aşama 3'te aynı planla 10, 50, 100, 200 kullanıcıyı denemenin temeli olacak.

## Aggregate Report: yüzdelikler

Bu aşamada yeni bir listener ekledik: **Aggregate Report**. Summary Report'tan farkı, **90% / 95% / 99% Line** kolonları:

| Kolon | Anlamı |
|---|---|
| **Median** | İsteklerin yarısı bundan hızlı |
| **90% Line** | İsteklerin %90'ı bundan hızlı, %10'u daha yavaş |
| **95% Line** | Çoğu SLA bununla tanımlanır: "p95 < 2 saniye" |

Ortalama yanıltıcıdır. 99 istek 100 ms, 1 istek 10 sn sürerse ortalama 199 ms çıkar ve "harika" görünür. Ama 95% Line ve Max gerçeği gösterir.

## Kendin Dene

1. Testi GUI'de çalıştır, View Results Tree'de **05 - Giriş Yap**'a tıkla. **Request** sekmesinde gönderilen JSON'da hangi e-posta var? Bir sonraki turda farklı mı?
2. **06 - Sepete Ekle**'nin Request sekmesinde `Authorization` başlığını bul. **04 - Aktif Kampanya**'da neden yok?
3. `users.csv` içinde `user001`'in şifresini `yanlis` yap ve testi çalıştır. Hangi istekler kırmızı oldu, neden? (İpucu: Debug Sampler'da `token` değerine bak.) Sonra geri al.
4. Token'ı Yakala'yı geçici olarak **Disable** et (sağ tık → Disable). Sepet istekleri ne dönüyor? Bu, korelasyon yapılmazsa ne olacağını gösterir.
5. Komut satırından `-Jusers=20 -Jloops=3` ile çalıştır. Kaç sipariş oluşmalı? Sonra `http://localhost:8080/metrics` adresinde `peakInflight` değerine bak.
