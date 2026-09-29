// İçindekiler fotoğrafının OCR öncesi hazırlanması — SAF piksel işleri.
//
// Bu dosya tarayıcı API'si kullanmıyor: girdi olarak ham RGBA aldığı için
// Node'da da çalışıyor. Bu, ölçüm yapabilmek için şart oldu — hangi
// eşiğin, hangi pencerenin gerçekten daha iyi okuduğu ancak gerçek kitap
// fotoğraflarıyla çalıştırılıp sayılarak anlaşılıyor. Tarayıcıya bağlı
// kalsaydı her deneme için elde uygulama açmak gerekirdi.
//
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

// Satır bantları — yatay izdüşümde mürekkepli aralıklar.
//
// ── ORTA ŞERİTTEN ÖLÇÜLÜYOR ─────────────────────────────────────
// Bant araması eskiden satırın TAMAMINA bakıyordu ve gerçek
// fotoğraflarda hiç çalışmıyordu: karenin solundaki koyu çerçeve
// (tablet kasası, masa, cilt gölgesi) HER satıra mürekkep koyduğu için
// sayfanın tamamı tek bant çıkıyordu — beş kitap fotoğrafından
// dördünde silinen nokta sayısı sıfırdı, yani dolgu temizleme ölü koddu.
//
// Bant araması artık sayfanın ORTA %60'ında yapılıyor: çerçeve kenarda,
// metin ortada. Nokta silmenin kendisi yine tüm genişlikte çalışıyor,
// yalnızca satırın NEREDE olduğu ortadan ölçülüyor.
//
// Eşik de orantılı: dar şeritte "mürekkepli" demek için birkaç piksel
// yeterli ama gürültüye takılmamak için en az 4 piksel isteniyor.
function satirBantlari(ikili, g, y) {
  const i0 = Math.round(g * 0.2), i1 = Math.round(g * 0.8);
  const esik = Math.max(4, Math.round((i1 - i0) * 0.004));
  const bantlar = [];
  let bas = -1;
  for (let j = 0; j <= y; j++) {
    let dolu = false;
    if (j < y) {
      let s = 0;
      for (let i = i0; i < i1; i++) { s += ikili[j * g + i]; if (s >= esik) { dolu = true; break; } }
    }
    if (dolu && bas < 0) bas = j;
    if (!dolu && bas >= 0) { if (j - bas >= 6) bantlar.push([bas, j - 1]); bas = -1; }
  }
  return bantlar;
}

// ── DENENDİ VE ELENDİ: DOLGUYU NOKTA OLARAK ÇİZMEK ──────────────
// Düşünce şuydu: dolguyu silmek yerine yerine DÜZGÜN, eşit aralıklı
// noktalar çizelim; OCR onları nokta okusun, satırın geometrisi de
// korunsun (silince kalan koca boşluk, iki sütunlu sayfada sütun
// ayıracına benziyor).
//
// GERÇEK FOTOĞRAFLARLA ÖLÇÜLDÜ ve hipotez çürüdü. İki kitap sayfası,
// 98 satır, "başlık + sayfa numarası birlikte doğru" ölçütü:
//   silme                         → %83
//   nokta çizme (boy 0.10, adım 4)→ %42
//   nokta çizme (boy 0.06, adım 6)→ %43
//   nokta çizme (boy 0.08, adım 8)→ %37
// Sayıların ucuna yapışan noktaları kırpmak da kurtarmadı (%43).
//
// Sebebi: sayfa numarası artık boşluktan değil, sağa dayalı NUMARA
// ŞERİTLERİNDEN bulunuyor (bkz. ocrSatir.js). Dolgu kalınca numaralar
// "temiz sayı" olmaktan çıkıyor, şerit kurulamıyor ve sütunlar
// çöküyor. Yani çizmenin korumaya çalıştığı bilgi zaten kullanılmıyor,
// bozduğu bilgi ise kritik.
//
// Kod duruyor ama VARSAYILAN DEĞİL: aynı fikri yeniden denemek
// isteyen, ölçümü tekrarlamadan açmasın.
function noktalariCiz(ikili, g, dizi, b0, b1) {
  const yukseklik = b1 - b0 + 1;
  const boy = Math.max(2, Math.round(yukseklik * 0.10));   // nokta kenarı
  const adim = boy * 4;                                     // noktalar arası
  const x0 = dizi[0].x0;
  const x1 = dizi[dizi.length - 1].x1;

  // Taban çizgisi: özgün noktaların ortalarının ortancası. Dolgu
  // genellikle harflerin alt hizasında duruyor; ortalama yerine
  // ortanca, tek bir kaçak lekeden etkilenmiyor.
  const ortalar = dizi.map(a => Math.round((a.y0 + a.y1) / 2)).sort((m, n) => m - n);
  const taban = ortalar[Math.floor(ortalar.length / 2)];

  for (let x = x0; x + boy <= x1; x += adim) {
    for (let dx = 0; dx < boy; dx++) {
      for (let dy = 0; dy < boy; dy++) {
        const jj = taban + dy - Math.floor(boy / 2);
        if (jj >= b0 && jj <= b1) ikili[jj * g + x + dx] = 1;
      }
    }
  }
}

function noktaDolgusunuSil(ikili, g, y, kip = "sil") {
  const bantlar = satirBantlari(ikili, g, y);

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

    // 4) Ardışık dizileri temizle: ya sil ya da düzgün noktalarla yeniden çiz
    let i = 0;
    while (i < adaylar.length) {
      if (!adaylar[i].nokta) { i++; continue; }
      let son = i;
      while (son + 1 < adaylar.length && adaylar[son + 1].nokta) son++;
      if (son - i + 1 >= DIZI_ESIGI) {
        const dizi = adaylar.slice(i, son + 1);
        // Önce özgün lekeleri temizle
        dizi.forEach(a => {
          for (let x = a.x0; x <= a.x1; x++)
            for (let j = a.y0; j <= a.y1; j++) ikili[j * g + x] = 0;
          silinen++;
        });
        if (kip === "isaretle") noktalariCiz(ikili, g, dizi, b0, b1);
      }
      i = son + 1;
    }
  }
  return silinen;
}


// ── SAYFAYI BUL, ÖNCE ONU KIRP ──────────────────────────────────
// Telefonla çekilen fotoğrafta sayfa çerçevenin tamamını doldurmuyor:
// masa, ekran kenarı, klavye, gölge de karede. Bunlar iki şeyi bozuyor
// ve ikisi de sessiz:
//
// 1) SATIR BANTLARI. Nokta dolgusu silme, satırları yatay izdüşümdeki
//    "mürekkepli aralıklar"dan buluyor. Karenin kenarındaki koyu masa
//    HER satıra mürekkep koyduğu için sayfanın tamamı TEK bant çıkıyor
//    ve nokta silme hiç çalışmıyor. Gerçek beş fotoğrafla ölçüldü:
//    kırpmadan önce silinen nokta sayısı 4 fotoğrafta 0.
//
// 2) YEREL EŞİK. Bradley penceresi sayfa kenarında yarı masa yarı kâğıt
//    görüyor; ortalama düşüyor, kâğıdın kenarındaki gerçek metin beyaza
//    kaçıyor.
//
// Bu yüzden ilk iş sayfayı sınırlamak: kare kabaca bloklara bölünüp
// PARLAK bölge bulunuyor, en büyük bağlantılı parlak küme sayfa kabul
// ediliyor ve işlem onun sınırları içinde yapılıyor.
const BLOK = 24;              // örnekleme bloğu (piksel)
const EN_AZ_ALAN = 0.15;      // bundan küçük bir "sayfa" güvenilmez
const EN_COK_ALAN = 0.985;    // neredeyse tüm kare: kırpacak bir şey yok
const KENAR_PAYI = 0.10;      // bir kenardan kesilebilecek en çok oran

export function sayfaKutusu({ data, genislik: g, yukseklik: y }) {
  const bg = Math.max(1, Math.floor(g / BLOK));
  const by = Math.max(1, Math.floor(y / BLOK));
  const ort = new Float64Array(bg * by);

  for (let j = 0; j < by; j++) {
    for (let i = 0; i < bg; i++) {
      let toplam = 0, adet = 0;
      const y0 = j * BLOK, y1 = Math.min(y, y0 + BLOK);
      const x0 = i * BLOK, x1 = Math.min(g, x0 + BLOK);
      for (let jj = y0; jj < y1; jj += 2) {
        for (let ii = x0; ii < x1; ii += 2) {
          const k = (jj * g + ii) * 4;
          toplam += data[k] * 0.299 + data[k + 1] * 0.587 + data[k + 2] * 0.114;
          adet++;
        }
      }
      ort[j * bg + i] = adet ? toplam / adet : 0;
    }
  }

  // Otsu: parlaklık histogramını iki kümeye ayıran eşik. Sabit bir eşik
  // (ör. 128) gölgeli fotoğrafta sayfayı da karanlık sayardı.
  const hist = new Array(256).fill(0);
  ort.forEach(v => hist[Math.min(255, Math.max(0, Math.round(v)))]++);
  const toplamPiksel = ort.length;
  let toplamAgirlik = 0;
  hist.forEach((adet, v) => { toplamAgirlik += adet * v; });
  let arkaAdet = 0, arkaAgirlik = 0, enIyiEsik = 128, enIyiVaryans = -1;
  for (let v = 0; v < 256; v++) {
    arkaAdet += hist[v];
    if (arkaAdet === 0) continue;
    const onAdet = toplamPiksel - arkaAdet;
    if (onAdet === 0) break;
    arkaAgirlik += v * hist[v];
    const arkaOrt = arkaAgirlik / arkaAdet;
    const onOrt = (toplamAgirlik - arkaAgirlik) / onAdet;
    const varyans = arkaAdet * onAdet * (arkaOrt - onOrt) ** 2;
    if (varyans > enIyiVaryans) { enIyiVaryans = varyans; enIyiEsik = v; }
  }

  // Parlak bloklar → en büyük bağlantılı küme (4 komşu, yığınla tarama)
  const parlak = new Uint8Array(bg * by);
  for (let n = 0; n < ort.length; n++) parlak[n] = ort[n] > enIyiEsik ? 1 : 0;

  // ── TEK KÜME DEĞİL, BÜYÜK KÜMELERİN BİRLEŞİMİ ────────────────
  // Sayfanın ortasından geçen bir gölge (cilt payı, sayfa kıvrımı)
  // parlak bölgeyi ikiye bölebiliyor. Yalnızca en büyük kümeyi almak
  // o zaman sayfanın bir yarısını atıyor: gerçek bir fotoğrafta
  // sayfanın sağ %16'sı kesildi ve sağ sütunun bütün sayfa numaraları
  // kayboldu. Bu yüzden KÜÇÜK OLMAYAN her parlak küme hesaba katılıyor
  // ve kutu hepsini kapsıyor. Fazladan alan almak (masanın parlak bir
  // köşesi) yalnızca kazancı azaltır; eksik almak veriyi yok ediyor.
  const KUCUK_KUME = 0.08;              // toplam bloğa oranla
  const etiket = new Int32Array(bg * by).fill(-1);
  const kumeler = [];
  for (let bas = 0; bas < parlak.length; bas++) {
    if (!parlak[bas] || etiket[bas] >= 0) continue;
    const yigin = [bas];
    etiket[bas] = bas;
    let adet = 0, i0 = bg, i1 = -1, j0 = by, j1 = -1;
    while (yigin.length) {
      const n = yigin.pop();
      const i = n % bg, j = (n - i) / bg;
      adet++;
      if (i < i0) i0 = i; if (i > i1) i1 = i;
      if (j < j0) j0 = j; if (j > j1) j1 = j;
      const komsular = [i > 0 ? n - 1 : -1, i < bg - 1 ? n + 1 : -1,
                        j > 0 ? n - bg : -1, j < by - 1 ? n + bg : -1];
      komsular.forEach(k => {
        if (k >= 0 && parlak[k] && etiket[k] < 0) { etiket[k] = bas; yigin.push(k); }
      });
    }
    kumeler.push({ adet, i0, i1, j0, j1 });
  }

  const esikAdet = bg * by * KUCUK_KUME;
  const buyuk = kumeler.filter(k => k.adet >= esikAdet);
  const secilen = buyuk.length ? buyuk : (kumeler.length ? [kumeler.reduce((a, b) => (b.adet > a.adet ? b : a))] : []);
  const enIyi = secilen.length ? {
    adet: secilen.reduce((t, k) => t + k.adet, 0),
    i0: Math.min(...secilen.map(k => k.i0)),
    i1: Math.max(...secilen.map(k => k.i1)),
    j0: Math.min(...secilen.map(k => k.j0)),
    j1: Math.max(...secilen.map(k => k.j1)),
  } : null;

  const oran = enIyi ? ((enIyi.i1 - enIyi.i0 + 1) * (enIyi.j1 - enIyi.j0 + 1)) / (bg * by) : 0;
  if (!enIyi || oran < EN_AZ_ALAN || oran > EN_COK_ALAN) {
    // Sayfa ayırt edilemedi: kırpmıyoruz. Yanlış kırpmak, hiç
    // kırpmamaktan kötü — sayfanın yarısını atabilirdi.
    return { x: 0, y: 0, genislik: g, yukseklik: y, kirpildi: false, oran };
  }

  // Blok sınırlarını piksele çevir, bir blok pay bırak (kâğıdın kenarı
  // blok ortasına düşebiliyor).
  //
  // ── KENAR BAŞINA EN ÇOK %10 ──────────────────────────────────
  // Sayfanın kenarı gölgedeyse parlaklık orayı "sayfa değil" sayıyor.
  // Gerçek bir fotoğrafta sağ %16 kesildi ve sağ sütunun BÜTÜN sayfa
  // numaraları kayboldu — kırpma kazandırırken veri yok etmiş oldu.
  // Kesme miktarı sınırlanıyor: gölgeli kenarın gürültüsüne katlanmak,
  // bir sütunu kaybetmekten iyi.
  const enCokX = g * KENAR_PAYI, enCokY = y * KENAR_PAYI;
  const x = Math.min(enCokX, Math.max(0, (enIyi.i0 - 1) * BLOK));
  const yy = Math.min(enCokY, Math.max(0, (enIyi.j0 - 1) * BLOK));
  const x2 = Math.max(g - enCokX, Math.min(g, (enIyi.i1 + 2) * BLOK));
  const y2 = Math.max(y - enCokY, Math.min(y, (enIyi.j1 + 2) * BLOK));
  return {
    x: Math.round(x), y: Math.round(yy),
    genislik: Math.round(x2 - x), yukseklik: Math.round(y2 - yy),
    kirpildi: true, oran,
  };
}

// Dikdörtgeni kes — SAF (Node ölçümü için). Tarayıcıda bu iş tuvale
// bırakılıyor: drawImage zaten kırparak çiziyor.
export function kirp({ data, genislik: g }, kutu) {
  const { x, y, genislik: kg, yukseklik: ky } = kutu;
  const cikti = new Uint8ClampedArray(kg * ky * 4);
  for (let j = 0; j < ky; j++) {
    const kaynak = ((y + j) * g + x) * 4;
    cikti.set(data.subarray(kaynak, kaynak + kg * 4), j * kg * 4);
  }
  return { data: cikti, genislik: kg, yukseklik: ky };
}

// Ham RGBA görüntüyü OCR'a hazırlar.
//
// Girdi:  { data: Uint8ClampedArray|Uint8Array (RGBA), genislik, yukseklik }
// Çıktı:  { data, genislik, yukseklik, aci, silinenNokta }
//         data yerinde DEĞİŞTİRİLİYOR (kopya almıyoruz: 1800x2400 bir
//         görüntü 17 MB, gereksiz kopya telefonda belleği zorluyor).
export function ikiliyeCevir({ data, genislik: g, yukseklik: y },
  { nokta = true, duyarlilik = 0.15, noktaKipi = "sil" } = {}) {
  const p = data;

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

  // Pencere genişliğin ~1/32'si; metin satırından belirgin biçimde
  // büyük olmalı ki harfin kendi karanlığı eşiği aşağı çekmesin.
  const yari = Math.max(8, Math.round(g / 32));
  const T = duyarlilik;                 // ortalamanın bu kadar altı → siyah

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
  const silinenNokta = nokta ? noktaDolgusunuSil(ikili, g, y, noktaKipi) : 0;

  for (let n = 0; n < g * y; n++) {
    const k = n * 4, v = ikili[n] ? 0 : 255;
    p[k] = p[k + 1] = p[k + 2] = v;
    p[k + 3] = 255;
  }

  return { data: p, genislik: g, yukseklik: y, aci, silinenNokta };
}

export { HEDEF_GENISLIK, satirBantlari };

// Görüntüyü açıyla döndür — SAF, zemin BEYAZ.
//
// Tarayıcıda bu iş tuvale bırakılıyor; burada Node ölçümü aynı adımları
// izlesin diye var. Çift doğrusal örnekleme: 1 bitlik (siyah-beyaz) bir
// görüntüyü döndürmek gri kenarlar üretir, o yüzden döndürme
// EŞİKLEMEDEN ÖNCE yapılmalı — sıra bozulursa harflerin kenarı grileşip
// OCR'ı zorluyor.
export function dondur({ data, genislik: g, yukseklik: y }, aci) {
  if (!aci) return { data, genislik: g, yukseklik: y };
  const r = (aci * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const cikti = new Uint8ClampedArray(g * y * 4).fill(255);
  const mx = g / 2, my = y / 2;
  for (let j = 0; j < y; j++) {
    for (let i = 0; i < g; i++) {
      // Hedeften kaynağa ters dönüşüm
      const dx = i - mx, dy = j - my;
      const sx = mx + dx * cos + dy * sin;
      const sy = my - dx * sin + dy * cos;
      if (sx < 0 || sy < 0 || sx >= g - 1 || sy >= y - 1) continue;
      const i0 = Math.floor(sx), j0 = Math.floor(sy);
      const fx = sx - i0, fy = sy - j0;
      for (let c = 0; c < 3; c++) {
        const a = data[(j0 * g + i0) * 4 + c], b = data[(j0 * g + i0 + 1) * 4 + c];
        const d = data[((j0 + 1) * g + i0) * 4 + c], e = data[((j0 + 1) * g + i0 + 1) * 4 + c];
        cikti[(j * g + i) * 4 + c] =
          a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + d * (1 - fx) * fy + e * fx * fy;
      }
      cikti[(j * g + i) * 4 + 3] = 255;
    }
  }
  return { data: cikti, genislik: g, yukseklik: y };
}

// Çift doğrusal büyütme — SAF. Tarayıcıda bu iş tuvale bırakılıyor
// (daha hızlı); burada yalnızca Node'daki ölçüm aynı boyutlarla
// çalışsın diye var. İkisinin süzgeci birebir aynı değil, ama ölçümde
// aradığımız şey eşik/pencere kararlarının etkisi ve o etki bu farktan
// büyük.
export function olcekle({ data, genislik: g, yukseklik: y }, hedef) {
  const olcek = Math.max(1, Math.min(3, hedef / g));
  if (olcek === 1) return { data, genislik: g, yukseklik: y };
  const yg = Math.round(g * olcek), yy = Math.round(y * olcek);
  const cikti = new Uint8ClampedArray(yg * yy * 4);
  for (let j = 0; j < yy; j++) {
    const sy = Math.min(y - 1, j / olcek);
    const j0 = Math.floor(sy), j1 = Math.min(y - 1, j0 + 1), fy = sy - j0;
    for (let i = 0; i < yg; i++) {
      const sx = Math.min(g - 1, i / olcek);
      const i0 = Math.floor(sx), i1 = Math.min(g - 1, i0 + 1), fx = sx - i0;
      for (let c = 0; c < 4; c++) {
        const a = data[(j0 * g + i0) * 4 + c], b = data[(j0 * g + i1) * 4 + c];
        const d = data[(j1 * g + i0) * 4 + c], e = data[(j1 * g + i1) * 4 + c];
        cikti[(j * yg + i) * 4 + c] =
          a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + d * (1 - fx) * fy + e * fx * fy;
      }
    }
  }
  return { data: cikti, genislik: yg, yukseklik: yy };
}

// ── PERSPEKTİF DÜZELTME ─────────────────────────────────────────
// Kitap fotoğrafı elde çekiliyor: sayfa yalnızca eğik değil, YAMUK.
// Üst kenar alt kenardan dar, satırlar sağa doğru yaklaşıyor. Düz bir
// döndürme bunu düzeltmiyor; OCR'ın satır varsayımı bozuluyor ve sayfa
// numarası sütunu eğri bir şerit hâline geliyor.
//
// Kullanıcı dört köşeyi işaretlediğinde bu dörtgen, dikdörtgene
// dönüştürülüyor (projektif dönüşüm). Hedefin her pikseli için kaynakta
// karşılığı hesaplanıp çift doğrusal örnekleniyor — ters eşleme, ileri
// eşlemenin bıraktığı deliklerden kaçınıyor.
//
// Katsayılar 8 bilinmeyenli doğrusal sistemden geliyor (DLT). Sistem
// küçük olduğu için Gauss eliminasyonu yeterli; kütüphane gerekmiyor.
function projektifKatsayi(hedef, kaynak) {
  // hedef[i] -> kaynak[i] eşlemesi (4 nokta)
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = hedef[i];
    const { x, y } = kaynak[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }

  // Gauss eliminasyonu (kısmi pivotlama)
  for (let s = 0; s < 8; s++) {
    let enIyi = s;
    for (let r = s + 1; r < 8; r++) if (Math.abs(A[r][s]) > Math.abs(A[enIyi][s])) enIyi = r;
    if (Math.abs(A[enIyi][s]) < 1e-9) return null;      // tekil: dörtgen bozuk
    [A[s], A[enIyi]] = [A[enIyi], A[s]];
    [b[s], b[enIyi]] = [b[enIyi], b[s]];
    for (let r = 0; r < 8; r++) {
      if (r === s) continue;
      const k = A[r][s] / A[s][s];
      if (!k) continue;
      for (let ss = s; ss < 8; ss++) A[r][ss] -= k * A[s][ss];
      b[r] -= k * b[s];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

// Dört köşeyi (sol-üst, sağ-üst, sağ-alt, sol-alt) dikdörtgene açar.
export function perspektifDuzelt({ data, genislik: g, yukseklik: y }, koseler, hedefG, hedefY) {
  const hedef = [
    { x: 0, y: 0 }, { x: hedefG - 1, y: 0 },
    { x: hedefG - 1, y: hedefY - 1 }, { x: 0, y: hedefY - 1 },
  ];
  const k = projektifKatsayi(hedef, koseler);
  if (!k) return null;
  const [a, bb, c, d, e, f, gg, h] = k;

  const cikti = new Uint8ClampedArray(hedefG * hedefY * 4).fill(255);
  for (let j = 0; j < hedefY; j++) {
    for (let i = 0; i < hedefG; i++) {
      const payda = gg * i + h * j + 1;
      const sx = (a * i + bb * j + c) / payda;
      const sy = (d * i + e * j + f) / payda;
      if (sx < 0 || sy < 0 || sx >= g - 1 || sy >= y - 1) continue;   // dışarısı beyaz
      const i0 = Math.floor(sx), j0 = Math.floor(sy);
      const fx = sx - i0, fy = sy - j0;
      const hedefK = (j * hedefG + i) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const p00 = data[(j0 * g + i0) * 4 + ch], p10 = data[(j0 * g + i0 + 1) * 4 + ch];
        const p01 = data[((j0 + 1) * g + i0) * 4 + ch], p11 = data[((j0 + 1) * g + i0 + 1) * 4 + ch];
        cikti[hedefK + ch] =
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      cikti[hedefK + 3] = 255;
    }
  }
  return { data: cikti, genislik: hedefG, yukseklik: hedefY };
}

// Dörtgenin açılacağı dikdörtgenin ölçüsü: karşılıklı kenarların
// uzunundan alınıyor ki metin sıkışmasın.
export function dortgenOlcusu(koseler) {
  const uzunluk = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
  const genislik = Math.max(uzunluk(koseler[0], koseler[1]), uzunluk(koseler[3], koseler[2]));
  const yukseklik = Math.max(uzunluk(koseler[0], koseler[3]), uzunluk(koseler[1], koseler[2]));
  return { genislik: Math.max(1, Math.round(genislik)), yukseklik: Math.max(1, Math.round(yukseklik)) };
}

// Dörtgen neredeyse eksen hizalı bir dikdörtgen mi? Öyleyse perspektif
// dönüşüme gerek yok, düz kırpma hem hızlı hem kayıpsız.
export function dikdortgenMi(koseler, tolerans = 2) {
  const [su, sagu, saga, sa] = koseler;
  return Math.abs(su.y - sagu.y) <= tolerans && Math.abs(sa.y - saga.y) <= tolerans
      && Math.abs(su.x - sa.x) <= tolerans && Math.abs(sagu.x - saga.x) <= tolerans;
}
