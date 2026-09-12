import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import Card from "./Card";
import SectionTitle from "./SectionTitle";
import { RENK, BOSLUK, KOSE, YAZI } from "../lib/tasarim";

// Öğrenciyi kendi ilerlemesiyle karşılaştıran dört görsel.
//
// ── HEPSİ KENDİ VERİSİNE GÖRE ÖLÇEKLİ ───────────────────────────
// Hiçbir grafikte sabit bir tavan yok; sütunlar öğrencinin kendi en iyi
// haftasına göre boyutlanıyor. Sabit bir hedefe (ör. "haftada 500 soru")
// göre çizseydik az çözen öğrenci her hafta yerde sürünen bir sütun
// görürdü — motive etmesi beklenen şey caydırıcı olurdu.
//
// ── EKSİK VERİ SIFIR DEĞİLDİR ───────────────────────────────────
// Doğruluk grafiği yalnızca soru girilmiş haftaları çiziyor. Boş haftayı
// %0 saymak, "hiç çözmedim" ile "çözdüm ama hepsi yanlış"ı aynı yere
// koyardı.
//
// Veri panelden geliyor (tests, tasks); bu dosya hiç sorgu atmıyor.

// ── ORTAK YARDIMCILAR ───────────────────────────────────────────

const GUN_MS = 86400000;

// Bir tarihin ait olduğu haftanın PAZARTESİsi (yerel saat, gün başı).
function haftaBasi(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const gun = (d.getDay() + 6) % 7;          // pazartesi = 0
  d.setDate(d.getDate() - gun);
  return d;
}

const gunAnahtari = (t) => {
  const d = new Date(t);
  // toISOString UTC'ye çevirir ve akşam saatlerinde günü bir geri
  // kaydırırdı; yerel bileşenlerden kuruluyor.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const kisaTarih = (d) =>
  d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

// Son `adet` haftanın kutuları — en eskisi başta.
function sonHaftalar(adet) {
  const bu = haftaBasi(new Date());
  return Array.from({ length: adet }, (_, i) => {
    const bas = new Date(bu.getTime() - (adet - 1 - i) * 7 * GUN_MS);
    return { bas, anahtar: gunAnahtari(bas) };
  });
}

const bosDurum = (metin) => (
  <div style={{
    fontSize: YAZI.ikincil, color: RENK.metinCokSoluk,
    padding: "18px 0", textAlign: "center", lineHeight: 1.5,
  }}>{metin}</div>
);

// ── 1. HAFTALIK ÇÖZÜLEN SORU ────────────────────────────────────

export function HaftalikSoruGrafigi({ tests = [], color: c, hafta = 10 }) {
  const kutular = sonHaftalar(hafta);
  const sayac = new Map(kutular.map(k => [k.anahtar, 0]));

  tests.forEach(t => {
    if (!t.created_at) return;
    const a = gunAnahtari(haftaBasi(t.created_at));
    if (sayac.has(a)) sayac.set(a, sayac.get(a) + (t.question_count || 0));
  });

  const degerler = kutular.map(k => sayac.get(k.anahtar) ?? 0);
  const enBuyuk  = Math.max(...degerler);
  const toplam   = degerler.reduce((s, v) => s + v, 0);

  if (toplam === 0) {
    return (
      <Card>
        <SectionTitle title="Haftalık çözülen soru" color={c.mid} />
        {bosDurum("Test eklemeye başlayınca haftaların burada yan yana görünecek.")}
      </Card>
    );
  }

  const buHafta   = degerler[degerler.length - 1];
  const gecenHafta = degerler[degerler.length - 2] ?? 0;
  const fark      = buHafta - gecenHafta;

  return (
    <Card>
      <SectionTitle title="Haftalık çözülen soru" color={c.mid} />

      {/* Tek cümlelik özet: grafiği okumadan da cevabı versin */}
      <div style={{
        fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.m, lineHeight: 1.5,
      }}>
        Bu hafta <b style={{ color: c.text }}>{buHafta}</b> soru.{" "}
        {gecenHafta === 0 && buHafta > 0 ? "Geçen hafta hiç kayıt yoktu."
          : fark > 0 ? <>Geçen haftadan <b style={{ color: "#1A6B3C" }}>{fark} soru fazla</b> 👏</>
          : fark < 0 ? <>Geçen haftadan {Math.abs(fark)} soru az.</>
          : "Geçen haftayla aynı."}
      </div>

      <div style={{
        display: "flex", alignItems: "flex-end", gap: 5,
        height: 120, marginBottom: BOSLUK.s,
      }}>
        {kutular.map((k, i) => {
          const v = degerler[i];
          const sonuncu = i === kutular.length - 1;
          // En yüksek sütun tam yüksekliği alıyor; sıfır olan hafta yine
          // de ince bir çizgi bırakıyor ki "veri yok" ile "grafik bitti"
          // karışmasın.
          const yukseklik = enBuyuk > 0 ? Math.max((v / enBuyuk) * 100, v > 0 ? 6 : 2) : 2;
          return (
            <div key={k.anahtar} title={`${kisaTarih(k.bas)} haftası · ${v} soru`}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
                       alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              {v > 0 && (
                <div style={{
                  fontSize: YAZI.mikro, fontWeight: sonuncu ? 800 : 600,
                  color: sonuncu ? c.text : RENK.metinCokSoluk, marginBottom: 3,
                }}>{v}</div>
              )}
              <div style={{
                width: "100%", height: `${yukseklik}%`, borderRadius: `${KOSE.s}px ${KOSE.s}px 2px 2px`,
                background: v === 0 ? RENK.cizgi : sonuncu ? c.bg : c.mid,
                opacity: v === 0 ? 1 : sonuncu ? 1 : 0.55,
                transition: "height .5s ease",
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 5 }}>
        {kutular.map((k, i) => (
          <div key={k.anahtar} style={{
            flex: 1, minWidth: 0, textAlign: "center",
            fontSize: YAZI.mikro - 1, color: RENK.metinSilik, whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {/* Her hafta yazılırsa dar ekranda üst üste biniyor */}
            {i === 0 || i === kutular.length - 1 || i % 3 === 0 ? kisaTarih(k.bas) : ""}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 2. ÇALIŞMA SERİSİ ───────────────────────────────────────────

export function CalismaSerisi({ tests = [], tasks = [], color: c, gun = 28 }) {
  // Bir günü "çalışılmış" sayan iki şey var: o gün bitirilen görev ve o
  // gün kaydedilen test. İkisini de saymak gerekiyor — yalnız göreve
  // bakmak, kendi isteğiyle test çözen öğrencinin gününü boş gösterirdi.
  const gunler = new Map();
  const ekle = (t) => {
    if (!t) return;
    const a = gunAnahtari(t);
    gunler.set(a, (gunler.get(a) ?? 0) + 1);
  };
  tasks.forEach(t => { if (t.is_done && t.tamamlanma_tarihi) ekle(t.tamamlanma_tarihi); });
  tests.forEach(t => ekle(t.created_at));

  // Seri: bugünden geriye kesintisiz kaç gün. Bugün henüz boşsa seri
  // DÜNDEN başlıyor — sabah panele bakan öğrencinin serisi, günü
  // bitirmediği için sıfırlanmış görünmesin.
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  const dolu = (d) => (gunler.get(gunAnahtari(d)) ?? 0) > 0;
  let seri = 0;
  let imlec = new Date(bugun);
  if (!dolu(imlec)) imlec = new Date(bugun.getTime() - GUN_MS);
  while (dolu(imlec)) { seri += 1; imlec = new Date(imlec.getTime() - GUN_MS); }

  // Isı takvimi: son `gun` gün, pazartesiden başlayan tam haftalar.
  const sonGun = new Date(bugun);
  const izgara = Array.from({ length: gun }, (_, i) =>
    new Date(sonGun.getTime() - (gun - 1 - i) * GUN_MS));
  const enYogun = Math.max(1, ...izgara.map(d => gunler.get(gunAnahtari(d)) ?? 0));
  const aktifGun = izgara.filter(d => dolu(d)).length;

  if (gunler.size === 0) {
    return (
      <Card>
        <SectionTitle title="Çalışma serim" color={c.mid} />
        {bosDurum("Görev tamamladıkça ve test ekledikçe serin burada birikecek.")}
      </Card>
    );
  }

  const GUN_ADI = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"];

  return (
    <Card>
      <SectionTitle title="Çalışma serim" color={c.mid} />

      <div style={{ display: "flex", gap: BOSLUK.s, marginBottom: BOSLUK.l }}>
        <div style={{ flex: 1, background: c.light, borderRadius: KOSE.m, padding: "12px 14px" }}>
          <div style={{ fontSize: YAZI.mikro, color: c.text, fontWeight: 700, marginBottom: 2 }}>
            GÜNCEL SERİ
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c.text, lineHeight: 1.1 }}>
            {seri > 0 ? `${seri} gün` : "—"} {seri >= 3 && "🔥"}
          </div>
        </div>
        <div style={{ flex: 1, background: RENK.yuzey, borderRadius: KOSE.m, padding: "12px 14px" }}>
          <div style={{ fontSize: YAZI.mikro, color: RENK.metinCokSoluk, fontWeight: 700, marginBottom: 2 }}>
            SON {gun} GÜN
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: RENK.metin, lineHeight: 1.1 }}>
            {aktifGun} gün
          </div>
        </div>
      </div>

      {/* Isı takvimi — satırlar haftanın günleri, sütunlar haftalar */}
      <div style={{ display: "flex", gap: 4 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {GUN_ADI.map(g => (
            <div key={g} style={{
              height: 15, display: "flex", alignItems: "center",
              fontSize: YAZI.mikro - 1, color: RENK.metinSilik, width: 16,
            }}>{g}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0 }}>
          {Array.from({ length: Math.ceil(gun / 7) }, (_, h) => (
            <div key={h} style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
              {Array.from({ length: 7 }, (_, g) => {
                const d = izgara[h * 7 + g];
                if (!d) return <div key={g} style={{ height: 15 }} />;
                const sayi = gunler.get(gunAnahtari(d)) ?? 0;
                // Dört kademe: yoğunluk sürekli bir gradyan olsaydı
                // 1 ile 2 arasındaki fark ayırt edilemezdi.
                const oran = sayi === 0 ? 0 : 0.3 + 0.7 * Math.min(sayi / enYogun, 1);
                return (
                  <div key={g} title={`${kisaTarih(d)} · ${sayi ? `${sayi} kayıt` : "boş"}`}
                    style={{
                      height: 15, borderRadius: 4,
                      background: sayi === 0 ? RENK.cizgi : c.bg,
                      opacity: sayi === 0 ? 1 : oran,
                    }} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── 3. DOĞRULUK TRENDİ ──────────────────────────────────────────

export function DogrulukTrendi({ tests = [], color: c, hafta = 10 }) {
  const kutular = sonHaftalar(hafta);
  const toplamlar = new Map(kutular.map(k => [k.anahtar, { soru: 0, dogru: 0 }]));

  tests.forEach(t => {
    if (!t.created_at || !t.question_count) return;
    const a = gunAnahtari(haftaBasi(t.created_at));
    const h = toplamlar.get(a);
    if (!h) return;
    h.soru  += t.question_count || 0;
    h.dogru += t.correct_count  || 0;
  });

  // SORU GİRİLMEMİŞ HAFTA ÇİZİLMİYOR. %0 saymak "hiç çözmedim" ile
  // "hepsi yanlış"ı aynı yere koyardı.
  const noktalar = kutular
    .map(k => ({ ...k, ...toplamlar.get(k.anahtar) }))
    .filter(k => k.soru > 0)
    .map(k => ({ ...k, oran: Math.round((k.dogru / k.soru) * 100) }));

  if (noktalar.length < 2) {
    return (
      <Card>
        <SectionTitle title="Doğruluk trendim" color={c.mid} />
        {bosDurum(noktalar.length === 0
          ? "Doğru sayısı girilmiş test eklendikçe trend oluşacak."
          : "Trend için en az iki farklı hafta gerekiyor — bir hafta daha kayıt gir.")}
      </Card>
    );
  }

  const son  = noktalar[noktalar.length - 1];
  const onceki = noktalar[noktalar.length - 2];
  const fark = son.oran - onceki.oran;

  const Y = 130, pad = { ust: 14, alt: 22 };
  const icY = Y - pad.ust - pad.alt;
  const n = noktalar.length;
  // Yüzdelik ekseni her zaman 0–100: doğruluk kendi aralığına
  // yakınlaştırılırsa %61'den %64'e çıkış dramatik bir sıçrama gibi
  // görünür ve öğrenciyi yanıltır.
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => pad.ust + icY - (v / 100) * icY;

  const cizgi = noktalar.map((p, i) => `${x(i)},${y(p.oran)}`).join(" ");

  return (
    <Card>
      <SectionTitle title="Doğruluk trendim" color={c.mid} />

      <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.m, lineHeight: 1.5 }}>
        Son hafta <b style={{ color: c.text }}>%{son.oran}</b> doğruluk.{" "}
        {fark > 0 ? <>Önceki haftaya göre <b style={{ color: "#1A6B3C" }}>{fark} puan yukarıda</b> 📈</>
          : fark < 0 ? <>Önceki haftaya göre {Math.abs(fark)} puan aşağıda.</>
          : "Önceki haftayla aynı."}
      </div>

      <div style={{ display: "flex", gap: 4 }}>
        {/* Y ekseni etiketleri — SVG %100 genişlikte esnediği için
            yazılar dışarıda, yoksa ölçeklenip bozulurlardı. */}
        <div style={{
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          height: Y - pad.alt, paddingTop: pad.ust - 6, width: 26, flexShrink: 0,
          fontSize: YAZI.mikro - 1, color: RENK.metinSilik, textAlign: "right",
        }}>
          <span>%100</span><span>%50</span><span>%0</span>
        </div>

        <svg viewBox={`0 0 100 ${Y}`} preserveAspectRatio="none"
          style={{ width: "100%", height: Y, display: "block", overflow: "visible" }}>
          {[0, 50, 100].map(v => (
            <line key={v} x1="0" x2="100" y1={y(v)} y2={y(v)}
              stroke={RENK.cizgi} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <polyline points={cizgi} fill="none" stroke={c.bg}
            strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />
          {noktalar.map((p, i) => (
            <circle key={p.anahtar} cx={x(i)} cy={y(p.oran)} r="3"
              fill={i === n - 1 ? c.bg : "#fff"} stroke={c.bg} strokeWidth="2"
              vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, paddingLeft: 30 }}>
        <span style={{ fontSize: YAZI.mikro - 1, color: RENK.metinSilik }}>{kisaTarih(noktalar[0].bas)}</span>
        <span style={{ fontSize: YAZI.mikro - 1, color: RENK.metinSilik }}>{kisaTarih(son.bas)}</span>
      </div>
    </Card>
  );
}

// ── 4. DERS DAĞILIMI ────────────────────────────────────────────

export function DersDagilimi({ tests = [], color: c, ustSinir = 7 }) {
  const toplam = new Map();
  tests.forEach(t => {
    const ders = (t.subject ?? "").trim();
    if (!ders || !t.question_count) return;
    toplam.set(ders, (toplam.get(ders) ?? 0) + t.question_count);
  });

  const satirlar = [...toplam.entries()]
    .map(([ders, soru]) => ({ ders, soru }))
    .sort((a, b) => b.soru - a.soru);

  if (satirlar.length === 0) {
    return (
      <Card>
        <SectionTitle title="Ders dağılımım" color={c.mid} />
        {bosDurum("Ders seçilmiş test eklendikçe hangi derse ne kadar çalıştığın burada görünecek.")}
      </Card>
    );
  }

  // Uzun kuyruk tek satırda toplanıyor: on beş dersin her biri için
  // 3 soruluk bir çubuk çizmek listeyi okunmaz yapıyordu.
  const gosterilen = satirlar.slice(0, ustSinir);
  const kalan = satirlar.slice(ustSinir);
  const kalanToplam = kalan.reduce((s, r) => s + r.soru, 0);
  if (kalanToplam > 0) gosterilen.push({ ders: `Diğer (${kalan.length} ders)`, soru: kalanToplam, kuyruk: true });

  const genelToplam = satirlar.reduce((s, r) => s + r.soru, 0);
  const enBuyuk = gosterilen[0].soru;

  return (
    <Card>
      <SectionTitle title="Ders dağılımım" color={c.mid} />

      <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.m, lineHeight: 1.5 }}>
        Toplam <b style={{ color: c.text }}>{genelToplam}</b> soru,{" "}
        <b style={{ color: c.text }}>{satirlar.length}</b> derste.
        {satirlar.length > 1 && <> En çok <b>{satirlar[0].ders}</b>, en az <b>{satirlar[satirlar.length - 1].ders}</b>.</>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: BOSLUK.s }}>
        {gosterilen.map(r => {
          const yuzde = Math.round((r.soru / genelToplam) * 100);
          return (
            <div key={r.ders}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                gap: BOSLUK.s, marginBottom: 3,
              }}>
                <span style={{
                  fontSize: YAZI.ikincil, color: r.kuyruk ? RENK.metinSoluk : RENK.metin,
                  fontWeight: r.kuyruk ? 500 : 600, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{r.ders}</span>
                <span style={{ fontSize: YAZI.kucuk, color: RENK.metinSoluk, flexShrink: 0 }}>
                  {r.soru} soru · %{yuzde}
                </span>
              </div>
              <div style={{ height: 8, borderRadius: KOSE.tam, background: RENK.cizgi, overflow: "hidden" }}>
                <div style={{
                  width: `${Math.max((r.soru / enBuyuk) * 100, 3)}%`, height: "100%",
                  borderRadius: KOSE.tam, background: r.kuyruk ? RENK.metinSilik : c.mid,
                  transition: "width .5s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}


// ── 5. ÇALIŞMA SÜRESİ VE PLAN UYUMU ─────────────────────────────
// Öbür dört grafik öğrencinin testlerinden hesaplanıyor; bu grafik
// haftalık özetten okuyor (ogrenci_haftalik), çünkü plan ve süre bilgisi
// orada zaten hafta hafta toplanmış ve özet tabloyla aynı sayıyı
// göstermesi gerekiyor — iki yerde iki ayrı hesap birbirini tutmazdı.
//
// PLANLANAN ile ÇALIŞILAN yan yana: öğrenci planın ne kadarını
// gerçekleştirdiğini görsün. Sayaçla ölçülen kısım çalışılan çubuğun
// içinde koyu tonla; bildirilen süreyle ölçülen süre arasındaki fark
// göz önünde dursun ama suçlayıcı bir dille değil, aynı çubuğun bir
// parçası olarak.
export function CalismaSuresiGrafigi({ studentId, color: c, hafta = 8 }) {
  const [satirlar, setSatirlar] = useState(null);

  useEffect(() => {
    if (!studentId) return;
    let gecerli = true;
    const kutular = sonHaftalar(hafta);
    supabase.from("ogrenci_haftalik")
      .select("hafta, plan_blok, plan_yapilan, plan_dk, calisilan_dk, sayac_dk")
      .eq("student_id", studentId)
      .gte("hafta", kutular[0].anahtar)
      .lte("hafta", kutular[kutular.length - 1].anahtar)
      .then(({ data, error }) => {
        if (!gecerli) return;
        // Sütunlar yoksa (migration çalışmadıysa) grafik boş durum gösteriyor
        const harita = new Map((error ? [] : data ?? []).map(r => [r.hafta, r]));
        setSatirlar(kutular.map(k => ({ ...k, ...(harita.get(k.anahtar) ?? {}) })));
      });
    return () => { gecerli = false; };
  }, [studentId, hafta]);

  if (satirlar === null) {
    return <Card><SectionTitle title="Çalışma sürem" color={c.mid} />{bosDurum("Yükleniyor...")}</Card>;
  }

  const planli = satirlar.filter(r => (r.plan_blok ?? 0) > 0 || (r.calisilan_dk ?? 0) > 0);
  if (planli.length === 0) {
    return (
      <Card>
        <SectionTitle title="Çalışma sürem" color={c.mid} />
        {bosDurum("Çalışma planındaki blokları işaretleyip süreni girdikçe haftaların burada birikecek.")}
      </Card>
    );
  }

  const enBuyuk = Math.max(1, ...satirlar.map(r => Math.max(r.plan_dk ?? 0, r.calisilan_dk ?? 0)));
  const son = satirlar[satirlar.length - 1];
  const uyum = (son.plan_blok ?? 0) > 0 ? Math.round((son.plan_yapilan / son.plan_blok) * 100) : null;
  const saat = (dk) => (dk >= 60 ? `${Math.floor(dk / 60)} sa${dk % 60 ? ` ${dk % 60} dk` : ""}` : `${dk} dk`);

  return (
    <Card>
      <SectionTitle title="Çalışma sürem" color={c.mid} />

      <div style={{ fontSize: YAZI.ikincil, color: RENK.metinIkincil, marginBottom: BOSLUK.m, lineHeight: 1.5 }}>
        {uyum != null ? (
          <>Bu hafta planının <b style={{ color: c.text }}>%{uyum}</b>'ini yaptın
            {(son.calisilan_dk ?? 0) > 0 && <>, <b style={{ color: c.text }}>{saat(son.calisilan_dk)}</b> çalıştın</>}.</>
        ) : (son.calisilan_dk ?? 0) > 0 ? (
          <>Bu hafta <b style={{ color: c.text }}>{saat(son.calisilan_dk)}</b> çalıştın.</>
        ) : "Bu hafta için henüz plan ya da süre kaydı yok."}
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, marginBottom: BOSLUK.s }}>
        {satirlar.map((r, i) => {
          const plan = r.plan_dk ?? 0, calis = r.calisilan_dk ?? 0, sayac = Math.min(r.sayac_dk ?? 0, calis);
          const sonuncu = i === satirlar.length - 1;
          return (
            <div key={r.anahtar}
              title={`${kisaTarih(r.bas)} haftası · planlanan ${saat(plan)} · çalışılan ${saat(calis)}${sayac ? ` (sayaçla ${saat(sayac)})` : ""}`}
              style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: "100%" }}>
              {/* Planlanan: soluk, arkadaki çubuk */}
              <div style={{
                width: "40%", height: `${Math.max((plan / enBuyuk) * 100, plan ? 4 : 2)}%`,
                background: RENK.cizgi, borderRadius: `${KOSE.s}px ${KOSE.s}px 2px 2px`,
              }} />
              {/* Çalışılan: sayaçla ölçülen kısım altta koyu */}
              <div style={{
                width: "40%", height: `${Math.max((calis / enBuyuk) * 100, calis ? 4 : 2)}%`,
                display: "flex", flexDirection: "column-reverse",
                borderRadius: `${KOSE.s}px ${KOSE.s}px 2px 2px`, overflow: "hidden",
                background: calis ? c.mid : RENK.cizgi, opacity: sonuncu || !calis ? 1 : 0.7,
              }}>
                {calis > 0 && sayac > 0 && (
                  <div style={{ height: `${(sayac / calis) * 100}%`, background: c.bg }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        {satirlar.map((r, i) => (
          <div key={r.anahtar} style={{
            flex: 1, minWidth: 0, textAlign: "center",
            fontSize: YAZI.mikro - 1, color: RENK.metinSilik, whiteSpace: "nowrap", overflow: "hidden",
          }}>
            {i === 0 || i === satirlar.length - 1 || i % 3 === 0 ? kisaTarih(r.bas) : ""}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: BOSLUK.m, flexWrap: "wrap", marginTop: BOSLUK.s, fontSize: YAZI.mikro, color: RENK.metinSoluk }}>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: RENK.cizgi, marginRight: 4 }} />planlanan</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: c.mid, marginRight: 4 }} />çalışılan</span>
        <span><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: c.bg, marginRight: 4 }} />sayaçla ölçülen</span>
      </div>
    </Card>
  );
}
