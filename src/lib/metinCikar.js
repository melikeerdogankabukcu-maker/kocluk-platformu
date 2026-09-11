// İçindekiler sayfasını metne çevirme: PDF ve fotoğraf (OCR).
//
// ── İKİSİ DE TARAYICIDA, DIŞARI VERİ GİTMİYOR ───────────────────
// Ne PDF ne de fotoğraf sunucuya yükleniyor; ikisi de kullanıcının
// tarayıcısında çözülüyor. Anahtar gerekmiyor, çağrı başına ücret
// oluşmuyor ve kitabın sayfası hiçbir üçüncü tarafa gitmiyor.
//
// ── KÜTÜPHANELER GEREKTİĞİNDE YÜKLENİYOR ────────────────────────
// tesseract.js ve pdfjs-dist birlikte megabaytlarca yer tutuyor. İkisi
// de dinamik import ile çağrılıyor: paneli açan herkes değil, yalnızca
// gerçekten PDF ya da fotoğraf aktaran indiriyor.
//
// ── OCR'IN SONUCU DOĞRU KABUL EDİLMİYOR ─────────────────────────
// Buradan çıkan metin doğrudan kaydedilmiyor; düzenlenebilir bir kutuya
// düşüyor. OCR "Bölünebilme"yi "Böluinebilme" okuyabilir ve bu, sessizce
// yanlış konuya bağlanmış bir bölüm demek olurdu.

// Aynı satırdaki parçaları birleştirmek için y koordinatı toleransı.
// PDF'te aynı satırın öğeleri birkaç ondalık kayabiliyor.
const SATIR_TOLERANS = 3;

// PDF'ten metin çıkarır. Metin katmanı olmayan (taranmış) PDF'lerde
// boş döner — çağıran bunu kullanıcıya söylüyor.
export async function pdfMetni(dosya, { enFazlaSayfa = 12 } = {}) {
  const pdfjs = await import("pdfjs-dist");
  // Worker'ı Vite'ın çözebileceği biçimde veriyoruz; ayarlanmazsa
  // pdf.js kendi CDN'ini arar ve çevrimdışı ortamda sessizce takılır.
  pdfjs.GlobalWorkerOptions.workerSrc =
    new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const belge = await pdfjs.getDocument({ data: await dosya.arrayBuffer() }).promise;
  const sayfaSayisi = Math.min(belge.numPages, enFazlaSayfa);
  const parcalar = [];

  for (let i = 1; i <= sayfaSayisi; i++) {
    const sayfa = await belge.getPage(i);
    const icerik = await sayfa.getTextContent();

    // ── SATIRLARI GERİ KURMAK ŞART ────────────────────────────
    // pdf.js metni konumlandırılmış parçalar hâlinde veriyor, satır
    // kavramı yok. Ayrıştırıcı satır bazlı çalıştığı için parçaları
    // y koordinatına göre grupluyoruz; yoksa bütün içindekiler tek
    // bir devasa satır olurdu ve hiçbir başlık çıkmazdı.
    const satirlar = new Map();
    for (const oge of icerik.items) {
      const metin = (oge.str ?? "").trim();
      if (!metin) continue;
      const y = Math.round((oge.transform?.[5] ?? 0) / SATIR_TOLERANS);
      const x = oge.transform?.[4] ?? 0;
      if (!satirlar.has(y)) satirlar.set(y, []);
      satirlar.get(y).push({ x, metin });
    }

    // y azalan = yukarıdan aşağı (PDF'te origin sol ALT köşe)
    [...satirlar.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, parcalarSatir]) => {
        parcalarSatir.sort((a, b) => a.x - b.x);
        parcalar.push(parcalarSatir.map(p => p.metin).join(" "));
      });
  }

  await belge.destroy?.();
  return { metin: parcalar.join("\n"), sayfaSayisi, toplamSayfa: belge.numPages };
}

// ── GÖRSEL ÖN İŞLEME ────────────────────────────────────────────
// Ham telefon fotoğrafı doğrudan OCR'a verildiğinde sonuç vasat
// çıkıyordu. İki nedeni var ve ikisi de düzeltilebilir:
//
// 1) ÇÖZÜNÜRLÜK. Tesseract ~300 DPI için ayarlı. İçindekiler sayfasının
//    uzaktan çekilmiş fotoğrafında harfler 10-12 piksel yüksekliğinde
//    kalıyor; bu boyutta "ı/i", "rn/m", "5/S" ayırt edilemiyor. Görsel
//    büyütülüyor.
//
// 2) AYDINLATMA. Sayfanın bir yanına gölge düşüyor. Tesseract kendi
//    içinde TEK bir eşik değeriyle siyah-beyaza indiriyor; gölgeli
//    yarıda bütün metin siyaha, aydınlık yarıda bir kısmı beyaza
//    gidiyor. Burada YEREL eşikleme yapılıyor: her pikselin eşiği
//    kendi çevresinin ortalamasından hesaplanıyor, böylece gölge
//    sınırın kendisi kayıyor ve iki yarı da okunabilir kalıyor.
//    (Bradley–Roth yöntemi; integral görüntüyle tek geçişte.)
const HEDEF_GENISLIK = 1800;

// ── EĞİKLİK (SKEW) ──────────────────────────────────────────────
// Elde tutulan telefonla çekilen sayfa hep birkaç derece eğik oluyor.
// Tesseract satırları yatay varsayıyor; 2–3 derecelik bir eğiklikte bile
// sayfanın sağ ucundaki numara, solundaki başlığın satırından taşıyor ve
// ikisi farklı satır sayılıyor. İçindekiler sayfasında bu ölümcül:
// başlık numarasız, numara başlıksız kalıyor, satır tamamen kayboluyor.
//
// Açı, YATAY İZDÜŞÜM PROFİLİNDEN bulunuyor: görüntü doğru açıyla
// düzeltildiğinde metin satırları üst üste biner, satır aralarındaki
// boşluklar boşalır ve satır başına düşen koyu piksel sayısının
// değişkenliği EN YÜKSEK olur. Eğikken her satır birkaç satıra yayılır
// ve profil düzleşir. Denenen açılar arasında değişkenliği en büyük
// olan doğru açıdır.
const ACI_TARAMA = 6;        // ±6 derece
const ACI_ADIM   = 0.4;

function egiklikBul(ikili, g, y) {
  // Tarama küçültülmüş kopyada: tam çözünürlükte her açı için tüm
  // pikselleri gezmek saniyeler alırdı, oysa açı için kabaca bir
  // görüntü yeterli.
  const olcek = Math.min(1, 900 / g);
  const kg = Math.max(1, Math.round(g * olcek));
  const ky = Math.max(1, Math.round(y * olcek));
  const kucuk = new Uint8Array(kg * ky);
  for (let j = 0; j < ky; j++) {
    const kaynakJ = Math.min(y - 1, Math.round(j / olcek));
    for (let i = 0; i < kg; i++) {
      const kaynakI = Math.min(g - 1, Math.round(i / olcek));
      kucuk[j * kg + i] = ikili[kaynakJ * g + kaynakI];
    }
  }

  let enIyiAci = 0, enIyiPuan = -1;
  const profil = new Float64Array(ky);

  for (let aci = -ACI_TARAMA; aci <= ACI_TARAMA; aci += ACI_ADIM) {
    profil.fill(0);
    const tan = Math.tan((aci * Math.PI) / 180);
    for (let i = 0; i < kg; i++) {
      // Döndürmek yerine kaydırma (shear): küçük açılarda ikisi aynı
      // sonucu veriyor ve kaydırma tek toplama işlemi.
      const kaydir = Math.round((i - kg / 2) * tan);
      for (let j = 0; j < ky; j++) {
        const hedef = j + kaydir;
        if (hedef < 0 || hedef >= ky) continue;
        profil[hedef] += kucuk[j * kg + i];
      }
    }
    // Komşu satırlar arasındaki farkın karesi: keskin satır/boşluk
    // geçişi yüksek puan verir.
    let puan = 0;
    for (let j = 1; j < ky; j++) {
      const d = profil[j] - profil[j - 1];
      puan += d * d;
    }
    if (puan > enIyiPuan) { enIyiPuan = puan; enIyiAci = aci; }
  }

  return enIyiAci;
}

// ── NOKTA DOLGUSUNU SİL ─────────────────────────────────────────
// İçindekiler sayfasındaki "......." dolgusu OCR'ın en büyük düşmanı.
// Tesseract bu noktaları nokta olarak görmüyor, HARFE çeviriyor; üstelik
// ürettiği harf yığını sayfa numarasının bağlamını da bozuyor ve
// numaranın kendisi harfe dönüyor ("25" → "ZD", "35" → "ASD").
//
// Gerçek bir kitap sayfasıyla ölçüldü: dolgu silinmeden okuma güveni
// %25 ve altı satırın altısı da bozuk; silindikten sonra güven %95 ve
// altı satırın altısı da başlığıyla, numarasıyla eksiksiz.
//
// ── YALNIZCA DİZİ HALİNDEKİLER SİLİNİYOR ────────────────────────
// Bir noktayı "dolgu" yapan şey küçük olması değil, YAN YANA DİZİLMESİ.
// Tek başına duran küçük işaretlere dokunulmuyor; bu sayede "02."
// içindeki nokta, "Kütle - Hacim" ile "Madde Özellikleri - Karma"
// içindeki tireler ve "Adesyon, Kohezyon," virgülleri yerinde kalıyor.
// Türkçenin noktalı harfleri de güvende: "i" harfinin noktası, gövdesi
// aynı sütunlarda olduğu için tek bir yüksek kutu sayılıyor, küçük
// kare bir leke değil.
const DIZI_ESIGI = 4;          // en az bu kadar ardışık nokta
const NOKTA_ORANI = 0.38;      // satır yüksekliğine göre en büyük nokta

function noktaDolgusunuSil(ikili, g, y) {
  // 1) Satır bantları — yatay izdüşümde mürekkepli aralıklar
  const bantlar = [];
  let bas = -1;
  for (let j = 0; j <= y; j++) {
    let dolu = false;
    if (j < y) {
      let s = 0;
      for (let i = 0; i < g; i++) { s += ikili[j * g + i]; if (s > g * 0.002) { dolu = true; break; } }
    }
    if (dolu && bas < 0) bas = j;
    if (!dolu && bas >= 0) { if (j - bas >= 6) bantlar.push([bas, j - 1]); bas = -1; }
  }

  let silinen = 0;
  for (const [b0, b1] of bantlar) {
    const esik = (b1 - b0 + 1) * NOKTA_ORANI;

    // 2) Bant içindeki sütun koşuları (ardışık mürekkepli sütunlar)
    const kosular = [];
    let k0 = -1;
    for (let i = 0; i <= g; i++) {
      let dolu = false;
      if (i < g) for (let j = b0; j <= b1; j++) if (ikili[j * g + i]) { dolu = true; break; }
      if (dolu && k0 < 0) k0 = i;
      if (!dolu && k0 >= 0) { kosular.push([k0, i - 1]); k0 = -1; }
    }

    // 3) Küçük ve kareye yakın koşular nokta adayı
    const adaylar = kosular.map(([x0, x1]) => {
      let y0 = b1, y1 = b0;
      for (let i = x0; i <= x1; i++)
        for (let j = b0; j <= b1; j++)
          if (ikili[j * g + i]) { if (j < y0) y0 = j; if (j > y1) y1 = j; }
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const oran = w / h;
      return { x0, x1, y0, y1, nokta: w <= esik && h <= esik && oran >= 0.45 && oran <= 2.2 };
    });

    // 4) Ardışık dizileri sil
    let i = 0;
    while (i < adaylar.length) {
      if (!adaylar[i].nokta) { i++; continue; }
      let son = i;
      while (son + 1 < adaylar.length && adaylar[son + 1].nokta) son++;
      if (son - i + 1 >= DIZI_ESIGI) {
        for (let k = i; k <= son; k++) {
          const a = adaylar[k];
          for (let x = a.x0; x <= a.x1; x++)
            for (let j = a.y0; j <= a.y1; j++) ikili[j * g + x] = 0;
          silinen++;
        }
      }
      i = son + 1;
    }
  }
  return silinen;
}

async function gorseliHazirla(dosya) {
  // Tarayıcı API'leri: bu yol yalnızca istemcide çalışıyor.
  const bitmap = await createImageBitmap(dosya);

  // En fazla 3 kat: daha fazlası ayrıntı katmıyor, yalnızca OCR'ı
  // yavaşlatıyor ve belleği şişiriyor.
  const olcek = Math.max(1, Math.min(3, HEDEF_GENISLIK / bitmap.width));
  const g = Math.round(bitmap.width * olcek);
  const y = Math.round(bitmap.height * olcek);

  const tuval = document.createElement("canvas");
  tuval.width = g; tuval.height = y;
  const ctx = tuval.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, g, y);
  bitmap.close?.();

  const gorsel = ctx.getImageData(0, 0, g, y);
  const p = gorsel.data;

  // Gri tonlama + integral görüntü (her noktada sol-üst dikdörtgenin
  // toplamı). Integral sayesinde pencere ortalaması pencere boyutundan
  // bağımsız, sabit maliyetle bulunuyor.
  const gri = new Uint8Array(g * y);
  const integral = new Float64Array((g + 1) * (y + 1));
  for (let j = 0; j < y; j++) {
    let satirToplam = 0;
    for (let i = 0; i < g; i++) {
      const k = (j * g + i) * 4;
      const v = (p[k] * 0.299 + p[k + 1] * 0.587 + p[k + 2] * 0.114) | 0;
      gri[j * g + i] = v;
      satirToplam += v;
      integral[(j + 1) * (g + 1) + (i + 1)] = integral[j * (g + 1) + (i + 1)] + satirToplam;
    }
  }

  // Pencere genişliğin ~1/16'sı; metin satırından belirgin biçimde
  // büyük olmalı ki harfin kendi karanlığı eşiği aşağı çekmesin.
  const yari = Math.max(8, Math.round(g / 32));
  const T = 0.15;                       // ortalamanın %15 altı → siyah

  const ikili = new Uint8Array(g * y);      // 1 = koyu (metin)
  for (let j = 0; j < y; j++) {
    const j1 = Math.max(j - yari, 0), j2 = Math.min(j + yari, y - 1);
    for (let i = 0; i < g; i++) {
      const i1 = Math.max(i - yari, 0), i2 = Math.min(i + yari, g - 1);
      const alan = (i2 - i1 + 1) * (j2 - j1 + 1);
      const toplam =
        integral[(j2 + 1) * (g + 1) + (i2 + 1)]
        - integral[j1 * (g + 1) + (i2 + 1)]
        - integral[(j2 + 1) * (g + 1) + i1]
        + integral[j1 * (g + 1) + i1];
      ikili[j * g + i] = gri[j * g + i] * alan < toplam * (1 - T) ? 1 : 0;
    }
  }

  // Eğiklik AÇISI nokta silmeden ÖNCE ölçülüyor: nokta dolguları tam
  // satır çizgisi üzerinde duruyor ve izdüşüm profilini güçlendiriyor.
  const aci = egiklikBul(ikili, g, y);

  // Nokta dolgusunu sil, sonra pikselleri yaz.
  noktaDolgusunuSil(ikili, g, y);

  for (let n = 0; n < g * y; n++) {
    const k = n * 4, v = ikili[n] ? 0 : 255;
    p[k] = p[k + 1] = p[k + 2] = v;
    p[k + 3] = 255;
  }
  ctx.putImageData(gorsel, 0, 0);

  // Eğiklik düzeltme. Küçük açılarda dokunmuyoruz: yeniden örnekleme
  // harfleri hafifçe bulandırıyor ve 0.5 derece altı zaten OCR'ı
  // etkilemiyor — kazancı olmayan bir bozulma olurdu.
  if (Math.abs(aci) < 0.5) {
    return new Promise(cozumle => tuval.toBlob(cozumle, "image/png"));
  }

  const dondurulmus = document.createElement("canvas");
  dondurulmus.width = g; dondurulmus.height = y;
  const dctx = dondurulmus.getContext("2d");
  // Zemin BEYAZ: döndürünce köşelerde açıkta kalan alan saydam kalırsa
  // OCR onu siyah görüp sayfanın kenarına sahte karakterler uyduruyor.
  dctx.fillStyle = "#fff";
  dctx.fillRect(0, 0, g, y);
  dctx.translate(g / 2, y / 2);
  // İŞARET: egiklikBul zaten DÜZELTME açısını döndürüyor (sayfa +2°
  // eğikse -2° veriyor), olduğu gibi uygulanıyor. Bir kez daha
  // negatiflemek eğikliği düzeltmek yerine ikiye katlardı — sınamada
  // yakalandı, arayüzden "hâlâ kötü"den başka bir belirti vermezdi.
  dctx.rotate((aci * Math.PI) / 180);
  dctx.drawImage(tuval, -g / 2, -y / 2);

  return new Promise(cozumle => dondurulmus.toBlob(cozumle, "image/png"));
}

// Fotoğraftan OCR ile metin çıkarır.
//
// Dil verisi (Türkçe) ilk kullanımda indiriliyor ve tarayıcı önbelleğine
// alınıyor; ilerleme geri bildirimi bu yüzden önemli — indirme sessiz
// geçerse kullanıcı uygulamayı donmuş sanır.
//
// BİRDEN FAZLA GÖRSEL TEK WORKER'DA: içindekiler çoğu kitapta iki üç
// sayfa. Her görsel için ayrı worker açmak, dil verisinin yeniden
// yüklenmesi ve her seferinde birkaç saniye demekti.
// ── SAYFA BÖLÜTLEME KİPİ TEK BAŞINA YETMİYOR ────────────────────
// İçindekiler sayfasında başlık solda, sayfa numarası çok sağda ve
// aralarında geniş bir boşluk var. Tesseract bunu kimi kitapta İKİ
// SÜTUN sanıyor; o zaman numaralar başlıklarından kopuyor ve satır
// tamamen kayboluyor. Hangi kipin doğru olduğu kitaptan kitaba
// değişiyor ve önceden bilinemiyor.
//
// Çözüm tahmin etmek değil ÖLÇMEK: birinci kip az satır verdiyse
// ikincisi deneniyor ve AYRIŞTIRILABİLİR SATIR SAYISI yüksek olan
// seçiliyor. Ölçüt çağıran taraftan geliyor (degerlendir), böylece bu
// dosya ayrıştırıcıyı tanımak zorunda kalmıyor.
const KIP_BIRINCIL = "6";    // tek düzgün metin bloğu
const KIP_YEDEK    = "4";    // değişken boyutlu tek sütun
const YETERLI_SATIR = 4;

export async function fotografMetni(dosyalar, { ilerleme, degerlendir } = {}) {
  const liste = Array.isArray(dosyalar) ? dosyalar : [dosyalar];
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("tur", 1, {
    logger: (m) => {
      if (!ilerleme) return;
      const yuzde = typeof m.progress === "number" ? Math.round(m.progress * 100) : null;
      ilerleme({ asama: m.status, yuzde });
    },
  });

  try {
    // Başlık ile sayfa numarası arasındaki boşluk korunsun. Silinirse
    // "Temel Kavramlar7" gibi birleşik bir satır çıkıyor ve numara
    // ayrıştırılamıyor.
    await worker.setParameters({ preserve_interword_spaces: "1" });

    const parcalar = [];
    let guvenToplam = 0, guvenSayi = 0;

    const oku = async (girdi, kip) => {
      await worker.setParameters({ tessedit_pageseg_mode: kip });
      const { data } = await worker.recognize(girdi);
      const metin = data?.text ?? "";
      return { metin, guven: data?.confidence ?? null, puan: degerlendir ? degerlendir(metin) : null };
    };

    for (let i = 0; i < liste.length; i++) {
      ilerleme?.({ asama: "hazirlik", yuzde: null, sira: i + 1, toplam: liste.length });
      let girdi;
      try {
        girdi = await gorseliHazirla(liste[i]);
      } catch {
        // Ön işleme başarısızsa (bozuk görsel, eski tarayıcı) ham
        // dosyayla devam: vasat sonuç, hiç sonuç yoktan iyi.
        girdi = liste[i];
      }

      let sonuc = await oku(girdi, KIP_BIRINCIL);
      // İkinci kip yalnızca gerektiğinde: her görseli iki kez okumak
      // süreyi ikiye katlardı ve çoğu kitapta birincisi yeterli.
      if (degerlendir && sonuc.puan < YETERLI_SATIR) {
        ilerleme?.({ asama: "ikinci deneme", yuzde: null, sira: i + 1, toplam: liste.length });
        const yedek = await oku(girdi, KIP_YEDEK);
        if (yedek.puan > sonuc.puan) sonuc = yedek;
      }

      if (sonuc.metin) parcalar.push(sonuc.metin);
      if (typeof sonuc.guven === "number") { guvenToplam += sonuc.guven; guvenSayi += 1; }
    }

    return {
      metin: parcalar.join("\n"),
      guven: guvenSayi > 0 ? guvenToplam / guvenSayi : null,
      sayfa: liste.length,
    };
  } finally {
    // Worker kapatılmazsa arka planda WASM belleği tutuluyor; birkaç
    // aktarımdan sonra sekme belirgin biçimde ağırlaşıyor.
    await worker.terminate();
  }
}
