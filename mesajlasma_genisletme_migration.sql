-- ============================================================
-- MESAJLAŞMA KAPSAMI: VELİ ↔ ÇOCUK ve KOÇ ↔ KOÇ
--
-- ── EKSİKLER ────────────────────────────────────────────────────
-- mesajlasabilir_mi() bugüne kadar yalnızca iki ilişkiyi tanıyordu:
--   öğretmen ↔ onaylı öğrencisi
--   öğretmen ↔ öğrencisinin velisi
-- Dolayısıyla veli kendi çocuğuna yazamıyordu (en doğal yazışma) ve
-- koçlar birbirine yazamıyordu.
--
-- Mevcut iki dal AYNEN korunuyor, üzerine iki dal ekleniyor.
--
-- ── PARAMETRE ADI DEĞİŞMİYOR ────────────────────────────────────
-- Fonksiyonun parametresi p_kisi ve öyle kalıyor. CREATE OR REPLACE
-- parametre adını değiştiremez (42P13) ve bu fonksiyon messages'ın
-- INSERT politikasında kullanıldığı için DROP etmek o politikayı da
-- götürürdü.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.mesajlasabilir_mi(p_kisi UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_kisi IS NOT NULL AND p_kisi <> auth.uid() AND (
    EXISTS (
      -- öğretmen ↔ onaylı öğrencisi (iki yön de)
      SELECT 1 FROM teacher_students
      WHERE durum = 'onaylandi'
        AND ((teacher_id = auth.uid() AND student_id = p_kisi)
          OR (student_id  = auth.uid() AND teacher_id = p_kisi))
    )
    OR EXISTS (
      -- öğretmen ↔ öğrencisinin velisi (iki yön de)
      SELECT 1
      FROM teacher_students ts
      JOIN family_links fl ON fl.student_id = ts.student_id
      WHERE ts.durum = 'onaylandi'
        AND ((ts.teacher_id = auth.uid() AND fl.parent_id  = p_kisi)
          OR (fl.parent_id  = auth.uid() AND ts.teacher_id = p_kisi))
    )
    OR EXISTS (
      -- YENİ: veli ↔ kendi çocuğu (iki yön de)
      -- Araya öğretmen girmesine gerek yok; bağ doğrudan family_links'te.
      SELECT 1 FROM family_links
      WHERE (parent_id  = auth.uid() AND student_id = p_kisi)
         OR (student_id = auth.uid() AND parent_id  = p_kisi)
    )
    OR (
      -- YENİ: koç ↔ koç (yönetici dahil)
      -- Personel kendi arasında yazışabilsin. Karşı tarafın ONAYLI
      -- olması şart: onay bekleyen ya da reddedilmiş bir hesaba mesaj
      -- gitmemeli.
      EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid() AND role IN ('teacher', 'admin')
      )
      AND EXISTS (
        SELECT 1 FROM users
        WHERE id = p_kisi AND role IN ('teacher', 'admin')
          AND onay_durumu = 'onaylandi'
      )
    )
  );
$$;

-- CREATE OR REPLACE mevcut yetkileri korur; yine de dosya tek başına
-- yeniden oynatılabilsin diye tekrar yazılıyor.
REVOKE ALL ON FUNCTION public.mesajlasabilir_mi(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesajlasabilir_mi(UUID) TO authenticated;


-- ============================================================
-- DOĞRULAMA
--
-- Kural tablosu (kimin kime yazabildiği), auth.uid() yerine kendi
-- kullanıcı id'nizle:
--
--   SELECT u.full_name, u.role, mesajlasabilir_mi(u.id)
--   FROM users u WHERE u.id <> auth.uid() ORDER BY u.role;
--
-- Bu sorgu SQL Editor'den superuser olarak çalıştırılırsa auth.uid()
-- NULL döner ve her satır false çıkar — yanıltıcıdır. Asıl doğrulama
-- uygulamadan yapılmalı: veli panelinde çocuğun, koç panelinde diğer
-- koçların Mesajlar kartında görünmesi.
--
-- NOT: Bu fonksiyon YALNIZCA yazma iznini belirler. Kişi listeleri
-- panellerde ayrı ayrı kuruluyor; ikisi birbirinden habersiz kalırsa
-- "izin var ama liste boş" durumu doğar — veli↔öğretmen hatası tam
-- olarak buydu. Bu migration ile birlikte üç panelin listesi de
-- güncellendi.
-- ============================================================
