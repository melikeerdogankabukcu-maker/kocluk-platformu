import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabase";

// Kullanıcının bildirimlerini yükler ve Supabase Realtime ile canlı dinler.
// notifications tablosu yoksa (migration çalışmadıysa) sessizce devre dışı kalır.
export function useNotifications(userId) {
  const [bildirimler, setBildirimler] = useState([]);
  const [etkin, setEtkin] = useState(true);   // tablo mevcut mu
  const kanalRef = useRef(null);

  const yukle = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) { setEtkin(false); return; }
    setBildirimler(data ?? []);
  }, [userId]);

  useEffect(() => { yukle(); }, [yukle]);

  // Canlı dinleme — yeni bildirim geldiğinde listeye ekle
  useEffect(() => {
    if (!userId || !etkin) return;
    const kanal = supabase
      .channel(`bildirim:${userId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        setBildirimler(b => [payload.new, ...b].slice(0, 30));
      })
      .subscribe();
    kanalRef.current = kanal;
    return () => { supabase.removeChannel(kanal); };
  }, [userId, etkin]);

  const okunmamis = bildirimler.filter(b => !b.okundu).length;

  const okunduIsaretle = async (id) => {
    setBildirimler(b => b.map(x => (x.id === id ? { ...x, okundu: true } : x)));
    await supabase.from("notifications").update({ okundu: true }).eq("id", id);
  };

  const hepsiniOkunduYap = async () => {
    const okunmamisIdler = bildirimler.filter(b => !b.okundu).map(b => b.id);
    if (okunmamisIdler.length === 0) return;
    setBildirimler(b => b.map(x => ({ ...x, okundu: true })));
    await supabase.from("notifications").update({ okundu: true }).in("id", okunmamisIdler);
  };

  const sil = async (id) => {
    setBildirimler(b => b.filter(x => x.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  return { bildirimler, okunmamis, etkin, yukle, okunduIsaretle, hepsiniOkunduYap, sil };
}
