-- ============================================================
-- ÖDEVE BİRDEN FAZLA DOSYA
--
-- ── DURUM ───────────────────────────────────────────────────────
-- homework_submissions tek bir dosya tutuyordu (file_url + file_name)
-- ve storage yolu `{ogrenci}/{gorev}` biçimindeydi — SABİT. Yani ikinci
-- bir dosya yüklenmek istendiğinde birincinin ÜSTÜNE yazılıyordu;
-- öğrenci iki sayfalık bir ödevi teslim edemiyordu.
--
-- ── ÇÖZÜM ───────────────────────────────────────────────────────
-- dosyalar JSONB dizisi: [{ "url": ..., "ad": ... }, ...]
--
-- Ayrı bir tablo yerine dizi tercih edildi: liste küçük, tek bir
-- gönderime ait, hiçbir zaman tek başına sorgulanmıyor ve her zaman
-- gönderimle birlikte okunuyor. Ayrı tablo dört yeni RLS politikası ve
-- her okumada bir join demekti; kazancı yoktu.
--
-- file_url / file_name KOLONLARI DURUYOR ve ilk dosyayla doldurulmaya
-- devam ediyor. Sebep: dağıtım sırasında bazı tarayıcılarda eski paket
-- açık kalıyor ve o paket yalnızca file_url'i biliyor. Kolonu hemen
-- düşürseydik, yeni yüklenen ödevler eski sekmelerde "dosya yok" gibi
-- görünürdü.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE homework_submissions
  ADD COLUMN IF NOT EXISTS dosyalar JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN homework_submissions.dosyalar IS
  'Teslim edilen dosyalar: [{"url": ..., "ad": ...}]. file_url ilk '
  'dosyanın kopyasıdır, geriye dönük uyumluluk için tutuluyor.';

-- Mevcut gönderimler diziye taşınıyor. Boş dizi olanlar dokunulmuyor ki
-- migration tekrar çalıştırıldığında kayıtlar ikiye katlanmasın.
UPDATE homework_submissions
SET dosyalar = jsonb_build_array(
      jsonb_build_object('url', file_url, 'ad', COALESCE(file_name, 'Ödev dosyası'))
    )
WHERE file_url IS NOT NULL
  AND (dosyalar IS NULL OR jsonb_array_length(dosyalar) = 0);

-- Dizi gerçekten dizi olsun: arayüz map ile geziyor, nesne gelirse patlar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.homework_submissions'::regclass
      AND conname  = 'homework_dosyalar_dizi'
  ) THEN
    ALTER TABLE homework_submissions ADD CONSTRAINT homework_dosyalar_dizi
      CHECK (jsonb_typeof(dosyalar) = 'array');
  END IF;
END $$;


-- ============================================================
-- DOĞRULAMA
--
--   SELECT file_name, jsonb_array_length(dosyalar) AS dosya_sayisi, dosyalar
--   FROM homework_submissions ORDER BY submitted_at DESC;
--   -- mevcut her gönderimde dosya_sayisi = 1 olmalı
--
--   SELECT count(*) FROM homework_submissions
--   WHERE file_url IS NOT NULL AND jsonb_array_length(dosyalar) = 0;
--   -- 0 olmalı: taşınmamış kayıt kalmamalı
--
-- NOT: RLS politikaları değişmedi. dosyalar aynı satırda olduğu için
-- gönderimi kim okuyabiliyorsa dosyaları da okuyabiliyor; kim
-- yazabiliyorsa dosyaları da yazabiliyor.
-- ============================================================
