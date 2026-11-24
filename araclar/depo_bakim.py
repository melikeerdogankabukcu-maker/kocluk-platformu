"""Depo bakımı: sahipsiz dosyaları siler, büyük fotoğrafları küçültür.

    python araclar/depo_bakim.py                 # yalnız RAPOR (varsayılan)
    python araclar/depo_bakim.py --uygula        # gerçekten değiştirir

Seçenekler
    --sadece-sahipsiz   yalnız sahipsiz dosyaları sil, küçültme yapma
    --sadece-kucult     yalnız küçült, silme yapma
    --eski-sil GUN      GUN günden eski ödev/test/mesaj fotoğraflarını sil
                        ve kayıttaki bağlantılarını temizle (saklama süresi)
    --yedeksiz          özgün dosyaları diske yedekleme (ÖNERİLMEZ)
    --yedek KLASOR      yedek klasörü (varsayılan: ./depo_yedek)
    --sinir BAYT        bu boyutun altındaki dosyaya dokunma (varsayılan 400 KB)
    --en-buyuk PIKSEL   uzun kenar sınırı (varsayılan 1600)

── NEDEN BU BETİK VAR ────────────────────────────────────────────
24 Kasım 2026: ücretsiz plan depo kotası aşıldı (1476 MB / 539 dosya,
ortalama 2,8 MB) ve proje bütün servisleriyle kısıtlandı. Dosyaların
tamamı 5 Kasım öncesinde, yani yükleme öncesi küçültme eklenmeden
yüklenmiş telefon fotoğrafları. %98'i plan bloğu ve test görselleri.

── YOLLAR DEĞİŞMİYOR, BU YÜZDEN VERİTABANINA DOKUNULMUYOR ────────
Küçültülen dosya AYNI yola geri yazılıyor (upsert). Böylece
`dosyalar[].url`, `file_url`, `photo_url` gibi alanların hiçbiri
güncellenmek zorunda kalmıyor. Yola dokunan bir çözüm, yarısı dönmüş
hâlde kalırsa kayıtları kırık bağlantılara bağlı bırakırdı.

── ÖNCE YEDEK, SONRA DEĞİŞTİR ────────────────────────────────────
Özgün dosya diske yazılmadan üzerine yazılmıyor. İşlem geri
alınamaz; yedek, "küçülttük ama okunmuyor" durumunda tek çıkış yolu.

── SAKLAMA SÜRESİ (--eski-sil) ───────────────────────────────────
Küçültme birikme hızını onda bire indiriyor ama sıfırlamıyor. Belli
bir yaştan eski ödev/test/plan/mesaj fotoğrafları siliniyor ve
kayıttaki bağlantıları temizleniyor.

Kayıt SİLİNMİYOR: çözülen soru sayısı, net, süre, koç onayı yerinde
kalıyor — yalnız fotoğraf gidiyor. Veli raporundaki "fotoğraflı
kayıt" sayısı eski dönemler için düşer; beklenen davranış bu.

Bağlantı da temizleniyor, yoksa arayüz olmayan bir fotoğrafı
göstermeye çalışır ve kullanıcı dosyanın bozulduğunu sanır.

İÇERİK DOSYALARINA DOKUNULMUYOR: soru sayfaları (sorular/), kitap
kapakları (kitaplar/), kurum logoları (kurum/) ve profil
fotoğrafları. Bunlar kanıt değil içerik; eskimiyorlar.

── KALDIĞI YERDEN DEVAM ──────────────────────────────────────────
Her dosya bitince durum dosyasına işleniyor. Yarıda kesilirse aynı
komut kaldığı yerden sürüyor; 539 dosyayı baştan indirmiyor.
"""

import argparse
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Windows konsolu cp1254 ile açılıyor ve kutu çizgisi gibi karakterler
# UnicodeEncodeError veriyor. Çıktı akışı UTF-8'e alınıyor; alınamazsa
# yazılamayan karakter yerine '?' konuyor, betik yine de çalışıyor.
for _akis in (sys.stdout, sys.stderr):
    try:
        _akis.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    from PIL import Image
except ImportError:
    print("Pillow gerekiyor:  pip install Pillow")
    sys.exit(1)

ENV_YOLU = Path(r"C:\Users\asus\kocluk-backend\.env")
KOVA = "homework"
DURUM_DOSYASI = Path("depo_bakim_durum.json")

# Yüklemeden önce küçültmeyle aynı değerler (src/lib/gorselKucult.js):
# aynı fotoğrafın iki yoldan geçmesi farklı sonuç vermesin.
EN_BUYUK_KENAR = 1600
KALITE = 80
VARSAYILAN_SINIR = 400 * 1024

GORSEL_UZANTI = (".jpg", ".jpeg", ".png", ".webp")
# Küçültülmeyecekleri saymak, görselleri saymaktan güvenilir çıktı:
# uygulama bir dönem dosyaları uzantısız yüklemiş (23 MB'ı uzantısız
# fotoğraf). Uzantıya bakıp "görsel değil" demek onları atlıyordu.
# Pillow açamadığı dosyayı zaten atlıyor, bu yüzden karar ona bırakıldı.
GORSEL_OLMAYAN_UZANTI = (".pdf", ".doc", ".docx", ".xls", ".xlsx",
                         ".zip", ".rar", ".txt", ".csv", ".mp4", ".mp3")

# Dosya adresi tutan her yer. Biri unutulursa o dosyalar "sahipsiz"
# görünür ve SİLİNİR — bu yüzden liste şemayla birlikte güncellenmeli.
REFERANS_KAYNAKLARI = [
    ("homework_submissions", ["dosyalar", "file_url"]),
    ("test_sessions",        ["dosyalar", "file_url"]),
    ("messages",             ["dosyalar"]),
    ("student_profiles",     ["photo_url"]),
    ("sorular",              ["gorsel_url"]),
    ("okuma_kitaplari",      ["kapak_url"]),
    ("kurumlar",             ["logo_url"]),
]


# ── Ortam ────────────────────────────────────────────────────────
def env_oku(yol):
    d = {}
    with open(yol, encoding="utf-8") as f:
        for satir in f:
            satir = satir.strip()
            if satir and not satir.startswith("#") and "=" in satir:
                k, v = satir.split("=", 1)
                d[k.strip()] = v.strip().strip('"').strip("'")
    return d


class Depo:
    """Supabase Storage ve PostgREST çağrıları.

    Anahtar yalnız başlıklarda kullanılıyor; hiçbir yere yazdırılmıyor.
    """

    def __init__(self, url, anahtar):
        self.url = url.rstrip("/")
        self.anahtar = anahtar

    def _cagir(self, yol, yontem="GET", govde=None, ikili_govde=None,
               icerik_turu=None, ustbilgi=None, ikili_yanit=False):
        istek = urllib.request.Request(self.url + yol, method=yontem)
        istek.add_header("apikey", self.anahtar)
        istek.add_header("Authorization", "Bearer " + self.anahtar)
        for k, v in (ustbilgi or {}).items():
            istek.add_header(k, v)

        veri = None
        if ikili_govde is not None:
            veri = ikili_govde
            istek.add_header("Content-Type", icerik_turu or "application/octet-stream")
        elif govde is not None:
            veri = json.dumps(govde).encode()
            istek.add_header("Content-Type", "application/json")
        istek.data = veri

        # Geçici sunucu hatasında üç deneme: 539 dosyalık bir turda tek
        # bir 503 bütün işi bölmemeli.
        son = None
        for deneme in range(3):
            try:
                with urllib.request.urlopen(istek, timeout=120) as y:
                    ham = y.read()
                    return y.status, (ham if ikili_yanit else ham.decode("utf-8", "replace"))
            except urllib.error.HTTPError as e:
                govde_metni = e.read().decode("utf-8", "replace")[:300]
                if e.code in (429, 500, 502, 503, 504) and deneme < 2:
                    time.sleep(2 * (deneme + 1))
                    son = (e.code, govde_metni)
                    continue
                return e.code, govde_metni
            except Exception as e:
                if deneme < 2:
                    time.sleep(2 * (deneme + 1))
                    son = (0, f"{type(e).__name__}: {e}")
                    continue
                return 0, f"{type(e).__name__}: {e}"
        return son or (0, "bilinmeyen")

    def dosyalari_listele(self, onek=""):
        """Kovadaki bütün dosyalar, alt klasörlere inerek."""
        bulunan = []
        sayfa = 0
        while True:
            durum, govde = self._cagir(
                f"/storage/v1/object/list/{KOVA}", "POST",
                {"prefix": onek, "limit": 100, "offset": sayfa * 100,
                 "sortBy": {"column": "name", "order": "asc"}})
            if durum != 200:
                raise RuntimeError(f"listeleme {durum}: {govde}")
            girisler = json.loads(govde)
            if not girisler:
                break
            for g in girisler:
                ad = g.get("name")
                tam = f"{onek}{ad}" if onek.endswith("/") or not onek else f"{onek}/{ad}"
                if not onek:
                    tam = ad
                # id dolu = gerçek dosya; boş = klasör
                if g.get("id"):
                    boyut = ((g.get("metadata") or {}).get("size")) or 0
                    bulunan.append({"yol": tam, "boyut": int(boyut),
                                    "tarih": g.get("created_at") or ""})
                else:
                    bulunan.extend(self.dosyalari_listele(tam + "/"))
            if len(girisler) < 100:
                break
            sayfa += 1
        return bulunan

    def indir(self, yol):
        return self._cagir(f"/storage/v1/object/{KOVA}/{yol}", "GET", ikili_yanit=True)

    def yukle(self, yol, veri, icerik_turu):
        return self._cagir(f"/storage/v1/object/{KOVA}/{yol}", "POST",
                           ikili_govde=veri, icerik_turu=icerik_turu,
                           ustbilgi={"x-upsert": "true"})

    def sil(self, yollar):
        return self._cagir(f"/storage/v1/object/{KOVA}", "DELETE",
                           {"prefixes": yollar})

    def satir_guncelle(self, tablo, kimlik, alanlar):
        return self._cagir(f"/rest/v1/{tablo}?id=eq.{kimlik}", "PATCH",
                           alanlar, ustbilgi={"Prefer": "return=minimal"})

    def tablo(self, ad, kolonlar):
        durum, govde = self._cagir(
            f"/rest/v1/{ad}?select={','.join(kolonlar)}", "GET")
        if durum != 200:
            raise RuntimeError(f"{ad} okunamadi ({durum}): {govde}")
        return json.loads(govde)


# ── Referans toplama ─────────────────────────────────────────────
def yola_indir(ref):
    """Eski public adresi yola indirger; yalın yolu olduğu gibi döndürür."""
    if not ref:
        return None
    isaret = "/object/public/%s/" % KOVA
    if isaret in ref:
        ref = ref.split(isaret, 1)[1].split("?")[0]
    elif ref.startswith("http"):
        return None                      # tanımadığımız bir adres
    return urllib.parse.unquote(ref) if "%" in ref else ref


def kullanilan_yollar(depo):
    kullanilan = set()
    for tablo, kolonlar in REFERANS_KAYNAKLARI:
        satirlar = depo.tablo(tablo, kolonlar)
        for satir in satirlar:
            for kolon in kolonlar:
                deger = satir.get(kolon)
                if deger is None:
                    continue
                if isinstance(deger, list):          # dosyalar JSONB dizisi
                    for d in deger:
                        y = yola_indir((d or {}).get("url"))
                        if y:
                            kullanilan.add(y)
                else:
                    y = yola_indir(deger)
                    if y:
                        kullanilan.add(y)
    return kullanilan


# ── Saklama süresi ───────────────────────────────────────────────
# Kalıcı içerik: eskimiyor, saklama süresinin dışında.
KALICI_ONEKLER = ("sorular/", "kitaplar/", "kurum/")

# Süresi dolan dosyanın bağlantısını taşıyan tablolar. Kalıcı içeriğin
# tabloları (sorular, okuma_kitaplari, kurumlar, student_profiles) burada
# YOK: onların dosyaları hiç silinmiyor.
REFERANSLI_TABLOLAR = [
    ("homework_submissions", ["dosyalar", "file_url"]),
    ("test_sessions",        ["dosyalar", "file_url"]),
    ("messages",             ["dosyalar"]),
]


def suresi_dolabilir_mi(yol):
    """Bu dosya saklama süresine tabi mi?"""
    if yol.startswith(KALICI_ONEKLER):
        return False
    if "/profil/" in yol:          # profil fotoğrafı kişinin kendisi
        return False
    return True


def referansi_temizle(depo, tablo, kolonlar, silinecek):
    """Silinen dosyaların bağlantılarını kayıtlardan çıkarır.

    Kayıt silinmiyor, yalnız dosya alanları temizleniyor. Bağlantı
    kalsaydı arayüz olmayan bir fotoğrafı göstermeye çalışır ve
    kullanıcı dosyanın bozulduğunu sanardı.

    Döndürür: (güncellenen_kayıt, hata_sayısı)
    """
    satirlar = depo.tablo(tablo, ["id"] + kolonlar)
    degisen = 0
    hata = 0
    for satir in satirlar:
        yama = {}
        for kolon in kolonlar:
            deger = satir.get(kolon)
            if deger is None:
                continue
            if isinstance(deger, list):
                kalan = [d for d in deger
                         if yola_indir((d or {}).get("url")) not in silinecek]
                if len(kalan) != len(deger):
                    yama[kolon] = kalan
            else:
                if yola_indir(deger) in silinecek:
                    yama[kolon] = None
        if not yama:
            continue

        kod, govde = depo.satir_guncelle(tablo, satir["id"], yama)

        # 23502 = NOT NULL. homework_submissions.file_url boş geçilemiyor;
        # boş metin de "dosya yok" sayılıyor (arayüzde de, ölçüm
        # sorgusunda da), o yüzden NULL yerine '' ile yeniden deniyoruz.
        if kod not in (200, 204) and '"23502"' in govde:
            yama = {k: ("" if v is None else v) for k, v in yama.items()}
            kod, govde = depo.satir_guncelle(tablo, satir["id"], yama)

        if kod not in (200, 204):
            print(f"  HATA {tablo} {satir['id']}: {kod} {govde[:120]}")
            hata += 1
        else:
            degisen += 1
    return degisen, hata


# ── Küçültme ─────────────────────────────────────────────────────
def kucult(veri, en_buyuk, kalite):
    """Döndürür: (yeni_bayt, bilgi) — küçültülemezse (None, sebep)."""
    try:
        g = Image.open(io.BytesIO(veri))
        g.load()
    except Exception as e:
        return None, f"acilamadi ({type(e).__name__})"

    # EXIF yönü uygulanıyor, yoksa küçültülen fotoğraf yan dönebiliyor.
    try:
        from PIL import ImageOps
        g = ImageOps.exif_transpose(g)
    except Exception:
        pass

    if g.mode not in ("RGB", "L"):
        g = g.convert("RGB")

    uzun = max(g.size)
    if uzun > en_buyuk:
        oran = en_buyuk / uzun
        g = g.resize((max(1, round(g.width * oran)), max(1, round(g.height * oran))),
                     Image.LANCZOS)

    tampon = io.BytesIO()
    g.save(tampon, format="JPEG", quality=kalite, optimize=True, progressive=True)
    yeni = tampon.getvalue()
    if len(yeni) >= len(veri):
        return None, "kucultme kazanc saglamadi"
    return yeni, f"{g.width}x{g.height}"


# ── Durum (kaldığı yerden devam) ─────────────────────────────────
def durum_oku():
    if DURUM_DOSYASI.exists():
        try:
            return json.loads(DURUM_DOSYASI.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"kuculttu": [], "sildi": [], "eski_sildi": []}


def durum_yaz(d):
    DURUM_DOSYASI.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")


def mb(b):
    return f"{b / 1048576:.1f} MB"


# ── Ana akış ─────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Supabase depo bakimi")
    ap.add_argument("--uygula", action="store_true", help="gercekten degistir")
    ap.add_argument("--sadece-sahipsiz", action="store_true")
    ap.add_argument("--sadece-kucult", action="store_true")
    ap.add_argument("--eski-sil", type=int, metavar="GUN",
                    help="GUN gunden eski odev/test/mesaj fotograflarini sil")
    ap.add_argument("--yedeksiz", action="store_true")
    ap.add_argument("--yedek", default="depo_yedek")
    ap.add_argument("--sinir", type=int, default=VARSAYILAN_SINIR)
    ap.add_argument("--en-buyuk", type=int, default=EN_BUYUK_KENAR)
    ap.add_argument("--kalite", type=int, default=KALITE)
    a = ap.parse_args()

    cevre = env_oku(ENV_YOLU)
    url, anahtar = cevre.get("SUPABASE_URL"), cevre.get("SUPABASE_KEY")
    if not url or not anahtar:
        print(f"HATA: {ENV_YOLU} icinde SUPABASE_URL / SUPABASE_KEY yok")
        return 1

    depo = Depo(url, anahtar)
    durum = durum_oku()
    yedek_kok = Path(a.yedek)

    print("Dosyalar listeleniyor...")
    try:
        dosyalar = depo.dosyalari_listele()
    except RuntimeError as e:
        print(f"\nLISTELEME BASARISIZ: {e}")
        if "402" in str(e):
            print("\nProje kota kisiti altinda; depo API'si kapali.\n"
                  "Kisit kalkmadan bu betik calisamaz.")
        return 1

    toplam = sum(d["boyut"] for d in dosyalar)
    print(f"{len(dosyalar)} dosya, {mb(toplam)}\n")

    print("Veritabanindaki referanslar okunuyor...")
    kullanilan = kullanilan_yollar(depo)
    print(f"{len(kullanilan)} benzersiz referans\n")

    sahipsiz = [d for d in dosyalar if d["yol"] not in kullanilan]
    kucultulecek = [
        d for d in dosyalar
        if d["yol"] in kullanilan
        and d["boyut"] > a.sinir
        and not d["yol"].lower().endswith(GORSEL_OLMAYAN_UZANTI)
    ]

    # Saklama süresi: yaşı geçmiş ve kalıcı olmayan dosyalar.
    eskiler = []
    if a.eski_sil:
        sinir_tarih = datetime.now(timezone.utc) - timedelta(days=a.eski_sil)
        # Sahipsizler zaten silinecek; iki listede de olursa kazanc iki
        # kez sayilirdi.
        sahipsiz_yollar = {d["yol"] for d in sahipsiz}
        for d in dosyalar:
            if d["yol"] in sahipsiz_yollar:
                continue
            if not suresi_dolabilir_mi(d["yol"]):
                continue
            ham = (d.get("tarih") or "").replace("Z", "+00:00")
            try:
                t = datetime.fromisoformat(ham)
            except ValueError:
                continue                    # tarihi okunamayan dosyaya dokunma
            if t < sinir_tarih:
                eskiler.append(d)
        # Süresi dolan dosya küçültülmeyecek: birazdan silinecek.
        eski_yollar = {d["yol"] for d in eskiler}
        kucultulecek = [d for d in kucultulecek if d["yol"] not in eski_yollar]

    sahipsiz_b = sum(d["boyut"] for d in sahipsiz)
    kucult_b = sum(d["boyut"] for d in kucultulecek)
    # 250 kB: 5 Kasim sonrasi kucultulmus dosyalarin olculen ortalamasi.
    tahmin = len(kucultulecek) * 250 * 1024

    print("-- PLAN " + "-" * 40)
    if not a.sadece_kucult:
        print(f"  Silinecek (sahipsiz) : {len(sahipsiz):4d} dosya  {mb(sahipsiz_b)}")
    if not a.sadece_sahipsiz:
        print(f"  Kucultulecek         : {len(kucultulecek):4d} dosya  {mb(kucult_b)}"
              f"  ->  ~{mb(tahmin)}")
    kazanc = (0 if a.sadece_kucult else sahipsiz_b) + \
             (0 if a.sadece_sahipsiz else max(0, kucult_b - tahmin)) + \
             sum(d["boyut"] for d in eskiler)
    if a.eski_sil:
        print(f"  Suresi dolan ({a.eski_sil}g)  : {len(eskiler):4d} dosya  "
              f"{mb(sum(d['boyut'] for d in eskiler))}")
    print(f"  Beklenen kazanc      : ~{mb(kazanc)}")
    print(f"  Kalan (tahmini)      : ~{mb(toplam - kazanc)}")
    print("─────────────────────────────────────────────────\n")

    if not a.uygula:
        print("RAPOR MODU — hicbir sey degistirilmedi.")
        print("Uygulamak icin ayni komutu --uygula ile calistirin.")
        return 0

    # ── Sahipsizleri sil ──
    if not a.sadece_kucult and sahipsiz:
        kalan = [d for d in sahipsiz if d["yol"] not in durum["sildi"]]
        print(f"Sahipsiz dosyalar siliniyor ({len(kalan)})...")
        # 100'luk gruplar: tek istekte binlerce yol gondermek
        # sunucunun istek sinirina takiliyor.
        for i in range(0, len(kalan), 100):
            obek = [d["yol"] for d in kalan[i:i + 100]]
            kod, govde = depo.sil(obek)
            if kod not in (200, 204):
                print(f"  HATA {kod}: {govde[:160]}")
                break
            durum["sildi"].extend(obek)
            durum_yaz(durum)
            print(f"  {min(i + 100, len(kalan))}/{len(kalan)}")

    # ── Suresi dolanlari sil ──
    # Once dosya silinir, sonra kayittaki baglanti temizlenir. Ters sira
    # daha kotu olurdu: baglanti gider, dosya diskte kalir ve bir daha
    # bulunamaz. Bu sirada silinip temizlenmeyen yollar durum dosyasinda
    # bekler, boylece arada kesilse de sonraki calismada temizlenir.
    if a.eski_sil:
        bekleyen = set(durum.get("eski_sildi", []))
        if eskiler:
            print(f"\n{a.eski_sil} gunden eski dosyalar siliniyor "
                  f"({len(eskiler)})...")
            yollar = [d["yol"] for d in eskiler]

            # ÖNCE YEDEK: silme geri alınamaz. İndirilemeyen dosya
            # silinmiyor — yedeksiz silmek tek yönlü kapı olurdu.
            if not a.yedeksiz:
                print("  yedekleniyor...")
                yedekli = []
                for yol in yollar:
                    kod, veri = depo.indir(yol)
                    if kod != 200 or not isinstance(veri, bytes):
                        print(f"  ATLANDI indirilemedi ({kod}) {yol}")
                        continue
                    hedef = yedek_kok / yol
                    hedef.parent.mkdir(parents=True, exist_ok=True)
                    hedef.write_bytes(veri)
                    yedekli.append(yol)
                yollar = yedekli
                print(f"  {len(yollar)} dosya {yedek_kok}/ altina yedeklendi")

            for i in range(0, len(yollar), 100):
                obek = yollar[i:i + 100]
                kod, govde = depo.sil(obek)
                if kod not in (200, 204):
                    print(f"  HATA {kod}: {govde[:160]}")
                    break
                bekleyen.update(obek)
                durum["eski_sildi"] = sorted(bekleyen)
                durum_yaz(durum)
                print(f"  {min(i + 100, len(yollar))}/{len(yollar)}")

        if bekleyen:
            print("Kayitlardaki baglantilar temizleniyor...")
            hata = 0
            for tablo, kolonlar in REFERANSLI_TABLOLAR:
                n, h = referansi_temizle(depo, tablo, kolonlar, bekleyen)
                hata += h
                print(f"  {tablo}: {n} kayit guncellendi"
                      + (f", {h} HATA" if h else ""))
            if hata:
                # Yollar durum dosyasinda kaliyor: temizlenmeyen baglanti
                # arayuzde olmayan fotografi gostermeye calisir. Ayni
                # komut tekrar calistirilinca kalan kayitlar denenecek.
                print(f"\n{hata} kayit temizlenemedi. Yollar durum "
                      f"dosyasinda bekliyor; komutu tekrar calistirin.")
            else:
                durum["eski_sildi"] = []    # temizlendi, bir daha gerekmez
                durum_yaz(durum)

    # ── Kucult ──
    if not a.sadece_sahipsiz and kucultulecek:
        kalan = [d for d in kucultulecek if d["yol"] not in durum["kuculttu"]]
        print(f"\nFotograflar kucultuluyor ({len(kalan)})...")
        once = sonra = 0
        atlanan = 0
        for i, d in enumerate(kalan, 1):
            yol = d["yol"]
            kod, veri = depo.indir(yol)
            if kod != 200 or not isinstance(veri, bytes):
                print(f"  [{i}/{len(kalan)}] ATLANDI indirilemedi ({kod}) {yol}")
                atlanan += 1
                continue

            yeni, bilgi = kucult(veri, a.en_buyuk, a.kalite)
            if yeni is None:
                print(f"  [{i}/{len(kalan)}] ATLANDI {bilgi} {yol}")
                atlanan += 1
                durum["kuculttu"].append(yol)   # tekrar denemeye gerek yok
                durum_yaz(durum)
                continue

            # ÖNCE YEDEK: ustune yazmak geri alinamaz.
            if not a.yedeksiz:
                hedef = yedek_kok / yol
                hedef.parent.mkdir(parents=True, exist_ok=True)
                hedef.write_bytes(veri)

            kod, govde = depo.yukle(yol, yeni, "image/jpeg")
            if kod not in (200, 201):
                print(f"  [{i}/{len(kalan)}] HATA yuklenemedi ({kod}) {yol}: {govde[:120]}")
                atlanan += 1
                continue

            once += len(veri)
            sonra += len(yeni)
            durum["kuculttu"].append(yol)
            durum_yaz(durum)
            if i % 10 == 0 or i == len(kalan):
                print(f"  [{i}/{len(kalan)}] {mb(once)} -> {mb(sonra)}")

        print(f"\nKucultme bitti: {mb(once)} -> {mb(sonra)}"
              f"  (kazanc {mb(once - sonra)}, atlanan {atlanan})")

    print("\nBitti. Kullanimin dusmesi panelde birkac dakika surebilir.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
