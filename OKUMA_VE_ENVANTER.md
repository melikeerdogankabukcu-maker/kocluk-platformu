# Kitap Okuma Modülü + Gelişim Envanterleri

31 Ekim 2026. Veri modeli yazılmadan ÖNCE akışın tamamı — 14 Ekim'de
optik form yolunda öğrenilen kural bu: önce akış onaylanır, sonra tablo.

Kullanıcı kararları alındı ve aşağıda işaretli.

---

## 1. Neden bu ikisi birlikte

İkisi de **satılabilir hazır içerik** üretiyor. Platform başka koçlara
satılacak ve hazır içerik satışı kolaylaştırıyor — bu zaten yapılıyor
(hazır çalışma programları tam olarak bu işi görüyor). Okuma modülü
koçun kendi içeriğini üretmesini sağlıyor; envanterler ise **kutudan
çıkan** içerik, yani yeni bir koç ilk gün elinde bir şey buluyor.

---

## 2. Kitap okuma

### Akış

**Koç:** kitabı bir kez tanımlıyor — kapak fotoğrafı, ad, yazar,
toplam sayfa (isteğe bağlı). Sonra öğrenci(ler)e atıyor: **gün sayısı**
veriyor ("20 günde bitir"), sistem başlangıç tarihinden kalan günü
sayıyor.

**Öğrenci:** "Okuma" kartında kapağı, kalan günü ve ilerlemesini
görüyor; okudukça sayfa sayısını güncelliyor ya da "bitirdim" diyor.

**Koç:** atama listesinde her öğrencinin kaçıncı sayfada olduğunu ve
kaç gün kaldığını görüyor; süresi geçmişi uzatabiliyor.

### Kitap AYRI, atama AYRI

Bir kitap on öğrenciye atanabiliyor. Atama başına kapak yüklenirse
aynı fotoğraf on kez depoya gider. Kitap bir kez tanımlanıyor,
atamalar ona bağlanıyor.

### Sayfa ilerlemesi neden var

Kullanıcının ilk kurgusunda yoktu; eklenmesinin sebebi: geri sayım tek
başına koça bir şey söylemiyor. "12 gün kaldı" ile "öğrenci hiç
başlamadı" aynı ekranda görünmüyor. Sayfa ile "9 gün geçti, 12 sayfa
okunmuş" denebiliyor.

Ayrıca modülün koçluğa bağlandığı tek yer bu: okuma alışkanlığı
**paragraf başarısıyla** yan yana konabiliyor. Toplam sayfa boş
bırakılabiliyor — o zaman yalnız "bitirdim" işareti kalıyor, modül
yine çalışıyor.

### Süre bitince

Atama **kaybolmuyor** ve kendiliğinden "başarısız" olmuyor: `gecikti`
diye görünüyor, listede kalıyor, koç gün ekleyebiliyor. Okuma
sürekliliği olan bir iş; bir günlük gecikmeyi başarısızlık saymak
öğrenciyi bırakmaya iter.

### Yerleşim — KARAR: kendi kartında

Haftalık plana blok olarak da düşmesi değerlendirildi ve seçilmedi:
plan blokları ayrı bir tablo, aynı işin iki kaydı olur ve eşitlemesi
ek iş. Okuma zaten plandan bağımsız, süreklilik isteyen bir iş.

### Kapak fotoğrafı izni

Soru sayfalarındaki aynı problem: dosyayı **koç** yüklüyor, **öğrenci**
okuyor; yol tabanlı kural bunu açmıyor. Çözüm aynı kalıpta:
`kitaplar/<kitap_id>/...` öneki ve kitaba bağlı politika — kitabın
sahibi yazıyor, kitabın atandığı öğrenci (ve velisi) okuyor.

Telif notu: saklanan şey kapak fotoğrafı, yani kitabın **kimliği**;
eserin içeriği değil. Soru sayfalarından farklı ve kıyasla düşük
riskli.

---

## 3. Gelişim envanterleri

### Sınır — önce bu

Piyasadaki hazır envanterler iki duvara çarpıyor:

1. **Yetki.** Türkiye'de psikolojik test uygulama ve yorumlama yetkisi
   lisanslı uzmanlarda. Koçluk platformu test uygulatamaz.
2. **Telif.** Yayımlanmış standart envanterler (çoklu zekâ, mesleki
   ilgi, kişilik ölçekleri) telifli. Soru bankasında alınan riskin
   aynısı, üstelik bu sefer satış vaadinin tam ortasında.

Bu yüzden sistemdeki envanterler:

- **bizim yazdığımız** — hiçbir yayımlanmış ölçekten alınmıyor,
- **puanlamayan** — ekranda sayı yok,
- **tanı koymayan, etiket yapıştırmayan** — "görsel öğrenen",
  "dışadönük" gibi bir çıktı üretilmiyor; etiket bir kez yapışıyor ve
  yanlış olduğunda öğrenciyi takip ediyor,
- **öz-değerlendirme** — ölçülen şey davranış ve alışkanlık, kişilik
  ya da yetenek değil.

Çıktı bir profil değil, **uygulanabilir öneri**: "90 dakikalık blok
sana uymuyor, 2×40 dene." Satışta anlatılacak şey de bu — koç ilk
görüşmede elinde somut bir çıktıyla oturuyor.

### Akış

**Koç** envanteri öğrencisine atıyor (ya da öğrenci kendi dolduruyor).
**Öğrenci** 10–14 soruyu dolduruyor; bitince kendi önerilerini
görüyor. **Koç** eğilimleri ve önerileri görüyor, altına **kendi
değerlendirmesini** yazıyor.

### Görünürlük — KARAR

| kim | ne görüyor |
|---|---|
| öğrenci | kendi cevapları + öneriler |
| koç | cevaplar + eğilimler + öneriler + kendi değerlendirmesi |
| **veli** | **yalnız**: hangi envanter, ne zaman uygulandı, **koçun değerlendirmesi** |

Veli ham cevapları ve eğilimleri görmüyor. Sebep teknik değil
davranışsal: öğrencinin "sabah verimsizim", "erteliyorum" gibi şeyleri
dürüst işaretlemesi için evde konuşulmayacağını bilmesi gerekiyor.
Veli görüyorsa anket dürüst doldurulmuyor ve toplanan veri çöp oluyor.

Veli tarafında gösterilen şey yine de değerli: işin yapıldığı ve
koçun uzman yorumu — "doğrulanmış çalışma kaydı"nın aynı mantığı.

### İçerik nerede duruyor

Envanter tanımları **kodda** (`src/lib/envanterler.js`), hazır çalışma
programları gibi. Sebep: yeni envanter eklemek migration gerektirmiyor,
sürüm çıkınca bütün koçlarda anında oluyor — satılan şey bu.
Cevaplar ve koç değerlendirmesi veritabanında.

### İlk envanter: çalışma alışkanlığı

Ölçtüğü altı şey — hiçbiri kişilik değil, hepsi değiştirilebilir
davranış:

1. kesintisiz çalışma kapasitesi → blok süresi önerisi
2. erteleme eğilimi → işe başlama yöntemi önerisi
3. günün verimli saati → plan saati önerisi
4. dikkat dağıtıcılar → ortam kuralı önerisi
5. planlama alışkanlığı → hafta başı planlama önerisi
6. hatadan dönüş → yanlış defteri önerisi

### Etki — anketin işe yaradığı yer

Öneriler ekranda görünüyor; ikinci adımda **çalışma planı önerisinin
blok süresini ve saatini** besleyecek. Bu olmazsa anket yalnız veri
toplamış olur — ölçtüğü şeyin hiçbir kararı değiştirmemesi, baştan
elediğimiz kurguydu.

---

## 4. Sıra

1. `src/lib/envanterler.js` — içerik + saf değerlendirme (sınanabilir)
2. `envanter_migration.sql` — sonuçlar, RLS, veli özeti görünümü
3. `kitap_okuma_migration.sql` — kitaplar, atamalar, kapak izni
4. Arayüz: envanter doldurma → koç görünümü → okuma kartı → koç okuma yönetimi
5. (sonra) önerilerin çalışma planına bağlanması
