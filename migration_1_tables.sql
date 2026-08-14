-- ============================================================
-- ADIM 1/2: public şema tabloları (student_profiles + homework_submissions)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Bu script storage'a DOKUNMAZ, bu yüzden güvenle çalışır.
-- Tekrar çalıştırılabilir (idempotent).
-- ============================================================

-- ---------- student_profiles ----------
CREATE TABLE IF NOT EXISTS student_profiles (
  id                  UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  birth_date          DATE,
  phone               TEXT,
  parent_name         TEXT,
  parent_relationship TEXT,
  parent_occupation   TEXT,
  parent_phone        TEXT,
  parent_email        TEXT,
  parent2_name         TEXT,
  parent2_relationship TEXT,
  parent2_occupation   TEXT,
  parent2_phone        TEXT,
  parent2_email        TEXT,
  school_name         TEXT,
  grade               TEXT,
  field_preference    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS parent2_name         TEXT,
  ADD COLUMN IF NOT EXISTS parent2_relationship TEXT,
  ADD COLUMN IF NOT EXISTS parent2_occupation   TEXT,
  ADD COLUMN IF NOT EXISTS parent2_phone        TEXT,
  ADD COLUMN IF NOT EXISTS parent2_email        TEXT;

ALTER TABLE student_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Öğrenci kendi profili"    ON student_profiles;
DROP POLICY IF EXISTS "Öğretmen profilleri okur" ON student_profiles;
DROP POLICY IF EXISTS "Veli çocuk profili okur"  ON student_profiles;

CREATE POLICY "Öğrenci kendi profili" ON student_profiles
  FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Öğretmen profilleri okur" ON student_profiles
  FOR SELECT USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'));

CREATE POLICY "Veli çocuk profili okur" ON student_profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = student_profiles.id)
  );

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_student_profiles_updated_at ON student_profiles;
CREATE TRIGGER trg_student_profiles_updated_at
  BEFORE UPDATE ON student_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------- homework_submissions ----------
CREATE TABLE IF NOT EXISTS homework_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url     TEXT        NOT NULL,
  file_name    TEXT,
  status       TEXT        NOT NULL DEFAULT 'beklemede',
  teacher_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  UNIQUE(task_id)
);

ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Öğrenci kendi gönderimleri"    ON homework_submissions;
DROP POLICY IF EXISTS "Öğretmen gönderimleri yönetir" ON homework_submissions;

CREATE POLICY "Öğrenci kendi gönderimleri" ON homework_submissions
  FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Öğretmen gönderimleri yönetir" ON homework_submissions
  FOR ALL USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'));

-- Doğrulama:
--   SELECT 'student_profiles' AS t, count(*) FROM student_profiles
--   UNION ALL SELECT 'homework_submissions', count(*) FROM homework_submissions;
