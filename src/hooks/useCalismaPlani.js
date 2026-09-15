import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { tarihMetni, hucreBloklari, yeniSira, yenidenNumarala, saateGoreHedef } from "../lib/calismaPlani";

// Bir öğrencinin bir haftalık çalışma planı.
//
// ── İYİMSER GÜNCELLEME ──────────────────────────────────────────
// Sürükle-bırakta blok parmağın bıraktığı yerde HEMEN görünmeli; sunucu
// yanıtını beklemek, bloğun bir an eski yerine sıçrayıp sonra yeniye
// gitmesi demekti. Değişiklik önce ekranda yapılıyor, yazma başarısız
// olursa plan sunucudan yeniden okunuyor — ekran asla sunucuyla
// uyuşmayan bir durumda kalmıyor.
//
// Sayaç ve tamamlama İYİMSER DEĞİL: ikisi de sunucuda hesaplanan değer
// döndürüyor (ölçülen dakika, açılan test). Ekrana tahmin yazıp sonra
// düzeltmek, öğrencinin "45 dk" görüp ardından "32 dk"ya düşmesi demekti.
export function useCalismaPlani(studentId, pazartesi) {
  const [plan, setPlan]         = useState(null);
  const [bloklar, setBloklar]   = useState([]);
  const [testler, setTestler]   = useState({});     // blok_id -> test
  const [yukleniyor, setYukleniyor] = useState(true);
  const [etkin, setEtkin]       = useState(true);   // tablo var mı
  // Sunucu saati - cihaz saati (ms). Sayaç süresi ekranda bununla akıyor.
  const [saatFarki, setSaatFarki] = useState(0);
  const hafta = pazartesi ? tarihMetni(pazartesi) : null;

  // Hızlı hafta değişiminde geç gelen eski yanıt yeni haftanın üstüne
  // yazılmasın: her istek bir sayı alıyor, yalnızca sonuncusu uygulanıyor.
  const istekNo = useRef(0);

  const yukle = useCallback(async () => {
    if (!studentId || !hafta) { setPlan(null); setBloklar([]); setTestler({}); setYukleniyor(false); return; }
    const no = ++istekNo.current;
    setYukleniyor(true);

    const { data: p, error } = await supabase
      .from("calisma_planlari").select("*")
      .eq("student_id", studentId).eq("hafta_basi", hafta)
      .maybeSingle();

    if (no !== istekNo.current) return;
    if (error) {
      // 42P01 / PGRST205: tablo yok (migration çalışmadı). Kart gizleniyor,
      // hata gösterilmiyor — panelin geri kalanı etkilenmesin.
      if (error.code === "42P01" || error.code === "PGRST205") setEtkin(false);
      else console.error("[Calisma plani]", error);
      setPlan(null); setBloklar([]); setTestler({}); setYukleniyor(false);
      return;
    }

    setPlan(p ?? null);
    if (p) {
      const { data: b } = await supabase
        .from("calisma_bloklari").select("*").eq("plan_id", p.id);
      if (no !== istekNo.current) return;
      const liste = b ?? [];
      setBloklar(liste);

      // Bloklara bağlı testler. blok_id sütunu yoksa (ikinci migration
      // çalışmadıysa) sorgu hata verir; o zaman testsiz devam ediliyor.
      if (liste.length) {
        const { data: t, error: tHata } = await supabase
          .from("test_sessions")
          .select("id, blok_id, question_count, correct_count, yanlis_count, dosyalar, file_url, file_name, created_at")
          .in("blok_id", liste.map(x => x.id));
        if (no !== istekNo.current) return;
        setTestler(tHata ? {} : Object.fromEntries((t ?? []).map(x => [x.blok_id, x])));
      } else {
        setTestler({});
      }
    } else {
      setBloklar([]); setTestler({});
    }
    setYukleniyor(false);
  }, [studentId, hafta]);

  useEffect(() => { yukle(); }, [yukle]);

  // Planı oluştur — kopyala=true ise en son planın blokları gelir.
  // Tek işlem sunucuda (calisma_plani_olustur).
  const olustur = async (kopyala = true) => {
    const { hata } = await calistir(
      supabase.rpc("calisma_plani_olustur", { p_student: studentId, p_hafta: hafta, p_kopyala: kopyala }),
      "Calisma plani olusturma"
    );
    if (!hata) await yukle();
    return { hata };
  };

  // Hücrede nereye girsin: saati varsa saatine göre, yoksa sona.
  const yerlesimSirasi = (liste, gun, dilim, saat, haricId = null) => {
    const hucre = hucreBloklari(liste.filter(b => b.id !== haricId), gun, dilim);
    return yeniSira(hucre, saateGoreHedef(hucre, saat)).sira;
  };

  const blokEkle = async (alanlar) => {
    if (!plan) return { hata: true };
    const sira = yerlesimSirasi(bloklar, alanlar.gun, alanlar.dilim, alanlar.baslangic_saati);
    const { veri, hata } = await calistir(
      supabase.from("calisma_bloklari")
        .insert({ ...alanlar, plan_id: plan.id, sira }).select().single(),
      "Blok ekleme"
    );
    if (hata) return { hata };
    setBloklar(l => [...l, veri]);
    return {};
  };

  const blokGuncelle = async (id, alanlar) => {
    const eski = bloklar.find(b => b.id === id);
    if (!eski) return { hata: true };

    // Hücre ya da saat değiştiyse blok yeni yerine (saatine göre) oturuyor.
    // Yalnızca başlık/not değiştiyse sırasına dokunulmuyor: koçun
    // sürüklediği yer korunuyor.
    const gun   = alanlar.gun   ?? eski.gun;
    const dilim = alanlar.dilim ?? eski.dilim;
    const saat  = "baslangic_saati" in alanlar ? alanlar.baslangic_saati : eski.baslangic_saati;
    const yerDegisti = gun !== eski.gun || dilim !== eski.dilim
      || (saat ?? null) !== (eski.baslangic_saati ? String(eski.baslangic_saati).slice(0, 5) : null);
    const guncel = yerDegisti
      ? { ...alanlar, sira: yerlesimSirasi(bloklar, gun, dilim, saat, id) }
      : alanlar;

    setBloklar(l => l.map(b => (b.id === id ? { ...b, ...guncel } : b)));
    const { hata } = await calistir(
      supabase.from("calisma_bloklari").update(guncel).eq("id", id),
      "Blok guncelleme"
    );
    if (hata) await yukle();
    return { hata };
  };

  const blokSil = async (id) => {
    const onceki = bloklar;
    setBloklar(l => l.filter(b => b.id !== id));
    const { hata } = await calistir(
      supabase.from("calisma_bloklari").delete().eq("id", id),
      "Blok silme"
    );
    if (hata) setBloklar(onceki);
    return { hata };
  };

  // Sürükle-bırak. hedefId verilirse o bloğun ÖNÜNE, yoksa hücre sonuna.
  const tasi = async (id, gun, dilim, hedefId = null) => {
    const blok = bloklar.find(b => b.id === id);
    if (!blok || hedefId === id) return {};

    const hedefHucre = hucreBloklari(bloklar.filter(b => b.id !== id), gun, dilim);
    const { sira, yenidenNumarala: numarala } = yeniSira(hedefHucre, hedefId);

    // Yeri değişmediyse yazma yok
    if (blok.gun === gun && blok.dilim === dilim && !numarala) {
      const sirali = hucreBloklari(bloklar, gun, dilim);
      const i = sirali.findIndex(b => b.id === id);
      const sonrakiId = sirali[i + 1]?.id ?? null;
      if (sonrakiId === hedefId) return {};
    }

    if (!numarala) {
      setBloklar(l => l.map(b => (b.id === id ? { ...b, gun, dilim, sira } : b)));
      const { hata } = await calistir(
        supabase.from("calisma_bloklari").update({ gun, dilim, sira }).eq("id", id),
        "Blok tasima"
      );
      if (hata) await yukle();
      return { hata };
    }

    // Aralık tükendi: hücreyi baştan numarala. Taşınan blok, hedefin
    // önüne yerleştirilmiş listeyle birlikte yazılıyor.
    const i = hedefId ? hedefHucre.findIndex(b => b.id === hedefId) : hedefHucre.length;
    const yeniDizi = [...hedefHucre.slice(0, i), { ...blok, gun, dilim }, ...hedefHucre.slice(i)];
    const numarali = yeniDizi.map((b, k) => ({ ...b, sira: (k + 1) * 1000 }));
    const degisen = [
      ...yenidenNumarala(yeniDizi),
      // Taşınan blok yer değiştirdiği için sırası aynı kalsa bile yazılmalı
      numarali.find(b => b.id === id),
    ].filter((b, k, a) => b && a.findIndex(x => x.id === b.id) === k);

    const harita = new Map(numarali.map(b => [b.id, b]));
    setBloklar(l => l.map(b => (harita.has(b.id) ? harita.get(b.id) : b)));

    const sonuclar = await Promise.all(degisen.map(b =>
      supabase.from("calisma_bloklari")
        .update({ gun: b.gun, dilim: b.dilim, sira: b.sira }).eq("id", b.id)
    ));
    const hata = sonuclar.find(r => r.error)?.error;
    if (hata) { console.error("[Blok yeniden numaralama]", hata); await yukle(); }
    return { hata };
  };

  // ── SAYAÇ ─────────────────────────────────────────────────────
  // Başlangıç anı sunucuda tutuluyor; uygulama kapansa da sayaç sürüyor.
  // 'basla' öğrencinin açık başka sayacını durdurduğu için yanıt sonrası
  // bütün bloklar yeniden okunuyor — yalnız bu bloğu güncellemek, durdurulan
  // öbür bloğu ekranda hâlâ işliyor gösterirdi.
  const sayac = async (id, islem) => {
    const { veri, hata } = await calistir(
      supabase.rpc("calisma_sayaci", { p_blok: id, p_islem: islem }),
      islem === "basla" ? "Sayac baslatma" : "Sayac durdurma"
    );
    if (hata) return { hata };
    if (veri?.simdi) setSaatFarki(new Date(veri.simdi).getTime() - Date.now());
    await yukle();
    return { kirpildi: !!veri?.kirpildi, eklenen: veri?.eklenen_dk ?? 0 };
  };

  // ── TAMAMLA ───────────────────────────────────────────────────
  // İşaret + bildirilen süre + (varsa) test sonucu TEK sunucu işleminde.
  // soru boş gönderilirse var olan teste dokunulmuyor.
  // dosyalar null: görsellere dokunulmuyor. Dizi: testin görselleri
  // bununla DEĞİŞTİRİLİYOR (kaldırılanlar dahil).
  const tamamla = async (id, { yapildi, calisilanDk = null, soru = null, dogru = null, yanlis = null, dosyalar = null }) => {
    const govde = {
      p_blok: id, p_yapildi: yapildi,
      p_calisilan_dk: calisilanDk, p_soru: soru, p_dogru: dogru, p_yanlis: yanlis,
    };
    // Parametre yalnızca gerektiğinde gönderiliyor: görselsiz kayıt, onay
    // migration'ı henüz çalışmamış veritabanında da (6 parametreli eski
    // fonksiyonla) çalışmaya devam etsin.
    if (dosyalar !== null) govde.p_dosyalar = dosyalar;
    const { hata } = await calistir(
      supabase.rpc("calisma_blogu_tamamla", govde),
      "Blok tamamlama"
    );
    if (!hata) await yukle();
    return { hata };
  };

  // ── KOÇ ONAYI ─────────────────────────────────────────────────
  // Görevdeki doğrulamanın aynısı. Onay bloğu "yapıldı"ya çeker (koç
  // defteri elde gördüyse öğrenci işaretlememiş olabilir); iade
  // "yapılmadı"ya düşürür ki öğrencinin panosunda yeniden açık görünsün.
  // Onay damgası (kim, ne zaman) sunucuda yazılıyor.
  const onayla = async (id, karar, not = null) => {
    const onay = karar === "onaylandi";
    const alanlar = { koc_onayi: karar, onay_notu: not?.trim() || null, yapildi: onay };
    const onceki = bloklar;
    setBloklar(l => l.map(b => (b.id === id ? { ...b, ...alanlar } : b)));
    const { hata } = await calistir(
      supabase.from("calisma_bloklari").update(alanlar).eq("id", id),
      onay ? "Blok onayi" : "Blok iadesi"
    );
    if (hata) setBloklar(onceki);
    else await yukle();
    return { hata };
  };

  return {
    plan, bloklar, testler, yukleniyor, etkin, saatFarki,
    yukle, olustur, blokEkle, blokGuncelle, blokSil, tasi, sayac, tamamla, onayla,
  };
}
