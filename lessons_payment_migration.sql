-- ============================================================
-- Migration: lessons — ders tamamlama + ödeme takibi
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS completed      BOOLEAN NOT NULL DEFAULT false,
  -- 'odenmedi' | 'bildirildi' (veli ödedim dedi) | 'odendi' (öğretmen onayladı)
  ADD COLUMN IF NOT EXISTS payment_status TEXT    NOT NULL DEFAULT 'odenmedi';

-- Veli, çocuğunun derslerini güncelleyebilsin (ödeme bildirimi için).
-- (Frontend yalnızca payment_status alanını değiştirir.)
DROP POLICY IF EXISTS "Veli cocuk derslerini gunceller" ON lessons;
CREATE POLICY "Veli cocuk derslerini gunceller" ON lessons
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = lessons.student_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = lessons.student_id)
  );

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'lessons' AND column_name IN ('completed','payment_status');
