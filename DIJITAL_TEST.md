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
