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

## 4. İçerik paylaşımı — KARAR: seçmeli

Koç her envanteri / kitabı / soru bankasını oluştururken "kuruma
açık" işaretleyebiliyor.

**Soru bankasında dikkat:** bugün kurum içinde **kendiliğinden**
paylaşılıyor (`kurumda_gorunur_mu`). Seçmeli yapmak var olan
kitaplıkları meslektaşlardan gizlerdi. Bu yüzden `kuruma_acik`
kolonu soru bankalarına **var olan satırlar için `true`** olarak
ekleniyor; yalnız bundan sonra açılanlar varsayılan olarak kapalı.
Kimsenin bugün gördüğü bir şey kaybolmuyor.

Envanter ve okuma kitabı bugün koça özel olduğu için onlarda
varsayılan `false` — kimsenin beklentisi değişmiyor.

`kurumda_gorunur_mu()` fonksiyonuna **dokunulmuyor**: müfredat ve
hazır programlar da onu kullanıyor, davranışları değişmemeli.

---

## 5. Sıra

1. `kurum_yonetimi_migration.sql` — yönetici RPC'leri
2. `kurum_icerik_migration.sql` — `kuruma_acik` ve politikalar
3. Arayüz: `KurumPaneli` (koç listesi, ekleme, devir, rapor) +
   envanter/kitap/banka formlarına "kuruma açık" anahtarı
4. (sonra) kurum markası — ad ve logo; satış için cazip, işlevsel
   değil
