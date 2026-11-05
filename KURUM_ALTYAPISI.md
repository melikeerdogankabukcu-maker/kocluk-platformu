# Kurumsal Altyapı

5 Kasım 2026. Veri modeli yazılmadan önce akışın tamamı — 14 Ekim'de
öğrenilen kural.

---

## 1. Bugün ne var, ne yok

**Var:** `kurumlar` tablosu (ad, tür bireysel|okul, sahip), `users.kurum_id`
ve `users.kurum_rolu` (yonetici|uye), `kurumum()` ve
`kurum_yoneticisi_mi()` yardımcıları, soru bankası ve müfredatın kurum
içinde görünmesi (`kurumda_gorunur_mu`), platform yöneticisine ait
`KurumYonetimi` ekranı.

Tasarım notu baştan şöyleydi: *"varsayılan her koç kendi kurumu; çok
üyeli kurum modelde hazır ama kendiliğinden devreye girmiyor."*

**Yok:** kurum yöneticisinin yapabileceği hiçbir şey.

Sebebi tek bir satırda: `users` tablosunda UPDATE yalnız **kendi
satırına** ve **platform yöneticisine** açık. `users_rol_koru`
tetikleyicisi kurum yöneticisine izin veriyor ama o izne hiç
sıra gelmiyor — RLS önce kesiyor. Yani bir dershaneye satılsa,
müdürün eline hiçbir şey geçmiyor; her yeni öğretmen için platform
yöneticisine (yani size) başvurmaları gerekiyor.

---

## 2. Neden RPC, neden RLS genişletmiyoruz

Kurum yöneticisinin ihtiyaç duyduğu her iş başkasının satırına
dokunuyor: başka bir kullanıcının `kurum_id`'si, başka bir koçun
öğrenci bağı. Bunları RLS ile açmak demek, `users` ve
`teacher_students` üzerindeki izinleri kalıcı olarak genişletmek
demek — ve o genişlik yalnız bu ekranlar için değil, **her sorgu
için** açılırdı.

Onun yerine her işlem tek bir SECURITY DEFINER fonksiyonunda ve
girişte `kurum_yoneticisi_mi()` denetimiyle. Kurallar tek yerde,
denetlenebilir; tablo izinleri olduğu gibi dar kalıyor.

---

## 3. Akış

### 3.1 Koç ve öğrenci listesi

Müdür kendi kurumundaki koçları, her birinin öğrenci sayısını ve
kuruma bağlı bütün öğrencileri görüyor.

`teacher_students` üzerinde müdürün okuma izni yok (politika yalnız
tarafları geçiriyor) ve **genişletilmiyor**: liste de özet de aynı
RPC'den geliyor.

### 3.2 Koç ekleme / çıkarma

Müdür koçu **e-posta ile** ekliyor. E-posta artık istemciye hiç
inmiyor (5 Kasım'daki sütun izni daraltması); dolayısıyla müdür bir
listeden seçemez, yazdığı adresi **sunucu çözüyor**. Bu, daraltmanın
etrafından dolaşmak değil, onunla tutarlı tek yol.

Kurallar:
- Eklenen kişi öğretmen olmalı.
- Zaten **başka** bir kurumdaysa eklenmiyor; önce oradan çıkması
  gerekiyor. Sessizce taşımak, iki kurumun aynı koç üzerinden
  birbirinin verisini görmesine yol açardı.
- Müdür **kendini çıkaramıyor**: kurum yöneticisiz kalırsa kimse
  içeri koç ekleyemez ve kilitlenir.

### 3.3 Öğrenci devri

Bir koç ayrıldığında öğrencileri başka koça aktarılıyor.

Burada şanslıyız: görev, sınav, plan gibi tabloların politikaları
`teacher_id`'ye değil **`ogrencim_mi(student_id)`**'ye bakıyor (38
yerde). Yani bağ devredildiğinde yeni koç öğrencinin **geçmişini de**
görüyor; ayrıca bir veri taşıma işi gerekmiyor.

Devir iki koçun da aynı kurumda olmasını şart koşuyor.

### 3.4 Kurum geneli rapor

Koç başına: öğrenci sayısı, görev tamamlama oranı, bu ay çözülen
test, çalışma süresi. Müdürün "kurum nasıl gidiyor" sorusunun cevabı.

Sayılar **sunucuda** toplanıyor; müdüre satırlar değil özet iniyor.
Hem izinleri genişletmemek hem de bir dershanede yüzlerce satırı
tarayıcıya indirmemek için.

---

## 3.5 Görünürlük zinciri (çıkarıldı, 5 Kasım)

İçerik paylaşımını yazmadan önce canlıdaki zincir baştan sona
çıkarıldı. İlk tasarım bu yapılmadığı için yanlıştı.

```
kurumda_gorunur_mu(sahip)            ← müfredat, hazır programlar
  = sahip NULL | sahip = ben | admin | AYNI KURUM
    | onaylı koçum | çocuğumun koçu

banka_sahibi_gorunur_mu(sahip)       ← soru bankası, bölümler
  = kurumda_gorunur_mu(sahip) | öğrencim | çocuğum

soru_bankalari SELECT
  = banka_sahibi_gorunur_mu(sahip)
    AND (sahibi | admin | PERSONEL | öğrenciye atanmış | veliye)
```

Buradan iki şey çıktı:

1. **Politika eklemek erişimi genişletir, daraltmaz.** "Seçmeli"
   davranış ancak fonksiyonun içindeki kurum dalı koşullu hâle
   getirilerek olur. İlk tasarım yeni bir politika ekliyordu ve
   hiçbir şeyi kısıtlamazdı.
2. **Kurum dalı `kurumda_gorunur_mu` içinde** ve onu müfredat ile
   hazır programlar da kullanıyor. Doğrudan değiştirmek onları
   bozardı.

## 4. İçerik paylaşımı — KARAR: seçmeli

Koç her envanteri / kitabı / soru bankasını oluştururken "kuruma
açık" işaretleyebiliyor.

**Uygulama:** fonksiyon davranış değiştirmeden ikiye ayrılıyor.

- `ayni_kurumda_mi(sahip)` — yalnız kurum dalı
- `kurum_disi_gorunur_mu(sahip)` — diğer bütün yollar
- `kurumda_gorunur_mu(sahip)` = ikisinin birleşimi → **müfredat ve
  hazır programlar için hiçbir şey değişmiyor**
- `banka_sahibi_gorunur_mu(sahip, acik)` — kurum dalı bayrağa bağlı

**Soru bankasında dikkat:** bugün kurum içinde kendiliğinden
paylaşılıyor. Seçmeli yapmak var olan kitaplıkları meslektaşlardan
gizlerdi; bu yüzden kolon **var olan satırlar için `true`** olarak
ekleniyor, yalnız bundan sonra açılanlar kapalı başlıyor.

Envanter ve okuma kitabı bugün koça özel, onlarda varsayılan `false`.

**Asıl risk** kurum dalını koşullu yaparken öğrenci ve veli
yollarının kopması; sınama bunu ayrıca denetliyor.

---

## 5. Sıra

1. `kurum_yonetimi_migration.sql` — yönetici RPC'leri
2. `kurum_icerik_migration.sql` — `kuruma_acik` ve politikalar
3. Arayüz: `KurumPaneli` (koç listesi, ekleme, devir, rapor) +
   envanter/kitap/banka formlarına "kuruma açık" anahtarı
4. ✅ Kurum markası (`kurum_marka_migration.sql`) — üst barda kurum
   logosu ve adı.

   **Kim görüyor:** kurumun koçları, onların öğrencileri ve velileri.
   Satış değeri burada: dershane velisine kendi markasını gösteriyor.
   Öğrencide kurum doğrudan yazılı olmadığı için "koçumun kurumu"
   sunucuda çözülüyor (`marka_kurumum`).

   **Anahtar logonun varlığı, kurum türü değil.** Tek kişilik bireysel
   kurumda da görünüyor: kendi markasıyla çalışan bir koç için doğru
   davranış. Logo yoksa platformun markası kalıyor.

   **Renk BİLEREK yok.** Kişiselleştirme (palet seçimi) yeni eklendi;
   kurum rengi kullanıcının seçimini sessizce geri almış olurdu. Karar
   kullanıcının: "yalnız logo".

   Öğrenci `kurumlar` tablosunu hâlâ okuyamıyor — yalnız marka için
   gereken üç alan RPC'den dönüyor, kurum kaydının tamamı açılmıyor.
