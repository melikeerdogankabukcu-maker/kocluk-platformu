-- ============================================================
-- Migration: öğrenci grupları / sınıflar
--
-- Amaç: öğretmenin öğrencilerini sınıf/gruba ayırıp toplu işlem yapabilmesi
-- (toplu görev atama, toplu program atama).
--
-- Grup bir ÖĞRETMENE aittir; başka öğretmenin grubunu göremez.
-- Gruba yalnızca öğretmenin ONAYLI öğrencisi eklenebilir (teacher_students).
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS ogrenci_gruplari (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad         TEXT        NOT NULL,
  aciklama   TEXT,
  renk       TEXT        NOT NULL DEFAULT '#5B8DEF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gruplar_teacher ON ogrenci_gruplari (teacher_id);

CREATE TABLE IF NOT EXISTS grup_ogrencileri (
  grup_id    UUID NOT NULL REFERENCES ogrenci_gruplari(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (grup_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_grup_ogrenci_student ON grup_ogrencileri (student_id);

-- --- Yardımcı: "bu grup benim grubum mu?" ---
-- SECURITY DEFINER: politika içinden çağrıldığında ogrenci_gruplari'nın kendi
-- RLS'ine takılıp döngüye girmesin.
CREATE OR REPLACE FUNCTION grubum_mu(p_grup UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM ogrenci_gruplari WHERE id = p_grup AND teacher_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION grubum_mu(UUID) TO authenticated;

-- --- RLS: gruplar ---
ALTER TABLE ogrenci_gruplari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ogretmen kendi gruplarini yonetir" ON ogrenci_gruplari;
DROP POLICY IF EXISTS "Ogrenci uyesi oldugu grubu gorur"  ON ogrenci_gruplari;

CREATE POLICY "Ogretmen kendi gruplarini yonetir" ON ogrenci_gruplari
  FOR ALL
  USING      (auth.uid() = teacher_id)
  WITH CHECK (auth.uid() = teacher_id);

-- Öğrenci üyesi olduğu grubun adını görebilsin
CREATE POLICY "Ogrenci uyesi oldugu grubu gorur" ON ogrenci_gruplari
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM grup_ogrencileri
    WHERE grup_id = ogrenci_gruplari.id AND student_id = auth.uid()
  ));

-- --- RLS: grup üyelikleri ---
ALTER TABLE grup_ogrencileri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ogretmen grup uyeligini yonetir" ON grup_ogrencileri;
DROP POLICY IF EXISTS "Ogrenci kendi uyeligini gorur"   ON grup_ogrencileri;

-- Öğretmen yalnızca KENDİ grubuna, yalnızca ONAYLI öğrencisini ekleyebilir
CREATE POLICY "Ogretmen grup uyeligini yonetir" ON grup_ogrencileri
  FOR ALL
  USING      (grubum_mu(grup_id))
  WITH CHECK (grubum_mu(grup_id) AND ogrencim_mi(student_id));

CREATE POLICY "Ogrenci kendi uyeligini gorur" ON grup_ogrencileri
  FOR SELECT
  USING (auth.uid() = student_id);

-- Doğrulama:
--   SELECT g.ad, u.full_name
--   FROM ogrenci_gruplari g
--   LEFT JOIN grup_ogrencileri go ON go.grup_id = g.id
--   LEFT JOIN users u ON u.id = go.student_id
--   ORDER BY g.ad;
