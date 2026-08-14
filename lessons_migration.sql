-- ============================================================
-- Migration: lessons tablosu (Takvim + Ders Planlama)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Sadece public şema — güvenle çalışır, idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS lessons (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT,
  lesson_type  TEXT        NOT NULL DEFAULT 'yuzyuze',   -- 'online' | 'yuzyuze'
  location     TEXT,                                     -- yüzyüze için yer
  meeting_link TEXT,                                     -- online için toplantı linki
  lesson_date  DATE        NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME,
  status       TEXT        NOT NULL DEFAULT 'beklemede', -- beklemede | onaylandi | reddedildi | iptal
  teacher_approved BOOLEAN NOT NULL DEFAULT false,
  student_approved BOOLEAN NOT NULL DEFAULT false,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ders taraflari"            ON lessons;
DROP POLICY IF EXISTS "Veli cocuk derslerini okur" ON lessons;

-- Dersin tarafı olan öğretmen/öğrenci: tam yetki (oluştur, gör, onayla, iptal)
CREATE POLICY "Ders taraflari" ON lessons
  FOR ALL
  USING  (auth.uid() = teacher_id OR auth.uid() = student_id)
  WITH CHECK (auth.uid() = teacher_id OR auth.uid() = student_id);

-- Veli bağlı çocuğun derslerini okuyabilir
CREATE POLICY "Veli cocuk derslerini okur" ON lessons
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = lessons.student_id)
  );

-- Doğrulama:
--   SELECT to_regclass('public.lessons') AS lessons_tablosu;
