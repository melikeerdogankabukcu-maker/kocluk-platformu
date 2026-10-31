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

## E. Arayüz eksikleri (küçük)

- Koç ve veli panelindeki öğrenci listesi **seçilen avatarı
  göstermiyor** — veritabanı izni hazır, o ekranların tercihleri
  yüklemesi yeterli.
- **ISBN'den kitap adı getirme** (dış servis) yapılmadı; ISBN elle
  ya da barkodla giriliyor, ad yazılıyor.
- **Google Meet otomatik bağlantısı** — şu an elle link alanı var.
  Calendar API + OAuth gerekiyor.
- **iPhone'da barkod taraması yok** (`BarcodeDetector` iOS'ta
  bulunmuyor); düğme yalnız destekleyen cihazda çıkıyor, iPhone'da
  elle giriş. Çözülecekse jsQR (~15 KB) ölçülmeli.

---

## F. Geri bildirim bekleyenler

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

## G. Tanımlanmamış (yazılmadan plana giremez)

- **Kitap okuma modülü** — ne yapıyor? Kitap takibi mi, okuma süresi
  mi, okunan kitap listesi mi, yoksa kitabın içeriğinin uygulamada
  gösterilmesi mi? Sonuncusu telif meselesi.
- **Kişisel gelişim katmanı** — hangi veriyi topluyor, kime
  gösteriyor, ne kararını değiştiriyor?

---

## H. Bilerek ertelenenler

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
