-- ============================================================
-- Migration: student_profiles tablosu
-- Tarih: 2026-06-11
-- Açıklama: Öğrencilerin kişisel, eğitim ve veli bilgileri
-- Supabase Dashboard > SQL Editor'da çalıştır
-- ============================================================

CREATE TABLE IF NOT EXISTS student_profiles (
  id                  UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Kişisel
  birth_date          DATE,
  phone               TEXT,
  -- 1. Veli
  parent_name         TEXT,
  parent_relationship TEXT,        -- 'anne' | 'baba' | 'vasi'
  parent_occupation   TEXT,
  parent_phone        TEXT,
  parent_email        TEXT,
  -- 2. Veli
  parent2_name         TEXT,
  parent2_relationship TEXT,
  parent2_occupation   TEXT,
  parent2_phone        TEXT,
  parent2_email        TEXT,
  -- Eğitim
  school_name         TEXT,
  grade               TEXT,        -- '9' | '10' | '11' | '12' | 'Mezun'
  field_preference    TEXT,        -- 'sayisal' | 'esit_agirlik' | 'sozel'
  -- Meta
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

-- Öğrenci kendi profilini okuyabilir ve yazabilir
CREATE POLICY "Öğrenci kendi profili" ON student_profiles
  FOR ALL
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Öğretmen tüm öğrenci profillerini okuyabilir
CREATE POLICY "Öğretmen profilleri okur" ON student_profiles
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

-- Veli bağlı çocuğun profilini okuyabilir
CREATE POLICY "Veli çocuk profili okur" ON student_profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM family_links
      WHERE parent_id = auth.uid() AND student_id = student_profiles.id
    )
  );

-- updated_at otomatik güncelleme tetikleyicisi
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
