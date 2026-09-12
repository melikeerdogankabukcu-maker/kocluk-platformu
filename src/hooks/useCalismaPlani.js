import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { tarihMetni, hucreBloklari, yeniSira, yenidenNumarala } from "../lib/calismaPlani";

// Bir öğrencinin bir haftalık çalışma planı.
//
// ── İYİMSER GÜNCELLEME ──────────────────────────────────────────
// Sürükle-bırakta blok parmağın bıraktığı yerde HEMEN görünmeli; sunucu
// yanıtını beklemek, bloğun bir an eski yerine sıçrayıp sonra yeniye
// gitmesi demekti. Değişiklik önce ekranda yapılıyor, yazma başarısız
// olursa plan sunucudan yeniden okunuyor — ekran asla sunucuyla
// uyuşmayan bir durumda kalmıyor.
export function useCalismaPlani(studentId, pazartesi) {
  const [plan, setPlan]         = useState(null);
  const [bloklar, setBloklar]   = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [etkin, setEtkin]       = useState(true);   // tablo var mı
  const hafta = pazartesi ? tarihMetni(pazartesi) : null;

  // Hızlı hafta değişiminde geç gelen eski yanıt yeni haftanın üstüne
  // yazılmasın: her istek bir sayı alıyor, yalnızca sonuncusu uygulanıyor.
  const istekNo = useRef(0);

  const yukle = useCallback(async () => {
    if (!studentId || !hafta) { setPlan(null); setBloklar([]); setYukleniyor(false); return; }
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
      setPlan(null); setBloklar([]); setYukleniyor(false);
      return;
    }

    setPlan(p ?? null);
    if (p) {
      const { data: b } = await supabase
        .from("calisma_bloklari").select("*").eq("plan_id", p.id);
      if (no !== istekNo.current) return;
      setBloklar(b ?? []);
    } else {
      setBloklar([]);
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

  const blokEkle = async (alanlar) => {
    if (!plan) return { hata: true };
    const { sira } = yeniSira(hucreBloklari(bloklar, alanlar.gun, alanlar.dilim), null);
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

    // Gün ya da dilim formdan değiştiyse blok hedef hücrenin SONUNA gider;
    // eski hücredeki sırasını yeni hücrede taşımak anlamsız olurdu.
    let ek = {};
    if ((alanlar.gun ?? eski.gun) !== eski.gun || (alanlar.dilim ?? eski.dilim) !== eski.dilim) {
      const hedef = hucreBloklari(bloklar.filter(b => b.id !== id), alanlar.gun ?? eski.gun, alanlar.dilim ?? eski.dilim);
      ek = { sira: yeniSira(hedef, null).sira };
    }
    const guncel = { ...alanlar, ...ek };

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

  const yapildiCevir = async (id) => {
    const blok = bloklar.find(b => b.id === id);
    if (!blok) return {};
    const yeni = !blok.yapildi;
    setBloklar(l => l.map(b => (b.id === id ? { ...b, yapildi: yeni } : b)));
    const { hata } = await calistir(
      supabase.from("calisma_bloklari").update({ yapildi: yeni }).eq("id", id),
      "Blok isaretleme"
    );
    if (hata) await yukle();
    return { hata };
  };

  return {
    plan, bloklar, yukleniyor, etkin,
    yukle, olustur, blokEkle, blokGuncelle, blokSil, tasi, yapildiCevir,
  };
}
