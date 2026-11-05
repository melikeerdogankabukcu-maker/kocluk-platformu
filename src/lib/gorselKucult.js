// Yüklemeden önce fotoğrafı küçültme.
//
// ── NEDEN ───────────────────────────────────────────────────────
// Öğrenciler "dosya yüklerken donuyor" dedi. Sebep donma değil,
// SÜRE: telefon kamerası 3-8 MB'lık dosya üretiyor, dosyalar olduğu
// gibi ve sırayla yükleniyordu. Zayıf mobil bağlantıda beş fotoğraf
// dakikalarca sürüyor ve ekranda hiçbir şey olmadığı için uygulama
// donmuş görünüyor.
//
// Ödev fotoğrafının 4000 piksel geniş olmasının kimseye faydası yok;
// okunabilmesi yetiyor. 1600 piksel uzun kenar + JPEG 0.8 tipik olarak
// 3-8 MB'ı 200-400 KB'a indiriyor — yani onda bir.
//
// ── KÜÇÜLTME ASLA ENGEL OLMUYOR ─────────────────────────────────
// Tuval işlemi başarısız olursa (bellek, bozuk dosya, desteklenmeyen
// biçim) ÖZGÜN dosya yükleniyor. Küçültme bir iyileştirme; yükleme
// yolunun üstüne yeni bir arıza kaynağı koymamalı.
//
// PDF ve küçük dosyalara dokunulmuyor.

export const EN_BUYUK_KENAR = 1600;
export const KALITE = 0.8;
// Bu boyutun altındaki dosya zaten hızlı gidiyor; yeniden
// kodlamak hem gereksiz hem de kaliteyi boşuna düşürür.
export const KUCULTME_ESIGI = 600 * 1024;

// Ölçek hesabı — SAF, sınanabilir.
// Uzun kenar hedefe indiriliyor, oran korunuyor. Zaten küçükse
// BÜYÜTÜLMÜYOR: büyütmek dosyayı şişirir, bilgi eklemez.
export function hedefOlcu(genislik, yukseklik, enBuyuk = EN_BUYUK_KENAR) {
  const g = Math.max(0, Math.round(genislik) || 0);
  const y = Math.max(0, Math.round(yukseklik) || 0);
  if (g === 0 || y === 0) return null;
  const uzun = Math.max(g, y);
  if (uzun <= enBuyuk) return { g, y, olcek: 1 };
  const olcek = enBuyuk / uzun;
  return {
    g: Math.max(1, Math.round(g * olcek)),
    y: Math.max(1, Math.round(y * olcek)),
    olcek,
  };
}

// Küçültmeye değer mi? — SAF.
export function kucultulmeli(dosya, esik = KUCULTME_ESIGI) {
  if (!dosya || typeof dosya.type !== "string") return false;
  // HEIC/HEIF tarayıcıda çizilemiyor; iOS zaten paylaşırken JPEG'e
  // çeviriyor, çevirmediyse özgün dosya gidiyor.
  if (!/^image\/(jpeg|png|webp)$/.test(dosya.type)) return false;
  return (dosya.size ?? 0) > esik;
}

// Dosyayı küçültür. Küçültülemezse ÖZGÜN dosyayı döndürür.
export async function gorseliKucult(dosya, {
  enBuyuk = EN_BUYUK_KENAR, kalite = KALITE, esik = KUCULTME_ESIGI,
} = {}) {
  if (!kucultulmeli(dosya, esik)) return dosya;

  try {
    const bitmap = await createImageBitmap(dosya);
    const olcu = hedefOlcu(bitmap.width, bitmap.height, enBuyuk);
    if (!olcu || olcu.olcek === 1) { bitmap.close?.(); return dosya; }

    const tuval = document.createElement("canvas");
    tuval.width = olcu.g;
    tuval.height = olcu.y;
    const ctx = tuval.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, olcu.g, olcu.y);
    bitmap.close?.();

    const blob = await new Promise(coz => tuval.toBlob(coz, "image/jpeg", kalite));
    if (!blob) return dosya;

    // Küçültme büyüttüyse (küçük ve çok sıkıştırılmış PNG'lerde olur)
    // özgün dosya kalıyor.
    if (blob.size >= (dosya.size ?? Infinity)) return dosya;

    // Ad uzantısı da değişiyor: içerik artık JPEG ve depo yolu
    // uzantıdan türetiliyor.
    const ad = String(dosya.name ?? "foto").replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], ad, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    console.error("[Gorsel kucultme]", err);
    return dosya;
  }
}

// Bir listeyi sırayla küçültür; her adımda `onIlerleme(bitti, toplam)`
// çağrılıyor ki ekran "2/5 hazırlanıyor" diyebilsin.
export async function listeyiKucult(dosyalar, onIlerleme, secenekler) {
  const sonuc = [];
  for (let i = 0; i < dosyalar.length; i++) {
    onIlerleme?.(i, dosyalar.length);
    sonuc.push(await gorseliKucult(dosyalar[i], secenekler));
  }
  onIlerleme?.(dosyalar.length, dosyalar.length);
  return sonuc;
}
