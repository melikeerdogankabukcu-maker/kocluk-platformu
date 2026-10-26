# Dijital test — akış tasarımı (ONAY BEKLİYOR)

**Bu belge kod değil, karar belgesidir.** Optik form işi önkabul
sınanmadan yazıldığı için yolun ortasında değişti; bu sefer sıra
tersine: önce akış onaylanacak, sonra veri modeli yazılacak.

Karar: **öğrenci testi uygulamada çözecek. Sorular da uygulamada
olacak** (kullanıcı, 2026-10-15).

---

## 1. Bugün elimizde ne var, ne yok

| | Durum |
|---|---|
| Kitap ve bölüm başlıkları (`soru_bankalari`, `soru_bankasi_bolumleri`) | Var |
| Fotoğraftan içindekiler okuma | Var, ölçüldü (110/147) |
| Test **sonucu** (`test_sessions`: soru/doğru/yanlış sayısı) | Var |
| **Soru içeriği** (metin, şıklar, şekil, doğru cevap) | **YOK — hiçbir tabloda durmuyor** |
| Soru bazlı sonuç (hangi soruyu yanlış yaptı) | **YOK** |

Yani bu iş mevcut bir şeyi geliştirmek değil, yeni bir temel kurmak.

---

## 2. Akış

### Koç tarafı — kitabı sisteme almak

1. Kitabı kitaplığa ekler (bugün var; ISBN ile de eklenebiliyor).
2. **Soruları yükler.** Kaynağı aşağıdaki 3. bölümün konusu.
3. Yüklenen soruları gözden geçirir: metin doğru mu, şıklar tam mı,
   şekil doğru soruya mı bağlanmış, doğru cevap doğru mu.
   **Onaylanmadan öğrenciye açılmaz.**
4. Bölüm/konu eşlemesi yapılır (bugünkü içindekiler yapısıyla aynı
   mantık) — soru bazlı konu analizi buna bağlı.

### Öğrenci tarafı — testi çözmek

1. Koç ödev verir: "şu kitabın şu testi".
2. Öğrenci testi açar, soruları **ekranda** görür, şık işaretler.
3. Yarıda bırakabilir, sonra devam edebilir (oturum saklanır).
4. "Bitir" der.

### Puanlama

- **Doğru cevap öğrencinin cihazına İNMEZ.** Soru metni ve şıklar
  iner; doğru cevap inmez. Değerlendirme sunucuda yapılır (RPC),
  tarayıcıya yalnız sonuç döner.
- Bu, cevap anahtarında verdiğimiz kararın aynısı ve sebebi de aynı:
  tarayıcıya inen her şeyi öğrenci okuyabilir. "Doğrulanmış çalışma
  kaydı" iddiası olan bir üründe testin cevabı sızamaz.
- Sonuç bitince: soru bazlı doğru/yanlış, konu bazlı özet,
  `test_sessions`'a kayıt, konu ilerlemesine ve analize akış.

---

## 3. Sorular sisteme nasıl girecek? (ASIL MESELE)

İşin tamamı burada. Üç yol var, üçü de aynı veri modeline yazıyor
ama maliyetleri çok farklı.

**a) Yayınevi dosyası.** Yayınevi kitabın sorularını dijital olarak
veriyor. En temiz yol; kullanıcının planında zaten yayınevi
işbirliği var. Ama biçim yayınevine göre değişir (Word, PDF, XML,
kendi veritabanı) ve her biri için ayrı dönüştürücü gerekir.
**Ön koşul: anlaşma.**

**b) Fotoğraftan okuma.** Elimizdeki okuma servisi (`/soru` uç
noktası) sayfayı yazı ve şekil bloklarına ayırıp yazıyı okuyor.
Soru metnini çıkarmak mümkün; ama **şıkları ayırmak, şekli doğru
soruya bağlamak ve doğru cevabı bilmek** ayrı işler. Üstelik
`/soru`'nun yazı/şekil ayrımı **henüz ölçülmedi** (elimizde soru
sayfası fotoğrafı yok). Bu yol ciddi ölçüm ister.

**c) Elle giriş.** Koç soruyu yazar. Yavaş ama hemen çalışır ve
kalite yüksek. 40 soruluk bir test için gerçekçi değil; ama ilk
pilot için 10-20 soruluk bir set hazırlamaya yeter.

**Önerim:** pilot (c) ile kurulur — veri modeli, çözme ekranı ve
puanlama gerçek sorularla çalışır hale gelir. Sonra (a) ya da (b)
yalnızca *girdi yolu* olarak eklenir; iskelet değişmez.

---

## 4. Telif — bu bir kapı

Yayınevinin sorularını sisteme alıp öğrenciye göstermek, telifli
içeriğin çoğaltılması ve yayımlanmasıdır. Kitabın **içindekiler
sayfasını** okumak başka şey (yönlendirme bilgisi), **sorularını**
uygulamada göstermek başka şey.

İzinsiz yapılırsa risk uygulamanın kendisindedir; yayınevinin
şikâyeti mağazadan kaldırılmaya kadar gider.

**Üç meşru yol:**
- Yayınevi ile yazılı anlaşma (planda zaten var)
- Kendi sorularımız / kuruma ait sorular
- Telifi serbest kaynaklar (ÖSYM çıkmış sorular — bunlar kamuya açık)

### Karar (2026-10-15, kullanıcı)

Amaç yayınevi işbirliği. **İzin henüz yok**; elde PDF kitaplar var ve
geliştirme/ölçüm bunlarla yapılacak. **Yayına yalnız izin alındıktan
sonra çıkılacak.**

Bu sınır hafızada değil ÜRÜNDE duracak. Kitapta bir **hak durumu**
alanı olacak:

| Durum | Anlamı | Öğrenciye açılır mı |
|---|---|---|
| `deneme` | Geliştirme/ölçüm için yüklendi, izin yok | **Hayır** |
| `kapali_pilot` | İzin yok, kullanıcı kararıyla kapalı denemede | **Yalnız kitabı ekleyen koçun kendi öğrencilerine** |
| `izinli` | Yayınevi ile yazılı anlaşma var | Evet |
| `kendi` | Kuruma/koça ait özgün sorular | Evet |
| `acik` | Kamuya açık (ÖSYM çıkmış sorular vb.) | Evet |

**Kapalı pilot (2026-10-15 kullanıcı kararı).** Elde izin yok;
kitaplar önümüzdeki yıl müfredattan kalkıyor. Kullanıcı denemeyi
öğrencilerle başlatmayı seçti ve bunun **izinli olmadığı** bilerek
kaydedildi. Teknik karşılığı:

- Yalnız kitabı ekleyen koçun **kendi öğrencileri** erişebilir
- **Dışa aktarma / toplu indirme yok** — soru metni yalnız çözme
  ekranında, soru soru sunulur
- **Erişim kayıt altında:** her test oturumu kim-hangi kitap-ne zaman
  bilgisiyle kaydediliyor (`test_oturumlari` tablosunun kendisi bu
  kaydı tutuyor, ayrıca bir günlüğe gerek yok)
- İzin geldiğinde tek yapılacak: kitabın hak durumunu `izinli` yapmak

Notum kayıtlara geçsin: müfredattan kalkmak telif hakkını sona
erdirmiyor; bu seçim riski azaltır, izinli hâle getirmez. Yayınevine
"müfredattan kalkacak kitap için pilot izni" diye gitmek hukuken değil
ama pazarlıkta güçlü bir taleptir ve kapıyı asıl o açar.

Varsayılan `deneme`. Öğrenciye soru sunan sorgu bu alanı denetler;
izinsiz kitabın soruları öğrenci tarafına **hiçbir yoldan** gidemez.
Böylece "izin gelince açarız" bir niyet değil, bir anahtar olur —
ve yanlışlıkla açılması mümkün olmaz.

Not: bu alan hukuki bir koruma değil, operasyonel bir kilit. İzni
veren de alan da sizsiniz; sistem yalnızca yanlışlıkla yayımlamayı
engelliyor.

---

## 5. Şekilli sorular

Matematik ve fen sorularının çoğunda grafik, geometri çizimi ya da
tablo var. Düz metin yetmiyor. Soru = **metin + (varsa) görsel +
şıklar**. Şıklar da bazen görsel oluyor (şekil şıkları).

Bu, veri modelini ve çözme ekranını doğrudan etkiliyor; "önce düz
metin sorularla başlayalım" denirse çok daha hızlı ilerler ama
matematik kitaplarının büyük kısmı kapsam dışı kalır.

---

## 6. Veri modeli taslağı (onaylanınca yazılacak)

```
sorular
  id, banka_id, bolum_id, numara, metin, gorsel_url,
  sik_sayisi, siklar (metin/görsel), dogru_cevap, konu,
  onayli (koç gözden geçirdi mi), ekleyen_id

test_oturumlari
  id, student_id, banka_id, bolum_id, baslangic, bitis, durum

oturum_cevaplari
  oturum_id, soru_id, verilen_cevap, sure_sn
```

- `dogru_cevap` **asla** istemciye gönderilmiyor; sorular öğrenciye
  bu alan olmadan sunuluyor (ayrı bir görünüm ya da RPC).
- Puanlama RPC'si: oturumu kapatır, cevapları anahtarla karşılaştırır,
  `test_sessions` kaydını açar.
- Bugünkü `cevap_anahtarlari` tablosu (bölüme bağlı) bu modelde
  **gereksiz kalıyor**: doğru cevap sorunun kendisinde. Kullanıcının
  "anahtar tek yerde dursun" isteği böylece kendiliğinden karşılanıyor.

---

## 7. Aşamalar

| Aşama | İçerik | Çıktı |
|---|---|---|
| 1 | Veri modeli + elle soru girişi + çözme ekranı + sunucuda puanlama | Tek kitapla uçtan uca çalışan pilot |
| 2 | Sonuçların konu analizine ve doğrulanmış çalışma kaydına akması | Mevcut analiz soru bazlı veriyle besleniyor |
| 3 | Toplu girdi yolu (yayınevi dosyası ya da fotoğraftan okuma) | Ölçekleme |

Aşama 1 bitmeden 3'e geçilmez — optik formda yapılan hata tam olarak
buydu: girdi yolu, akışın kendisi doğrulanmadan yazıldı.

---

## 8. Karar bekleyenler

1. ~~Pilot içeriği~~ → **karar verildi:** elde bulunan PDF kitaplar,
   `deneme` hak durumuyla; yayına izinden sonra.
2. ~~Asıl girdi yolu~~ → **karar verildi:** yayınevi dosyası. PDF'ler
   şimdilik onun yerine geçiyor, yani içe aktarma hattı **PDF
   okumaya** göre kurulacak.
3. **Şekilli sorular aşama 1'de olsun mu?** Bunu tahminle değil
   ÖLÇÜMLE cevaplayalım: bir PDF'e bakıp (a) metin katmanı var mı
   yoksa taranmış görüntü mü, (b) soruların yüzde kaçında şekil var,
   (c) şıklar düzenli bir kalıpta mı duruyor — üçünü çıkarırım,
   kapsamı ona göre konuşuruz.

**Sıradaki adım:** bir PDF kitabın yolunu verin. Ölçümü yapıp bu
belgeye yazayım; aşama 1'in kapsamı o ölçümden çıksın.

---

## 9. YÖN DEĞİŞİKLİĞİ: sayfa fotoğrafı + konu eşlemesi (2026-10-23)

**Kullanıcı:** "soru kısmında böyle tek tek ekleyemeyiz. bunun yerine
sayfa fotoğraflarını konularla eşleştirerek yüklememiz lazım."

Haklı: 40 soruluk bir testi soru soru girmek gerçekçi değil. Soru
metnini ve şıkları sisteme yazmak yerine **sayfanın fotoğrafı**
yükleniyor; öğrenci soruyu fotoğraftan okuyup uygulamada işaretliyor.

### Veri modeli AYAKTA KALIYOR

`sorular` tablosu metinsiz soruyu zaten destekliyor: `metin` boş
olabilir, `gorsel_url` yeter (kısıt "metin ya da görsel" diyor). Yani
bir sayfa yüklendiğinde o sayfadaki her soru için bir satır açılıyor,
hepsi **aynı görseli** gösteriyor ve her birinin kendi doğru cevabı
oluyor. Puanlama, oturum, kilitleme, hak durumu — hepsi değişmiyor.

Değişen üç şey:

**1. Giriş yolu.** Koç tek tek soru yazmıyor; bir sayfa yüklüyor ve
şunu söylüyor: *bu sayfada 1-10 arası sorular var, cevaplar
ABCDEABCDE, konu "Türev", 5 şık.* Tek işlem, on satır.

**2. Çözme ekranı.** Soru metni yerine sayfa görseli gösteriliyor ve
şıklar düz A/B/C/D/E düğmeleri oluyor (şık metni fotoğrafta).
`TestCoz` bugün `siklar` dizisini bekliyor; boşsa harfleri kendisi
üretecek.

**3. Depolama izni.** Bugünkü kural yol tabanlı: dosyanın ilk klasörü
sahibinin kimliği (`yol_sahibi`) ve öğrenci yalnız kendi klasörünü,
koç da öğrencisinin klasörünü okuyabiliyor. Koçun yüklediği sayfa
fotoğrafı bu kuralla öğrenciye AÇILMAZ.
→ Ayrı bir yol öneki (`sorular/<banka_id>/...`) ve ona özel bir
politika gerekiyor: görseli, kitap kendisine açık olan herkes okusun.
Ölçüt zaten yazılı — `banka_ogrenciye_sunulabilir_mi()`. Böylece
telif kilidi görsellere de uygulanıyor: izinsiz kitabın sayfası
öğrenciye gitmiyor.

### Önerilen etkileşim

Sayfada 10 soru varsa öğrenciye **fotoğraf bir kez** gösterilip altına
10 cevap satırı konuyor; her soru için ayrı ekranda aynı fotoğrafı
tekrar tekrar göstermek telefonda yakınlaştırmayı baştan yaptırırdı.
Soru şeridi sayfa sayfa gruplanıyor.

### Telif notu yine geçerli

Artık yayınevi sayfalarının FOTOĞRAFLARI saklanıyor ve öğrenciye
gösteriliyor — metin çıkarmaktan daha doğrudan bir çoğaltma.
`hak_durumu` kilidi burada da tek koruma: varsayılan `deneme`,
öğrenciye kapalı. İzin alınana kadar kapalı pilot kaydı geçerli.

---

## 10. Yazıldı (2026-10-23)

9. bölümdeki üç değişiklik uygulandı.

**Depolama izni** — `soru_sayfasi_depo_migration.sql`.
`soru_sayfasi_banka(name)` yoldan kitap kimliğini çıkarıyor
(`sorular/<banka_id>/...`; kalıba uymayan yol NULL, politika NULL'da
kapalı). `storage.objects` üzerinde dört politika: okuma = kitabın
sahibi **ya da** `banka_ogrenciye_sunulabilir_mi()`; yazma/değiştirme/
silme = yalnız kitabın sahibi. Öğrenci soru sayfası YÜKLEYEMİYOR —
yükleyebilse kendi hazırladığı bir sayfayı teste sokabilirdi.

**Giriş yolu** — `src/lib/soruSayfasi.js` (saf, 24 sınama) +
`src/components/SayfaYukle.jsx`. Koç: fotoğraf + ilk soru no + şık
sayısı + bölüm + konu + cevap anahtarı. Anahtarın uzunluğu kaç soru
olduğunu söylüyor; "kaç soru" ayrıca sorulmuyor, iki yerden gelen sayı
çelişebilirdi. Anahtar biçimi serbest (boşluk, virgül), iptal için
`0`. Numara çakışması yüklemeden ÖNCE bulunuyor; satırlar yazılamazsa
fotoğraf depodan geri alınıyor (sahipsiz dosya kalmasın).
Yüklemeden önce "11:A 12:C ..." ızgarası gösteriliyor: bu akıştaki en
olası hata anahtarın bir kayması ve doğru cevaplar öğrenciye hiç
gösterilmediği için başka hiçbir yerde yakalanamıyor.

**Koçun listesi** — `SoruYonetimi.jsx` artık soruları sayfalara
bölüyor (`sayfalaraBol`): küçük görsel + numara aralığı + anahtar +
**tek düğmeyle sayfanın tamamını onayla**. Onay bir sayfanın bütünü
için: en olası hata (kayma) sayfanın tamamını ilgilendiriyor. Sayfa
silinince satırlar gidiyor, sonra fotoğraf siliniyor — ters sırada
öğrenci açılamayan bir soruyla karşılaşırdı.

**Çözme ekranı** — `TestCoz.jsx` soru soru değil **sayfa sayfa**
ilerliyor: fotoğraf bir kez, altında o sayfanın bütün soruları için
düz A–E satırları. `siklar` dolu olan sorular (koçun kendi yazdıkları)
eskisi gibi metinli şıklarla görünüyor; ikisi aynı testte karışabiliyor.

**Kova kapalı olduğu için** görseller imzalı adresle açılıyor
(`imzaliUrlListesi`); aynı sayfayı paylaşan 20 soru için tek imza.
Bu, görsel soruların bugüne kadar hiç açılmayacağı anlamına geliyordu:
`gorsel_url` doğrudan `<img src>`e veriliyordu ve kova public değil.

---

## 11. Testin birimi KONU oldu (2026-10-26)

**Soru:** "sonuç koça iletiliyor ama analize işleniyor mu?"

İşleniyordu, ama konu kırılımı işlenmiyordu. İki ayrı kayıp bulundu:

1. `test_sessions.subject` kitabın `ders` alanından geliyor ve o alan
   zorunlu değil. Boşsa sunucu `'Genel'` yazıyor: test çözülüyor,
   puanlanıyor, ama gerçek dersin doğruluk oranına hiç girmiyor.
2. **`sorular.konu` kolonunu hiçbir şey okumuyordu.** Koç sayfayı
   konuyla eşliyordu, veri yazılıyordu, kimse bakmıyordu.
   `test_sessions.topic` BÖLÜMÜN konusundan doluyordu; bölüm
   bağlanmamışsa yerine **kitabın adı** yazılıyordu, yani konu
   analizine konu diye "ABC Yayınları TYT Matematik" düşüyordu.

**Karar (kullanıcı):** konu test biriminin kendisi olsun.

`konu_testleri_migration.sql`:
- `test_oturumlari` artık `konu` ve `kapsam` taşıyor.
- `acik_testlerim()` konu başına bir satır döndürüyor; öğrenci
  "Türev — 20 soru" diye test görüyor.
- `test_basla(p_banka, p_konu)` — eski `p_bolum` imzası kaldırıldı.
  Varsayılanı yok: unutulunca "kitabın tamamı" gibi sessiz bir anlam
  kazanmasın.
- `testi_bitir` konuyu doğrudan `test_sessions.topic`'e yazıyor.
- **Oturumun soru kümesi tek yerde tanımlı** (`oturumun_sorulari`).
  Eskiden aynı WHERE iki fonksiyonda ayrı ayrı duruyordu; biri
  değişip diğeri kalsa öğrenci GÖRMEDİĞİ sorudan puan kaybederdi ve
  hata test bitene kadar görünmezdi. Fonksiyon öğrenciye kapalı
  (`dogru_cevap` içeriyor), yalnız SECURITY DEFINER çağıranlar
  kullanıyor.

**Eski oturumlar bozulmuyor:** kapsamı bölüme göre kurulmuş yarım
oturumlar `kapsam='bolum'` kalıyor ve eski kuralla puanlanıyor.
Sessizce konuya çevirmek, öğrencinin gördüğünden başka bir soru kümesi
üzerinden puanlanması olurdu.

Arayüz: sayfa yüklerken **konu zorunlu** ve müfredat konularından
öneriliyor (serbest yazılabiliyor — müfredatta olmayan başlık yüzünden
sayfa yüklenemez olmasın). Konusu olmayan sorular öğrenciye "Konusuz
sorular" diye ayrı bir test olarak çıkıyor; gizlenseydi hiç
çözülemezlerdi. Koça iki yeni uyarı: kitabın dersi boşsa ve konusuz
soru varsa.

## 12. Fotoğraf üzerine karalama (2026-10-26)

Kâğıt kitapta öğrenci sayfanın üstünde işlem yapıyor, şık çiziyor.
Ekranda yapamamak dijital testi kâğıttan geriye düşürüyordu.

`src/lib/karalama.js` (saf, 19 sınama) + `SayfaKaralama.jsx`:
kalem (üç renk), silgi, geri al, temizle.

- **Noktalar piksel değil oran (0–1).** Fotoğrafın ekrandaki genişliği
  değişken; piksel tutulsa çizgiler her boyut değişiminde kayardı.
- **Varsayılan kip "kaydır".** Tuval sürekli dokunmayı yakalasa
  telefonda kaydırmak ve yakınlaştırmak imkânsız olurdu, öğrenci küçük
  yazıyı okuyamazdı. Yazmak için düğmeye basmak gerekiyor.
- **Silgi çizgiyi siler, pikseli değil** — çizgiler liste olduğu sürece
  "geri al" listenin sonunu atmak. Piksel silinse geri alma olmazdı.
  Silgi noktalara değil doğru parçalarına bakıyor: hızlı çekilen
  çizgide noktalar seyrek düşüyor, aradaki uzun parçaya değmek
  sayılmalı.
- Sürüklerken yalnız yeni parça çiziliyor, tuvalin tamamı değil; her
  harekette state güncellemek telefonda gözle görülür takılma yapıyordu.

**Şimdilik kaydedilmiyor:** çizgiler test penceresi kapanınca gidiyor.
Sunucuya kaydetme yayına almadan önce yapılacak (YOL_HARITASI.md §4.5).
