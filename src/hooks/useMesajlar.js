import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";

// Kullanıcının tüm yazışmaları. Sohbet başına ayrı sorgu YOK: kişinin
// gönderdiği ve aldığı mesajların hepsi tek seferde çekilip karşı tarafa
// göre gruplanıyor. Mesaj hacmi bir koçluk platformunda küçük; sohbet
// başına sorgu açmak hem daha yavaş hem gereksiz karmaşık olurdu.
//
// Tablo yoksa (migration çalışmadıysa) etkin=false döner ve çağıran
// bileşen kendini gizler — diğer özelliklerdeki desenin aynısı.
export function useMesajlar(userId) {
  const [mesajlar, setMesajlar] = useState([]);
  const [etkin,    setEtkin]    = useState(true);
  const [loading,  setLoading]  = useState(true);
  const kanalRef = useRef(null);

  const yukle = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    const { veri, hata } = await calistir(
      supabase.from("messages")
        .select("*")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: true }),
      "Mesajlari yukleme", { sessiz: true }
    );
    if (hata) { setEtkin(false); setLoading(false); return; }
    setMesajlar(veri ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  // Canlı dinleme. Realtime filtresi tek kolona bakabildiği için gönderilen
  // ve alınan mesajlar iki ayrı aboneliğe ayrıldı; "or" filtresi desteklenmiyor.
  useEffect(() => {
    if (!userId || !etkin) return;
    const kanal = supabase
      .channel(`mesaj:${userId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `receiver_id=eq.${userId}`,
      }, (p) => setMesajlar(m => (m.some(x => x.id === p.new.id) ? m : [...m, p.new])))
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `sender_id=eq.${userId}`,
      }, (p) => setMesajlar(m => (m.some(x => x.id === p.new.id) ? m : [...m, p.new])))
      // Okundu bilgisi GÖNDERENE ulaşsın. Yalnızca INSERT dinleniyordu:
      // alıcı mesajı okuyunca gönderen "iletildi" görmeye devam ediyor,
      // ancak sayfayı yenileyince "okundu" oluyordu.
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "messages",
        filter: `sender_id=eq.${userId}`,
      }, (p) => setMesajlar(m => m.map(x => (x.id === p.new.id ? p.new : x))))
      // Silinen mesaj karşı tarafın ekranından da kalksın
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "messages",
        filter: `receiver_id=eq.${userId}`,
      }, (p) => setMesajlar(m => m.filter(x => x.id !== p.old.id)))
      .subscribe();
    kanalRef.current = kanal;
    return () => { supabase.removeChannel(kanal); kanalRef.current = null; };
  }, [userId, etkin]);

  // Karşı taraf kimliğine göre grupla: { kisiId: [mesaj, ...] }
  const sohbetler = {};
  mesajlar.forEach(m => {
    const karsi = m.sender_id === userId ? m.receiver_id : m.sender_id;
    (sohbetler[karsi] ??= []).push(m);
  });

  const okunmamisSayisi = (kisiId) =>
    (sohbetler[kisiId] ?? []).filter(m => m.receiver_id === userId && !m.is_read).length;

  const toplamOkunmamis = mesajlar
    .filter(m => m.receiver_id === userId && !m.is_read).length;

  const gonder = async (aliciId, metin, dosyalar = []) => {
    const icerik = (metin ?? "").trim();
    // Metin BOŞ olabilir: yalnızca görsel gönderilebilmeli ("şu soruya
    // bak" diye bir şey yazmadan fotoğraf atmak). İkisi birden boşsa
    // gönderilmiyor — veritabanı kısıtı da aynısını söylüyor.
    if ((!icerik && dosyalar.length === 0) || !aliciId) return { hata: true };
    // İyimser ekleme YOK: realtime aboneliği kendi gönderdiğimizi de
    // getiriyor, elle eklersek mesaj iki kez görünürdü.
    const { hata } = await calistir(
      supabase.from("messages").insert({
        sender_id: userId, receiver_id: aliciId,
        content: icerik, dosyalar,
      }),
      "Mesaj gonderme"
    );
    return { hata };
  };

  const okunduIsaretle = async (kisiId) => {
    const okunmamis = (sohbetler[kisiId] ?? [])
      .filter(m => m.receiver_id === userId && !m.is_read)
      .map(m => m.id);
    if (okunmamis.length === 0) return;
    setMesajlar(m => m.map(x => (okunmamis.includes(x.id) ? { ...x, is_read: true } : x)));
    const { hata } = await calistir(
      supabase.from("messages").update({ is_read: true }).in("id", okunmamis),
      "Mesaji okundu isaretleme", { sessiz: true }
    );
    if (hata) yukle();
  };

  const sil = async (mesajId) => {
    setMesajlar(m => m.filter(x => x.id !== mesajId));
    const { hata } = await calistir(
      supabase.from("messages").delete().eq("id", mesajId),
      "Mesaj silme"
    );
    if (hata) yukle();
  };

  return { sohbetler, okunmamisSayisi, toplamOkunmamis, etkin, loading,
           yukle, gonder, okunduIsaretle, sil };
}
