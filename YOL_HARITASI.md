# ÜSTAD — Yol Haritası

Kaynak: *ÜSTAD — Yeni Özellik Değerlendirmesi* (14 Ekim 2026). Bu belge
o değerlendirmeyi iş planına çeviriyor ve üç yerde onu **koddaki
gerçek duruma göre düzeltiyor**.

---

## 1. Değerlendirmeyi düzelten üç nokta

**Oyunlaştırma yapılacak iş değil, yapılmış iş.** Değerlendirme bunu
v2'ye koyuyor ve "kayıpsız tasarlanmalı" diyor: ilerleme geri
alınmasın, sıralama tablosu olmasın, karşılaştırma öğrencinin kendi
geçmişiyle yapılsın. Kodda **24 rozet, XP ve seviye** var; sıralama
tablosu yok, seri kaybı cezası yok, karşılaştırma zaten kişisel
(`src/lib/badges.js`, `gamification.js`). Üç ilke de sağlanıyor.
→ **Proje değil, yarım günlük gözden geçirme.**

**Ödev motorunun eksiği motor değil, içerik haritası.**
`src/lib/odevOnerisi.js` bugün zayıf konuları kitaplık bölümleriyle
eşleştirip koça öneri sunuyor — doğrudan görev açmıyor, çünkü konu
eşleştirmesi bulanık. Yani değerlendirmenin "karar kural motorunda
kalsın" ilkesi zaten böyle kurulmuş. Eksik olan tek şey, hangi sayfada
hangi konunun olduğu bilgisi.
→ **v2'nin işi motor yazmak değil, haritayı doldurmak.** Aracı da var:
fotoğraftan içindekiler okuma (2026-09-30'da yazıldı).

**Optik okuma için sunucuya gerek olmayabilir.** Değerlendirme
"OpenCV Python servisine konur" diyor. Oysa tarayıcıda zaten
`perspektifDuzelt` (projektif dönüşüm), `ikiliyeCevir` (uyarlamalı
eşikleme), `sayfaKutusu` ve `metinBolgeleri` var
(`src/lib/goruntuIsle.js`). Baloncuk okumak için gereken ilkel
işlemlerin tamamı bu.
→ **Önce tarayıcıda denenmeli.** Olursa: sunucu maliyeti yok, yükleme
yok, fotoğraf cihazdan çıkmıyor, ücretli Render planı gerekmiyor.
Ölçüm tutmazsa sunucuya taşınır — kod zaten saf, Node'da ölçülebiliyor.

---

## 2. v1 — üç iş

Hedef: mevcut 6-8 haftalık yayın planına sığmak.

### 2.1 Testin dijital çözülmesi ve kontrolü

**2026-10-14'te yön değişti.** Önceki tasarım basılı optik forma
dayanıyordu: kâğıdı biz basacak, öğrenci işaretleyip fotoğrafını
gönderecek, sistem okuyacaktı. Kullanıcı kararı: **öğrenci testi
dijital ortamda çözecek ve kontrol oradan sağlanacak — optik forma
ihtiyaç yok.**

Bunun iki sonucu var:

- **Cevap anahtarı bölüm başına değil, KİTABIN TAMAMI için bir tane.**
  Dijital dosyadan yüklendiği için tek yerde tutulması yeterli.
  (Bugünkü `cevap_anahtarlari` tablosu bölüme bağlı — değişmesi
  gerekiyor.)
- **Basılı kâğıt işi ertelendi.** Yazılmış olan parçalar duruyor ama
  arayüze bağlı değil: `src/components/CevapKagidi.jsx`,
  `src/lib/cevapKagidi.js`, `cevap_kagidi_migration.sql`. Kimlik
  şeridi tasarımı (24 veri + 6 sağlama biti; 500 denemede tek kare
  hatasının 500'ü yakalandı) ileride lazım olursa hazır.

**Süreç notu:** bu iş önkabul sınanmadan yazıldı. Üç migration ve
birkaç bileşen arka arkaya çıktı, sonra yolun kendisi değişti. Bundan
sonraki her yeni akışta önce AKIŞIN TAMAMI yazılıp onaylanacak, sonra
veri modeli.

### 2.2 QR ile kitaplık

Kitap eklemeyi hızlandırır ve paylaşılan kütüphanenin kapısını açar.

- `soru_bankalari` tablosuna `isbn` alanı
- Tarayıcıda barkod okuma (`BarcodeDetector`; desteklemeyen tarayıcıda
  elle giriş)
- ISBN yalnızca kitabın adını ve yayınevini verir — içerik haritası
  **bundan gelmiyor**, o ayrı iş (v2)
- Aynı tarama yeteneği cevap kâğıdındaki QR için de kullanılacak;
  ikisi tek işte yazılır

**Paylaşılan kütüphane:** bir koçun okuttuğu kitabın içindekileri
diğer koçlara hazır gelsin. Biriken ve kopyalanamayan tek varlık bu.
Rakip analizindeki "kalıcı avantaj kullanım verisinden gelmeli"
maddesinin karşılığı.

### 2.3 Kişiselleştirme

Ucuz ve etkisi yüksek — ama kapsamı daraltmak şart.

- **Girer:** öğrencinin aksan rengini seçmesi, avatar seçimi
  (`OgrenciAvatari` zaten var)
- **Girmez:** tam tema/karanlık mod. `src/lib/tasarim.js` merkezî
  belirteçleri topluyor ama kod tabanında hâlâ elle yazılmış 144
  hex renk var; tam temalandırma haftalara mal olur, v1'e sığmaz

---

## 3. Sıra ve bağımlılıklar

```
cevap anahtarı girişi
        ↓
cevap kâğıdı üretimi ──► QR okuma (kitaplık ile ortak)
        ↓
okuma (önce tarayıcıda, ölçülür)
        ↓
onay ekranı ──► test_sessions'a yazma
```

Kritik yol **cevap anahtarı → kâğıt → okuma → onay**. Kişiselleştirme
bu zincirin dışında, boşluğa alınabilir.

---

## 4. v2

- **İçerik haritası.** 40-50 başlık sayısalın büyük kısmını kapatıyor.
  Elle girmek yavaş ama güvenilir; öğrenciye girdirmek hızlı ama veri
  kalitesi düşük. Önce elle + fotoğraftan okuma yardımı, yayınevi
  ortaklığı olgunlaşınca hazır veri.
- **Ödev motorunun otomatikleşmesi.** Harita dolunca `odevOnerisi`
  öneriden otomatik ödeve çıkabilir — ama koç onayı kalmalı.
- **Yapay zekâ dil katmanı.** Karar kurallarda kalır, model yalnız
  ödevi doğal dille anlatır ve haftalık mesajı yazar.
- **Oyunlaştırma gözden geçirmesi.** Yeni rozet eklenirse kayıpsızlık
  ilkesi korunuyor mu — yarım gün.

---

## 4.5 Yayına almadan önce (karar verilmiş, yapılacak)

**Karalamanın sunucuya kaydedilmesi** (2026-10-26'da kararlaştırıldı).
Öğrenci sayfa fotoğrafının üstüne kalemle yazabiliyor ama çizgiler
yalnız test penceresi açık kaldığı sürece duruyor; pencere kapanınca
gidiyor. Kullanıcı kararı: *"şimdilik bu şekilde olsun daha sonra
yayına almadan önce sunucuya kaydedilecek şekilde düzenlenecek."*

Kaydedilince ikinci bir kazanç var: öğrencinin çözüm karalaması
**doğrulanmış çalışma kaydının** kanıtı oluyor — koç sadece sonucu
değil, soruyu nasıl çözdüğünü de görüyor. Bugünkü hâliyle bu bilgi
üretilip atılıyor.

Gereken: oturum+görsel başına bir kayıt (`oturum_karalamalari` ya da
`oturum_cevaplari` üzerinde JSONB), çizgiler zaten oranlı saklandığı
için veri biçimi hazır (`src/lib/karalama.js`); koç tarafında salt
okunur gösterim.

## 5. Tanımlanacaklar

Değerlendirme bu ikisini "kapsamı belirsiz" diye işaretliyor ve haklı;
yazılmadan plana giremezler.

- **Kitap okuma modülü** — ne yapıyor? Kitap takibi mi, okuma süresi mi,
  okunan kitap listesi mi, yoksa kitabın içeriğinin uygulamada
  gösterilmesi mi? Sonuncusu telif meselesi.
- **Kişisel gelişim katmanı** — hangi veriyi topluyor, kime gösteriyor,
  ne kararını değiştiriyor?

---

## 6. Ertelenenler

**Sosyal mecra — v1'den çıkarıldı.** Kullanıcıların çoğu 18 yaş altı.
Yetişkinlerin reşit olmayanlarla serbest iletişim kurduğu bir ortam
mağaza çocuk güvenliği politikalarıyla ve KVKK ile çarpışır.
Moderasyon, raporlama, içerik denetimi ve veli onayı altyapısı
kurulmadan açılmamalı. Açılacaksa avukat eşliğinde, kapalı ve
denetimli.

**Psikolojik testler — yeniden kurgu.** Türkiye'de test uygulama ve
yorumlama yetkisi lisanslı uzmanlarda; bu veriler KVKK'da özel
nitelikli. Yerine **çalışma alışkanlığı anketi**: öğrenme stili,
odaklanma süresi, planlama alışkanlığı. Tanı konmaz, puanlanmaz,
yalnız programı kişiselleştirir. Aynı faydayı verir, riski taşımaz.

---

## 7. Bu projede ölçüm ilkesi

Fotoğraftan okuma işinde yerleşen kural burada da geçerli: **her
değişiklik gerçek veriyle ölçülür, ölçülmeyen iyileştirme
iyileştirme sayılmaz.** İçindekiler okumada ölçüm düzeni 89/147'den
110/147'ye çıkardı ve iki kez "iyi fikir" sanılan değişikliği
ölçümle eledi. Optik okumada da ölçüm düzeni **ilk gün** kurulmalı,
sonunda değil.
