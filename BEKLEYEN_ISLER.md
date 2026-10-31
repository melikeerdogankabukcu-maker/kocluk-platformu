# Bekleyen İşler

31 Ekim 2026'da, o güne kadar konuşulan her şeyden çıkarıldı:
`YOL_HARITASI.md`, `DIJITAL_TEST.md`, `OCR.md`, `PLAY_STORE.md` ve
oturum notları.

Sıralama öncelik değil, **ne tarafından engellendiği**. Çünkü bu
listede tıkanmaların çoğu kod değil: izin, hesap, bütçe ve karar.

---

## A. Mağazaya çıkmadan önce — zorunlu

| iş | durum | kimde |
|---|---|---|
| **Karalamanın sunucuya kaydedilmesi** | karar verildi, yazılmadı | bende |
| **Gizlilik politikasındaki 9 boş alan** | `/gizlilik.html` sarı `class="doldur"` ile işaretli: unvan, adres, e-posta, VERBİS, Supabase bölgesi, saklama süreleri, tarih | sizde |
| **Hukuki inceleme** | yapılmadı | sizde |
| **Kapalı test için 12 testçi** | şu an 9 kullanıcı var | sizde |
| **`.aab` yüklenmesi** | dosya hazır, yüklenmedi | sizde |
| **Play App Signing parmak izi** | yükledikten sonra `assetlinks.json`'a **ikinci** kayıt olarak eklenmeli | sizde |
| **Yapay zekâ asistanı** | kod hazır, `ANTHROPIC_API_KEY` Render'a eklenmedi; `/asistan/durum` hâlâ 404 (eski sürüm servis ediliyor); hiç canlı denenmedi | sizde + bende |

Asistanı erteleme kararı sizindi ("mağazaya yüklemeden önce aktive
edeceğiz"), o yüzden kendiliğinden gündeme getirmiyorum.

**Parmak izi maddesi atlanırsa** mağazadan kurulan sürümde adres
çubuğu görünür — uygulama "web sitesi" gibi açılır.

---

## B. Dijital test ve soru hattı

**PDF ölçümü — bütün bir kararın önünde duruyor.** Şekilli soruların
kapsama girip girmeyeceği buna bağlı ve tahminle cevaplanmayacak:
bir PDF kitabın yolunu verirseniz (a) metin katmanı var mı yoksa
taranmış görüntü mü, (b) soruların yüzde kaçında şekil var, (c) şıklar
düzenli bir kalıpta mı duruyor — üçünü çıkarıp belgeye yazarım.
*İstendi, henüz gelmedi.*

- **PDF'ten içe aktarma hattı** — asıl girdi yolu olacak diye
  kararlaştırıldı; ölçümü bekliyor.
- **Mevcut sayfaların konusu.** Konu alanı 26 Ekim'de zorunlu oldu;
  daha önce yüklenen sayfalar konusuz olabilir. Sorular ekranında
  "N sorunun konusu yok" uyarısı varsa o sorular öğrenciye tek yığın
  çıkıyor ve konu analizine işlenmiyor.
- **Cevap anahtarı kitabın tamamı için tek olacak.** Bugünkü
  `cevap_anahtarlari` bölüme bağlı. Sorular `dogru_cevap` taşıdığı
  için pratikte aşıldı; tablo yine de eski hâlinde duruyor.
- **Ertelenmiş dosyalar** (⏸ başlıklı, arayüze bağlı değil):
  `CevapKagidi.jsx`, `cevapKagidi.js`, `cevap_kagidi_migration.sql`.
  Kimlik şeridi tasarımı ileride lazım olabilir (24 veri + 6 sağlama
  biti; 500 denemede tek kare hatasının 500'ü yakalandı).
- **Okuma (OCR) servisi yayına alınmadı** — `kocluk-backend/ocr`,
  ölçülmüş ve çalışır durumda. Render'da ayrı servis tanımı hazır
  ama **ücretli plan gerekiyor**.

---

## C. Telif ve pilot

- **Yayınevi izni / işbirliği.** Şu an izin YOK; kitaplar
  `kapalı pilot` hak durumunda. Müfredattan kalkmak telif hakkını
  sona erdirmiyor — bu seçim riski azaltıyor, izinli yapmıyor.
  Gereken somut adım: bir izin mektubu.
- **Pro plan kararı.** Öğrenci pilotu başlayınca Supabase ücretsiz
  katmanın 7 günlük duraklatması kabul edilemez olacak. Pro'ya
  geçildiğinde `.github/workflows/canli-tut.yml` **silinmeli** —
  o dosya geçici bir yama ve kalıcı sanılmamalı.

---

## D. Notlanmış riskler — 31 Ekim 2026'da KAPATILDI

Dördü de ele alındı. Kayıt olarak duruyor; yeni bir iş değil.

- ✅ **`users` e-posta sızıntısı** (`9cb5413`). Satırlar değil
  SÜTUNLAR daraltıldı: `authenticated` artık `email` ve
  `talep_ogrenci_email` sütunlarını seçemiyor. Dizin `kisi_dizini`
  görünümünden maskeli adresle (`a***@gmail.com`) geliyor, maskeleme
  sunucuda. Gerçek adres yalnız admin'e, `yonetim_kullanicilari()`
  RPC'siyle. Satır daraltılmadı çünkü bağlantı kurmak dizin
  gerektiriyor — dizin işin gereği, e-postanın dizinde olması değil.
- ✅ **Eski kalıp politikalar** (`eski_kalip_politika_temizligi.sql`).
  Ölçüldü: görev atamış her koç–öğrenci çiftinin onaylı bağlantısı
  var, fazladan geçen kimse yok. Üç politika kaldırıldı; yetki artık
  yalnız `ogrencim_mi()`'den geliyor, yani bağlantı kalkınca erişim
  de kalkıyor.
- ✅ **Depo iki biçim** (`280f8ad`). Not yanlıştı: eski kalıntı değil,
  BÜYÜYEN bir ayrışmaydı — kova kapalı olmasına rağmen dört yer her
  yeni yüklemede public adres yazıyordu. Artık yol yazılıyor. Eski
  satırlara dokunulmadı ve **göç önerilmiyor**: okuma zaten iki
  biçimi de kabul ediyor, yarısı dönmüş bir göç dosyaları büsbütün
  erişilemez yapardı.
- ✅ **Sessiz hatalar** (`93f5cc7`). 180 çağrının 120'si zaten
  sarılıydı; 8 yer çıktı. Altısında hata tamamen düşüyordu, ikisi
  boş bırakılmış `storage.remove`'du. Davranış değil İZ sorunuydu:
  izin reddi ile "veri yok" ayırt edilemiyordu.

---

## E. Arayüz eksikleri — 31 Ekim 2026

- ✅ **Avatarlar koç ve veli panelinde** (`0251735`). Öğrenci simgesini
  seçiyor, kendi panelinde görüyordu; koçun listesinde baş harfler
  duruyordu. Veritabanı izni baştan vardı, eksik olan okumaydı.
  `useAvatarlar` kancası onlarca öğrencinin avatarını tek sorguda
  okuyor (kendi tercihi için kurulu `TercihContext` tek kullanıcıya
  bağlı, çoğaltılamaz).
- ✅ **ISBN'den kitap adı ve yayınevi** (`0251735`). Google Books;
  dışarı çıkan tek şey ISBN. Kendiliğinden değil düğmeyle, gelen ad
  doğrudan yazılmıyor önerilip onaylanıyor, bulunamamak hata değil
  (sınav kaynaklarının çoğu katalogda yok).
- ⛔ **iPhone'da barkod taraması — ÖLÇÜLDÜ, YAPILMIYOR.** Bu maddedeki
  "jsQR (~15 KB)" notu **yanlıştı**: jsQR QR okur, kitap barkodu ise
  EAN-13 — 1D çözücü gerekiyor (zxing sınıfı, birkaç yüz KB). Dinamik
  yüklemeyle maliyeti yalnız iPhone kullanıcısına yıkmak mümkün, ama
  kazanç kitap başına bir kez 13 hane yazmaktan kurtulmak; iOS
  Safari'nin kamera davranışı da ayrı bir iş. Yapılmadı; bunun yerine
  destek olmayan cihazda **sebebi yazan bir satır** eklendi — düğmeyi
  arayan koç cihazını suçlamasın.
- ⏸ **Google Meet otomatik bağlantısı** — şu an elle link alanı var.
  Calendar API + OAuth gerekiyor, yani Google Cloud'da proje ve onay
  akışı: **sizin tarafta** bir adım olmadan başlanamaz.

---

## F. Geri bildirim bekleyenler — hepsi sizin tarafta

Bunlar yazılacak kod değil: ya denenmesi ya içerik girilmesi gerekiyor.

- **Ödev öneri motoru** yazıldı ama hiç denenmedi. Eşikler çalışma
  tarzınıza uyuyor mu: `YETERLI_SORU=10`, `ZAYIF_ESIGI=65`,
  `SAYFA_DILIMI=12`, `TEKRAR_BEKLEME_GUN=7`.
- **İçindekiler verisi eksik.** 4 kaynaktan 2'sinin içindekileri boş;
  41 bölümün hepsi Fizik + Geometri'den, oysa öğrencilerin ölçülebilir
  zayıflığı **Matematik**'te. Bir matematik kitabı aktarılırsa motor
  belirgin biçimde işe yarar. Aktarılmış bölümlerde OCR kalıntısı da
  var (tuhaf aralıklar, geriye giden sayfa numaraları).
- **Dijital testi bitirme + sunucu puanlaması** uçtan uca denenmedi.

---

## G. Tanımsız iki modül — öneri yazıldı, karar sizde

İkisi "kapsamı belirsiz" diye bekliyordu. Aşağıdakiler somut öneri;
onaylarsanız iş planına girerler, beğenmezseniz başlangıç noktası olur.

### G.1 Kitap okuma modülü

Dört okunuşu vardı. Üçünü eliyorum, gerekçeleriyle:

- ~~Kitabın içeriğini uygulamada göstermek~~ — telif. Soru
  bankasında aldığımız riskin kat kat üstü ve bu sefer eser bütünüyle
  çoğaltılıyor. Yayınevi izni olsa bile ayrı bir ürün.
- ~~Genel "okuma süresi" sayacı~~ — çalışma planı bunu zaten yapıyor
  (blok türü "serbest"). İkinci bir sayaç aynı veriyi iki yere yazar.
- ~~Bağımsız kitap listesi~~ — tek başına bir liste, hiçbir kararı
  değiştirmiyor. Rozet dışında çıktısı yok.

**Öneri: "Okuma alışkanlığı" — koçluğun kendi verisine bağlı.**
Öğrenci okuduğu kitabı (ad + yazar + sayfa sayısı) ve ilerlemesini
giriyor; koç haftalık okuma hedefi veriyor (örn. 30 sayfa/gün) ve bu
hedef **çalışma planında bir blok** olarak görünüyor. Kazanç: paragraf
sorularındaki başarıyla okuma alışkanlığı yan yana konabiliyor —
Türkçe neti düşük olan öğrenciye "paragraf çalış" demek yerine
ölçülmüş bir alışkanlık verisi oluyor.

Veri: `okuma_kayitlari` (öğrenci, kitap adı, yazar, toplam sayfa,
okunan sayfa, başlangıç/bitiş). Mevcut plan ve rapor altyapısına
bağlanıyor, yeni bir ekran ağacı gerekmiyor.

**Kapsam dışı bıraktığım şey:** kitap önerisi/küratörlük. Yaş grubuna
kitap önermek editoryal bir iş ve yanlış öneri veliyi karşımıza alır.

### G.2 Kişisel gelişim katmanı

Değerlendirmede "kişisel gelişim" diye geçiyordu ama veri, izleyici ve
etkisi yazılmamıştı. Üçünü yazmadan bu madde plana giremez; öneri:

**Öneri: çalışma alışkanlığı anketi (H'deki karara bağlı).**
Psikolojik test yerine zaten bu kararlaştırılmıştı. 10–12 soruluk,
puanlanmayan, tanı koymayan bir anket: öğrenme biçimi tercihi,
kesintisiz çalışma süresi, günün hangi saatinde verimli, erteleme
eğilimi, çalışma ortamı.

- **Hangi veri:** yalnız öğrencinin kendi beyanı. Özel nitelikli veri
  (sağlık, ruh hâli) **yok** — KVKK'da o kategoriye hiç girmiyoruz.
- **Kime görünüyor:** öğrenciye ve koçuna. Veliye **özet bile
  gitmiyor**; öğrenci koçuna "sabah verimsizim" diyebilmeli ve bunun
  evde konuşulacağını düşünmemeli.
- **Neyi değiştiriyor:** tek bir şey — çalışma planı önerisinin blok
  süresi ve günün saati. 25 dakikada dağılan öğrenciye 90 dakikalık
  blok önermemek. Bu olmazsa anket sadece veri toplamış olur.

**Kapsam dışı:** puan, profil etiketi ("görsel öğrenen" gibi), koç
panelinde kişilik kartı. Etiket bir kez yapışıyor ve yanlış olduğunda
öğrenciyi takip ediyor.

---

## H. Bilerek ertelenenler — gerekçeler hâlâ geçerli

Bunlar "yapılacak iş" değil, **verilmiş kararlar**. Üçünün gerekçesi
hukuki ya da kapsamsal; değişmedikçe açılmamalı. Dördüncüsü (anket)
G.2'de öneri olarak duruyor — onay verirseniz H'den çıkıp plana girer.

- **Sosyal mecra.** Kullanıcıların çoğu 18 yaş altı; moderasyon,
  raporlama, içerik denetimi ve veli onayı altyapısı kurulmadan
  açılmamalı.
- **Psikolojik testler → çalışma alışkanlığı anketi.** Test uygulama
  ve yorumlama yetkisi lisanslı uzmanlarda, veriler KVKK'da özel
  nitelikli. Anket aynı faydayı verir, riski taşımaz.
- **Tam tema / karanlık mod.** Kodda 144 elle yazılmış hex var.
- **`src/fen-tekrar-programi.jsx`** — 752 satır, hiçbir yerden
  import edilmiyor; sonra entegre edilecek. **Dokunulmayacak.**

---

## Süreç kuralı (14 Ekim'de öğrenildi)

Optik form yolu önkabul sınanmadan yazıldı: üç migration ve birkaç
bileşen arka arkaya çıktı, sonra yolun kendisi değişti.

**Bundan sonra her yeni akışta önce akışın tamamı yazılıp onaylanacak,
veri modeli sonra.**

Ve ölçüm ilkesi: *her değişiklik gerçek veriyle ölçülür, ölçülmeyen
iyileştirme iyileştirme sayılmaz.* Fotoğraftan okuma işinde bu düzen
89/147'den 110/147'ye çıkardı ve iki kez "iyi fikir" sanılan
değişikliği eledi.
