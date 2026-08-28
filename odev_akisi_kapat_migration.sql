-- ============================================================
-- ESKİ ÖDEV AKIŞI: YENİ GÖNDERİM KABUL EDİLMİYOR
--
-- ── OLAN ────────────────────────────────────────────────────────
-- Ödev yükleme arayüzü kaldırıldı ama VERİTABANI yazmaya açık kaldı.
-- Tarayıcısında eski paketi önbellekte taşıyan bir öğrenci yüklemeye
-- devam etti: 26 Ağustos'ta dört dosya gönderildi, koça bildirim düştü,
-- ama koç panelinde ödevi gösteren hiçbir yer kalmadığı için dosyalar
-- GÖRÜNMEZ oldu. Öğrenci ödevini teslim ettiğini sanıyor, koç ise
-- bildirimi görüp hiçbir şey bulamıyor.
--
-- Arayüzü kaldırıp veri yolunu açık bırakmak sessiz bir kayıp üretiyor.
--
-- ── YAPILAN ─────────────────────────────────────────────────────
-- INSERT kapatılıyor. Eski paketli öğrenci artık AÇIK BİR HATA alıyor;
-- sessizce boşluğa yazmaktansa "yükleyemedim" demesi iyi.
--
-- OKUMA ve GÜNCELLEME AÇIK KALIYOR: bugüne kadar gönderilmiş dosyalar
-- duruyor ve koç panelinde görev satırında gösteriliyor. Silmek, teslim
-- edilmiş işi yok etmek olurdu.
--
-- Bildirim tetikleyicisi de kaldırılıyor — yeni gönderim olmayacağına
-- göre bildirim de olmamalı.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- Adları bilinmediği için (tablo panelden oluşturulmuş) yalnızca INSERT
-- politikaları dökülüyor; SELECT/UPDATE/DELETE olduğu gibi kalıyor.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'homework_submissions'
             AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.homework_submissions', p.policyname);
    RAISE NOTICE 'INSERT politikasi kaldirildi: %', p.policyname;
  END LOOP;
END $$;

-- Yeni gönderim bildirimi de sussun
DROP TRIGGER IF EXISTS odev_bildirimi ON homework_submissions;
DROP TRIGGER IF EXISTS trg_odev_bildirimi ON homework_submissions;

COMMENT ON TABLE homework_submissions IS
  'ARŞİV. Ödev yükleme akışı kaldırıldı; kanıt artık göreve bağlı '
  'testlerden geliyor (test_sessions.task_id). Yeni satır eklenemez, '
  'mevcutlar okunur ve koç panelinde görev satırında gösterilir.';


-- ============================================================
-- DOĞRULAMA
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'homework_submissions' ORDER BY cmd;
--   -- INSERT satiri OLMAMALI, SELECT/UPDATE kalmalı
--
--   SELECT count(*) FROM homework_submissions;   -- veri duruyor
--
--   SELECT tgname FROM pg_trigger
--   WHERE tgrelid = 'public.homework_submissions'::regclass
--     AND NOT tgisinternal;
--   -- bildirim tetikleyicisi kalmamalı
-- ============================================================
