import { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../supabase";
import { EXAM_TOPICS as YEDEK_TOPICS } from "./examTopics";
import { STATIK_DERSLER } from "./examSubjects";

// Konu başlıkları veritabanında (exam_topics) tutulur ve öğretmen panelinden
// yönetilir. Tablo henüz oluşturulmadıysa ya da okunamazsa koddaki
// examTopics.js listesine düşülür — uygulama hiçbir durumda konusuz kalmaz.
const TopicsCtx = createContext(null);

// Sınav türleri artık koda gömülü değil, exam_topics verisinden geliyor —
// yeni bir müfredat eklendiğinde arayüz kendiliğinden tanıyor. Sıra ise
// alfabetik olmamalı: öğretmen TYT/AYT'yi en sık kullanıyor, onlar başta
// dursun. Listede olmayan türler sona alfabetik eklenir.
const TUR_SIRASI = ["TYT", "AYT", "LGS", "KPSS", "DGS"];
const turleriSirala = (turler) => [
  ...TUR_SIRASI.filter(t => turler.includes(t)),
  ...turler.filter(t => !TUR_SIRASI.includes(t)).sort((a, b) => a.localeCompare(b, "tr")),
];

// Provider dışında çağrılırsa (ör. izole test) statik listeyle çalışır
const yedekDeger = {
  EXAM_TOPICS: YEDEK_TOPICS,
  examSubjectsOf: (tur) => Object.keys(YEDEK_TOPICS[tur] ?? {}),
  topicsOf: (tur, ders) => YEDEK_TOPICS[tur]?.[ders] ?? [],
  dersleriGetir: (tur) => Object.keys(YEDEK_TOPICS[tur] ?? {}) .length
    ? Object.keys(YEDEK_TOPICS[tur])
    : (STATIK_DERSLER[tur] ?? []),
  sinavTurleri: turleriSirala(Object.keys(YEDEK_TOPICS)),
  tumDersler: () => [...new Set(Object.values(YEDEK_TOPICS).flatMap(d => Object.keys(d)))],
  tumKonular: (ders) => !ders ? [] : [...new Set(
    Object.values(YEDEK_TOPICS).flatMap(d => d[ders] ?? []))],
  dersinTuru: (ders) =>
    Object.keys(YEDEK_TOPICS).find(t => Object.keys(YEDEK_TOPICS[t] ?? {}).includes(ders)) ?? null,
  veritabanindan: false,
  loading: false,
  reload: async () => {},
};

// userId: giriş yapmış kullanıcı. Öğretmense kendi konu tercihleri (hangi
// konuyu gizlediği) yüklenip uygulanır. Öğrencide sorgu boş döner —
// RLS teacher_id = auth.uid() istiyor — ve öğrenci TAM müfredatı görür.
// Bu bilinçli: konuyu gizlemek koçun kendi listesini sadeleştirmesi
// içindir, öğrencinin çalıştığı konuyu seçmesini engellememeli.
export function TopicsProvider({ userId, children }) {
  const [topics,  setTopics]  = useState(null);   // null → yedeğe düş
  const [loading, setLoading] = useState(true);

  const yukle = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("exam_topics")
      .select("id, exam_type, subject, topic, sira, aktif")
      .order("exam_type", { ascending: true })
      .order("subject",   { ascending: true })
      .order("sira",      { ascending: true });

    // Tablo yoksa / boşsa / hata varsa koddaki listeyle devam
    if (error || !data || data.length === 0) {
      setTopics(null);
      setLoading(false);
      return;
    }

    // Öğretmenin kendi tercihleri. Tablo henüz yoksa (migration
    // çalışmadıysa) sessizce boş geçilir, taban değerler kullanılır.
    let tercih = {};
    if (userId) {
      const { data: t } = await supabase
        .from("ogretmen_konu_tercihi")
        .select("exam_topic_id, aktif")
        .eq("teacher_id", userId);
      (t ?? []).forEach(r => { if (r.aktif != null) tercih[r.exam_topic_id] = r.aktif; });
    }

    const harita = {};
    data.forEach(r => {
      // Etkin aktiflik: koçun tercihi varsa o, yoksa tablodaki taban.
      if ((tercih[r.id] ?? r.aktif) === false) return;
      (harita[r.exam_type] ??= {});
      (harita[r.exam_type][r.subject] ??= []).push(r.topic);
    });
    setTopics(harita);
    setLoading(false);
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  const deger = useMemo(() => {
    const aktif = topics ?? YEDEK_TOPICS;
    return {
      EXAM_TOPICS: aktif,
      examSubjectsOf: (tur) => Object.keys(aktif[tur] ?? {}),
      topicsOf: (tur, ders) => aktif[tur]?.[ders] ?? [],
      // Sınav giriş formu için: TYT/AYT müfredattan, LGS/Okul Sınavı sabit listeden
      dersleriGetir: (tur) => {
        const mufredat = Object.keys(aktif[tur] ?? {});
        return mufredat.length > 0 ? mufredat : (STATIK_DERSLER[tur] ?? []);
      },
      sinavTurleri: turleriSirala(Object.keys(aktif)),
      // Bir dersin hangi sınav türünde geçtiğini bilmediğimiz durumlar için
      // (ör. tasks tablosunda exam_type tutulmuyor) tüm türlerin birleşimi.
      tumDersler: () => [...new Set(
        Object.values(aktif).flatMap(d => Object.keys(d))
      )].sort((a, b) => a.localeCompare(b, "tr")),
      tumKonular: (ders) => !ders ? [] : [...new Set(
        Object.values(aktif).flatMap(d => d[ders] ?? [])
      )],
      // Dersin ilk geçtiği sınav türü — kopyalama/düzenlemede sekme seçmek için
      dersinTuru: (ders) =>
        Object.keys(aktif).find(t => Object.keys(aktif[t] ?? {}).includes(ders)) ?? null,
      veritabanindan: topics != null,
      loading,
      reload: yukle,
    };
  }, [topics, loading, yukle]);

  return <TopicsCtx.Provider value={deger}>{children}</TopicsCtx.Provider>;
}

export const useTopics = () => useContext(TopicsCtx) ?? yedekDeger;
