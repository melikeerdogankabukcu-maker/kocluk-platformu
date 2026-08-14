-- ============================================================
-- Ek Migration: student_profiles tablosuna 2. veli alanları
-- Tarih: 2026-06-11
-- Not: student_profiles_migration.sql'i daha önce çalıştırdıysan
--      bu dosyayı da SQL Editor'da çalıştır.
--      İlk kez kuruyorsan sadece güncel migration.sql yeterli.
-- ============================================================

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS parent2_name         TEXT,
  ADD COLUMN IF NOT EXISTS parent2_relationship TEXT,  -- 'anne' | 'baba' | 'vasi'
  ADD COLUMN IF NOT EXISTS parent2_occupation   TEXT,
  ADD COLUMN IF NOT EXISTS parent2_phone        TEXT,
  ADD COLUMN IF NOT EXISTS parent2_email        TEXT;
