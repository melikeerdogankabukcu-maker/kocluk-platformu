-- ============================================================
-- Migration: tasks tablosuna konu (topic) kolonu
-- Konu ilerlemesi artık elle girilmiyor; görevlerden otomatik
-- hesaplanıyor. Bunun için görevin konusu ayrı kolonda tutulmalı.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS topic TEXT;

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'tasks' AND column_name = 'topic';
