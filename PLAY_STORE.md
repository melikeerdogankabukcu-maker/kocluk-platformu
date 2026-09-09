# Play Store'a yükleme — TWA yolu

Play Store **imzalanmış `.aab`** (Android App Bundle) istiyor. Yeni
uygulamalarda APK kabul edilmiyor. Bu depo bir web uygulaması olduğu
için `.aab`, siteyi saran bir Android kabuğundan (TWA — Trusted Web
Activity) üretiliyor.

TWA'nın önemli sonucu: **içerik canlı siteden geliyor.** Vercel'e her
push kullanıcıya anında ulaşıyor, mağazadan yeni sürüm çıkmak
gerekmiyor. Yalnızca kabuğun kendisi (ikon, ad, açılış ekranı)
değişirse yeni `.aab` gerekiyor.

---

## Depoda hazır olanlar

| Dosya | İşi |
|---|---|
| `public/manifest.webmanifest` | Uygulama adı, ikonlar, renkler. Kurulabilirliğin şartı. |
| `public/sw.js` | Servis çalışanı. Kurulabilirlik için gerekli; bilerek yalnızca `/assets/` önbelleğe alıyor. |
| `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Uygulama simgeleri. Maskable olan, Android'in yuvarlak/köşeli kırpmasına dayanacak şekilde daha bol kenar boşluklu. |
| `public/apple-touch-icon.png` | iOS ana ekran simgesi. |
| `public/.well-known/assetlinks.json` | **Yer tutucu** — aşağıdaki 3. adımda doldurulacak. |
| `vercel.json` | `sw.js` ve manifest için önbellek/MIME başlıkları. |

---

## Adımlar

### 1. Siteyi yayına al

Bu değişiklikler `main`'e girip Vercel dağıtımı indikten sonra devam et.
Doğrulama (kendi alan adınla):

```bash
curl -sI https://ALAN-ADIN/manifest.webmanifest | head -5
```

`content-type: application/manifest+json` görmelisin. HTML dönüyorsa
dosya yayına çıkmamış demektir.

### 2. PWABuilder'dan paketi üret

<https://www.pwabuilder.com> adresine alan adını yaz.

- Manifest ve servis çalışanı puanlarının yeşil olması gerekiyor.
- **Package For Stores → Android → Generate Package**.
- Paket adı (`package_name`) bir kez seçiliyor ve **sonradan
  değiştirilemiyor**. `com.` ile başlayan, sahip olduğun alan adını ters
  çevirmiş bir ad kullan.
- İnen zip'te şunlar var:
  - `app-release-bundle.aab` → **Play Console'a yükleyeceğin dosya bu**
  - `signing.keystore` + `signing-key-info.txt` → **imza anahtarın**
  - `assetlinks.json` → bir sonraki adım

> **İmza anahtarını kaybedersen uygulamayı bir daha güncelleyemezsin.**
> Yeni anahtarla yüklenen paket Play tarafından farklı bir uygulama
> sayılıyor. `signing.keystore` ve şifresini depoya **koyma**, ayrı ve
> yedekli bir yerde sakla.

### 3. assetlinks.json'ı doldur

PWABuilder'ın verdiği `assetlinks.json` içindeki `package_name` ve
`sha256_cert_fingerprints` değerlerini
`public/.well-known/assetlinks.json` dosyasına yaz, push et.

Bu dosya doğru değilse uygulama açılır ama **üstte adres çubuğu görünür**
— yani tarayıcı gibi durur. Yayına çıktıktan sonra:

```bash
curl -s https://ALAN-ADIN/.well-known/assetlinks.json
```

> Play App Signing kullanıyorsan (varsayılan olarak açık), Play kendi
> anahtarıyla yeniden imzalıyor. O zaman Play Console → Setup → App
> signing ekranındaki **App signing key certificate** parmak izini de
> aynı dosyaya ikinci bir kayıt olarak eklemen gerekiyor. Bu adım
> atlandığında adres çubuğu ilk yüklemede değil, mağazadan kurulan
> sürümde çıkıyor ve nedeni geç anlaşılıyor.

### 4. Play Console

- Geliştirici hesabı: tek seferlik 25 $.
- Yeni uygulama oluştur → `app-release-bundle.aab` yükle.
- Gerekli olacaklar: 512×512 ikon, 1024×500 öne çıkan görsel, en az 2
  telefon ekran görüntüsü, kısa ve uzun açıklama, **gizlilik politikası
  URL'si**, veri güvenliği formu, içerik derecelendirme anketi.

---

## Kodla ilgisi olmayan ama süreci belirleyen üç şey

**1. Kapalı test şartı.** Hesabı bireysel açtıysan Google, üretime
geçmeden önce **12 test kullanıcısının 14 gün kesintisiz** kapalı testte
kalmasını istiyor. Kurumsal hesapta bu şart yok. Takvimi bu belirliyor.

**2. Gizlilik politikası ve KVKK.** Zorunlu ve şu an yok. Uygulama
öğrenci adı, doğum tarihi, fotoğraf, okul, veli telefonu ve e-postası
tutuyor. Veri güvenliği formunda bunların hepsi beyan edilmeli;
beyanla uygulamanın gerçekte topladığı veri uyuşmazsa uygulama
kaldırılıyor.

**3. Kullanıcıların bir kısmı reşit değil.** Uygulama ortaokul/lise
öğrencilerine yönelik ve onların kişisel verilerini işliyor. Bu, Play'in
**Families** politikasını devreye sokuyor: hedef yaş grubu beyanı,
çocuk verisi için ek kurallar, reklam ve analitik SDK kısıtları.
Reddedilmelerin sık nedenlerinden biri burası — formu doldurmadan önce
üzerinden geçmekte fayda var.
