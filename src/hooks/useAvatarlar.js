import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { avatarSimgesi } from "../lib/avatarlar";

// Başkalarının seçtiği avatarlar: { id -> simge }.
//
// ── NEDEN AYRI BİR KANCA ────────────────────────────────────────
// Kişinin KENDİ tercihi `TercihContext`ten geliyor; o bağlam tek bir
// kullanıcı için kurulu (tema da ona bağlı). Koç panelinde ise ONLARCA
// öğrencinin avatarı gerekiyor — her biri için bağlam kurulamaz.
// Burada tek sorguyla hepsi okunuyor.
//
// Veritabanı izni baştan vardı (`Tercihi kocu ve velisi okur`), eksik
// olan yalnızca bu ekranların tercihi yüklemesiydi: öğrenci avatarını
// seçiyor, kendi panelinde görüyor, koçu görmüyordu.
//
// ── TABLO YOKSA EKRAN DÜŞMÜYOR ──────────────────────────────────
// Hata yutuluyor ve boş harita dönüyor; avatar görünmüyor, ekranın
// gerisi çalışıyor. TercihContext'teki kararın aynısı.
export default function useAvatarlar(idler) {
  const [simgeler, setSimgeler] = useState({});

  // Bağımlılık dizinin KENDİSİ değil içeriği: her render'da yeni bir
  // dizi geliyor (students.map(...)), referansa bakılsa sorgu sonsuz
  // tekrarlanırdı.
  const anahtar = (idler ?? []).filter(Boolean).sort().join(",");

  useEffect(() => {
    let iptal = false;
    const liste = anahtar ? anahtar.split(",") : [];
    if (liste.length === 0) { setSimgeler({}); return; }

    calistir(
      supabase.from("kullanici_tercihleri").select("id, avatar").in("id", liste),
      "Avatar tercihleri", { sessiz: true }
    ).then(({ veri }) => {
      if (iptal) return;
      const harita = {};
      (veri ?? []).forEach(t => {
        const simge = avatarSimgesi(t.avatar);
        if (simge) harita[t.id] = simge;
      });
      setSimgeler(harita);
    });

    return () => { iptal = true; };
  }, [anahtar]);

  return simgeler;
}
