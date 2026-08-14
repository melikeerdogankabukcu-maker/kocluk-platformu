-- ============================================================
-- Migration: exam_results — ders bazlı doğru/yanlış + yanlış konular
-- Sınav analizi konu bazlı hale getirildi.
-- subject_details örnek:
--   {"Matematik": {"dogru": 25, "yanlis": 8, "bos": 7, "net": 23.0,
--                  "yanlis_konular": ["Türev", "İntegral"]}, ...}
-- Mevcut subject_nets kolonu korunur (net özeti oradan da okunur).
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE exam_results
  ADD COLUMN IF NOT EXISTS subject_details JSONB;

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'exam_results' AND column_name = 'subject_details';
