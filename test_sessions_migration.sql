-- ============================================================
-- Migration: test_sessions — görsel ekleme + öğretmen erişimi
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- 1. Çözüm görseli kolonları
ALTER TABLE test_sessions
  ADD COLUMN IF NOT EXISTS file_url  TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT;

-- 2. Öğretmen tüm test kayıtlarını okuyabilsin (bildirim kartı için)
DROP POLICY IF EXISTS "Ogretmen testleri okur" ON test_sessions;
CREATE POLICY "Ogretmen testleri okur" ON test_sessions
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'));

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'test_sessions' AND column_name IN ('file_url','file_name');
