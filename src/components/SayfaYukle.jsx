import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import {
  sayfaYolu, dosyaGecerli, cevapAnahtariniCoz, sayfaSorulari, cakisanNumaralar,
} from "../lib/soruSayfasi";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Bir sayfa fotoğrafını konuyla eşleştirip yükleme paneli.
//
// Koçun girdiği şey soru METNİ değil: fotoğraf, ilk soru numarası ve
// cevap anahtarı. Gerisini numaralar söylüyor — anahtarın uzunluğu kaç
// soru olduğunu da veriyor.
//
// ── ANAHTAR YÜKLEMEDEN ÖNCE GÖSTERİLİYOR ────────────────────────
// Aşağıdaki "11:A 12:C ..." ızgarası süs değil. Bu akıştaki en olası
// hata, anahtarın bir kayması (sayfa 10'dan başlıyor sanıp 11 yazmak):
// o zaman bütün sayfa yanlış puanlanır ve kimse farkı göremez, çünkü
// doğru cevaplar öğrenciye hiç gösterilmiyor. Eşleşmeyi yüklemeden
// önce göstermek, kaymayı gözle yakalanabilir kılıyor.
export default function SayfaYukle({ banka, bolumler, varOlan, color: c, onKapat, onYuklendi }) {
  const [dosya, setDosya]       = useState(null);
  const [onizleme, setOnizleme] = useState(null);
  const [ilkNumara, setIlkNumara] = useState((varOlan.at(-1)?.numara ?? 0) + 1);
  const [sikSayisi, setSikSayisi] = useState(5);
  const [bolumId, setBolumId]     = useState("");
  const [konu, setKonu]           = useState("");
  const [anahtar, setAnahtar]     = useState("");
  const [islemde, setIslemde]     = useState(false);
  const [hata, setHata]           = useState(null);

  // Önizleme adresi tarayıcı belleğinde tutuluyor; dosya değişince
  // eskisi bırakılmazsa pencere kapanana kadar bellekte kalıyor.
  const dosyaSec = (yeni) => {
    setOnizleme(yeni ? URL.createObjectURL(yeni) : null);
    setDosya(yeni);
    setHata(null);
  };
  // Adres, başkasıyla değiştirildiğinde ve panel kapanırken bırakılıyor.
  useEffect(() => () => { if (onizleme) URL.revokeObjectURL(onizleme); }, [onizleme]);

  const { harfler, hata: anahtarHatasi } = useMemo(
    () => cevapAnahtariniCoz(anahtar, sikSayisi), [anahtar, sikSayisi]);

  const numaralar = harfler.map((_, i) => ilkNumara + i);
  const cakisan   = cakisanNumaralar(varOlan, numaralar);

  const dosyaHatasi = dosya ? dosyaGecerli(dosya) : null;
  const engel =
    !dosya                   ? "Sayfa fotoğrafı seçin."
    : dosyaHatasi            ? dosyaHatasi
    : !anahtar.trim()        ? "Cevap anahtarını girin."
    : anahtarHatasi          ? anahtarHatasi
    : cakisan.length > 0     ? `Bu kitapta ${cakisan.slice(0, 6).join(", ")} numaralı soru${cakisan.length > 6 ? " (ve dahası)" : ""} zaten var.`
    : numaralar.at(-1) > 1000 ? "Soru numarası 1000'i geçemiyor."
    : null;

  const yukle = async () => {
    if (engel) return;
    setIslemde(true);
    setHata(null);
    const yol = sayfaYolu(banka.id, dosya.name);

    const { error: depoHatasi } = await supabase.storage
      .from("homework").upload(yol, dosya, { upsert: false, contentType: dosya.type });
    if (depoHatasi) {
      console.error("[Soru sayfasi yukleme]", depoHatasi);
      setHata("Fotoğraf yüklenemedi: " + depoHatasi.message);
      setIslemde(false);
      return;
    }

    const { hata: satirHatasi } = await calistir(
      supabase.from("sorular").insert(sayfaSorulari({
        bankaId: banka.id, bolumId, konu: konu.trim(), gorselYolu: yol,
        ilkNumara, harfler, sikSayisi,
      })),
      "Sayfa sorulari"
    );

    if (satirHatasi) {
      // Satırlar yazılamadıysa fotoğraf da geri alınıyor: yoksa depoda
      // hiçbir soruya bağlı olmayan, kimsenin bir daha göremeyeceği bir
      // dosya kalırdı.
      await supabase.storage.from("homework").remove([yol]);
      setHata("Sorular kaydedilemedi, fotoğraf geri alındı.");
      setIslemde(false);
      return;
    }

    setIslemde(false);
    onYuklendi?.();
  };

  const girdi = {
    width: "100%", padding: "8px 10px", borderRadius: KOSE.s, boxSizing: "border-box",
    border: `1.5px solid ${RENK.cizgi}`, fontSize: YAZI.ikincil, fontFamily: "inherit",
  };
  const etiket = { fontSize: YAZI.mikro, color: RENK.metinIkincil };

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: BOSLUK.s,
      padding: BOSLUK.m, borderRadius: KOSE.m, border: `1.5px solid ${c.mid}`,
      marginBottom: BOSLUK.m,
    }}>
      <div style={{ fontSize: YAZI.ikincil, fontWeight: 700, color: RENK.metin }}>
        Sayfa fotoğrafı yükle
      </div>
      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
        Soru metinleri girilmiyor; öğrenci soruyu ve şıkları fotoğraftan
        okuyup yalnız harfi işaretliyor.
      </div>

      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ ...girdi, padding: 7 }}
        onChange={e => dosyaSec(e.target.files?.[0] ?? null)} />

      {onizleme && (
        <img src={onizleme} alt="" style={{
          maxWidth: "100%", maxHeight: 220, objectFit: "contain",
          borderRadius: KOSE.s, border: `1px solid ${RENK.cizgi}`, display: "block",
        }} />
      )}

      <div style={{ display: "flex", gap: BOSLUK.s }}>
        <label style={{ ...etiket, width: 92 }}>
          <div style={{ marginBottom: 3 }}>İlk soru no</div>
          <input type="number" min={1} max={1000} value={ilkNumara} style={girdi}
            onChange={e => setIlkNumara(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label style={{ ...etiket, width: 88 }}>
          <div style={{ marginBottom: 3 }}>Şık sayısı</div>
          <select value={sikSayisi} style={girdi}
            onChange={e => setSikSayisi(Number(e.target.value))}>
            {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label style={{ ...etiket, flex: 1 }}>
          <div style={{ marginBottom: 3 }}>Bölüm</div>
          <select value={bolumId} style={girdi} onChange={e => setBolumId(e.target.value)}>
            <option value="">—</option>
            {bolumler.map(b => <option key={b.id} value={b.id}>{b.baslik}</option>)}
          </select>
        </label>
      </div>

      <label style={etiket}>
        <div style={{ marginBottom: 3 }}>Konu (isteğe bağlı)</div>
        <input placeholder="Örn. Üslü Sayılar" value={konu} style={girdi}
          onChange={e => setKonu(e.target.value)} />
      </label>

      <label style={etiket}>
        <div style={{ marginBottom: 3 }}>Cevap anahtarı — sayfadaki soruların sırasıyla</div>
        <textarea rows={2} placeholder="ACBDE EABCD" value={anahtar}
          style={{ ...girdi, resize: "vertical", letterSpacing: 1.5, fontWeight: 600 }}
          onChange={e => setAnahtar(e.target.value)} />
      </label>
      <div style={{ fontSize: YAZI.mikro, color: RENK.metinSilik, lineHeight: 1.5 }}>
        Boşluk ve virgül serbest. İptal edilmiş soru için <b>0</b> yazın.
        Kaç harf girerseniz o kadar soru oluşuyor.
      </div>

      {harfler.length > 0 && !anahtarHatasi && (
        <div>
          <div style={{ ...etiket, marginBottom: 4 }}>
            {harfler.length} soru · {numaralar[0]}–{numaralar.at(-1)}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {harfler.map((h, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "3px 6px", borderRadius: KOSE.s,
                background: cakisan.includes(numaralar[i]) ? RENK.hata.zemin : RENK.yuzey,
                color: cakisan.includes(numaralar[i]) ? RENK.hata.metin : RENK.metinIkincil,
              }}>{numaralar[i]}:<b>{h}</b></span>
            ))}
          </div>
        </div>
      )}

      {(engel || hata) && (
        <div style={{
          background: hata ? RENK.hata.zemin : RENK.uyari.zemin,
          color: hata ? RENK.hata.metin : RENK.uyari.metin,
          fontSize: 11.5, padding: "8px 10px", borderRadius: KOSE.s, lineHeight: 1.5,
        }}>{hata ?? engel}</div>
      )}

      <div style={{ display: "flex", gap: BOSLUK.s }}>
        <button onClick={yukle} disabled={!!engel || islemde} style={{
          flex: 1, padding: "9px 0", borderRadius: KOSE.m, border: "none",
          background: engel ? "#ddd" : c.bg, color: "#fff",
          fontSize: YAZI.ikincil, fontWeight: 700, cursor: engel ? "default" : "pointer",
        }}>{islemde ? "Yükleniyor..." : `Sayfayı yükle${harfler.length && !engel ? ` (${harfler.length} soru)` : ""}`}</button>
        <button onClick={onKapat} style={{
          padding: "9px 14px", borderRadius: KOSE.m, cursor: "pointer",
          border: `1.5px solid ${RENK.cizgi}`, background: "#fff",
          fontSize: YAZI.ikincil, color: RENK.metinIkincil,
        }}>Vazgeç</button>
      </div>
    </div>
  );
}
