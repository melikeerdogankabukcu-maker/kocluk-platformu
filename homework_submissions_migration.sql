-- ============================================================
-- Migration: homework_submissions tablosu + Storage bucket
-- Tarih: 2026-06-11
-- Açıklama: Öğrenci ödev görsel yüklemeleri ve öğretmen kontrolü
-- Supabase Dashboard > SQL Editor'da çalıştır
-- ============================================================

-- 1. Storage bucket oluştur (homework)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'homework',
  'homework',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage RLS politikaları
-- Öğrenci kendi klasörüne yükleyebilir: homework/{student_id}/{task_id}
CREATE POLICY "Öğrenci ödev yükleyebilir" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'homework'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- Herkese açık okuma (public bucket)
CREATE POLICY "Ödev dosyaları okunabilir" ON storage.objects
  FOR SELECT USING (bucket_id = 'homework');

-- Öğrenci kendi dosyasını güncelleyebilir (yeniden yükleme)
CREATE POLICY "Öğrenci ödevini güncelleyebilir" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'homework'
    AND auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- 3. homework_submissions tablosu
CREATE TABLE IF NOT EXISTS homework_submissions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url     TEXT        NOT NULL,
  file_name    TEXT,
  -- 'beklemede' | 'onaylandi' | 'iade_edildi'
  status       TEXT        NOT NULL DEFAULT 'beklemede',
  teacher_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  UNIQUE(task_id)  -- Her görev için tek aktif gönderim (upsert ile yenilenir)
);

-- 4. RLS
ALTER TABLE homework_submissions ENABLE ROW LEVEL SECURITY;

-- Öğrenci kendi gönderimlerini okuyabilir ve oluşturabilir/güncelleyebilir
CREATE POLICY "Öğrenci kendi gönderimleri" ON homework_submissions
  FOR ALL
  USING  (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Öğretmen tüm gönderimleri okuyabilir ve güncelleyebilir (onay/iade)
CREATE POLICY "Öğretmen gönderimleri yönetir" ON homework_submissions
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );
