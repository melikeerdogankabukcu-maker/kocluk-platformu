-- ============================================================
-- Migration: tasks tablosuna teslim tarihi (due_date)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_date DATE;

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'tasks' AND column_name = 'due_date';
