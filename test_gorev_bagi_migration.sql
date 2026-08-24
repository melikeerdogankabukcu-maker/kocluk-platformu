-- ============================================================
-- TEST ↔ GÖREV BAĞI, TESTE ÇOKLU GÖRSEL, ONAY YALNIZCA KOÇTA
--
-- ── DEĞİŞEN AKIŞ ────────────────────────────────────────────────
-- Önce: öğrenci görevi kendi işaretliyor, kanıtı göreve dosya
--       yükleyerek veriyordu (homework_submissions).
-- Şimdi: öğrenci "Test Çözdüm"e girip testi İSTERSE bir göreve
--       bağlıyor ve görsellerini oraya yüklüyor. Görevi YALNIZCA koç
--       kapatıyor.
--
-- Test göreve bağlanmak ZORUNDA DEĞİL: öğrenci kendi isteğiyle de test
-- çözebilmeli. task_id boş bırakılabiliyor.
--
-- ── ÖĞRENCİ KENDİ GÖREVİNİ KAPATAMAZ ────────────────────────────
-- "Ogrenci gorevini tamamlar" politikası kaldırılıyor. Bu politika
-- öğrenciye kendi görev satırında UPDATE veriyordu; is_done'ı kendi
-- işaretleyebiliyordu. Artık is_done'ı yalnızca koç yazıyor
-- (gorev_onayi_migration'daki doğrulama akışı).
--
-- DİKKAT: bu politika kalkınca öğrencinin tasks üzerinde HİÇBİR yazma
-- yetkisi kalmıyor — arayüzdeki işaretleme kutusu da bu yüzden salt
-- okunur hale getirildi. Kutucuk dururken yazma reddedilseydi öğrenci
-- tıklar, hiçbir şey olmaz ve nedenini anlamazdı.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Test ↔ görev bağı
-- ------------------------------------------------------------
ALTER TABLE test_sessions
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN test_sessions.task_id IS
  'Test bir görevi yerine getiriyorsa o görev. Boş olabilir: öğrenci '
  'kendi isteğiyle de test çözebilir.';

CREATE INDEX IF NOT EXISTS idx_test_sessions_task ON test_sessions (task_id)
  WHERE task_id IS NOT NULL;


-- ------------------------------------------------------------
-- 2) Teste çoklu görsel — ödevdekiyle aynı biçim
-- ------------------------------------------------------------
ALTER TABLE test_sessions
  ADD COLUMN IF NOT EXISTS dosyalar JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE test_sessions
SET dosyalar = jsonb_build_array(
      jsonb_build_object('url', file_url, 'ad', COALESCE(file_name, 'Çözüm görseli'))
    )
WHERE file_url IS NOT NULL
  AND (dosyalar IS NULL OR jsonb_array_length(dosyalar) = 0);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.test_sessions'::regclass
      AND conname  = 'test_dosyalar_dizi'
  ) THEN
    ALTER TABLE test_sessions ADD CONSTRAINT test_dosyalar_dizi
      CHECK (jsonb_typeof(dosyalar) = 'array');
  END IF;
END $$;


-- ------------------------------------------------------------
-- 3) Öğrenci artık görev kapatamıyor
--
-- Politikayı kaldırmak yetmiyor: öğrenci testi bir göreve bağlarken
-- tasks'a değil test_sessions'a yazıyor, o yüzden başka bir yazma
-- yetkisine ihtiyacı yok. Koçun UPDATE'i (FOR ALL, ogrencim_mi)
-- olduğu gibi duruyor.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Ogrenci gorevini tamamlar" ON tasks;

-- Öğrenci başkasının görevine test bağlayamasın: bağladığı görev kendi
-- görevi olmalı. Aksi halde bir öğrenci, başka bir öğrencinin görevine
-- kendi testini iliştirip o görevin kapanmasına yol açabilirdi.
CREATE OR REPLACE FUNCTION test_gorev_bagi_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.task_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM tasks
      WHERE id = NEW.task_id AND student_id = NEW.student_id
    ) THEN
      RAISE EXCEPTION 'Test yalnizca kendi gorevinize baglanabilir.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.test_gorev_bagi_koru() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS test_gorev_bagi_kilidi ON test_sessions;
CREATE TRIGGER test_gorev_bagi_kilidi
  BEFORE INSERT OR UPDATE OF task_id, student_id ON test_sessions
  FOR EACH ROW EXECUTE FUNCTION test_gorev_bagi_koru();


-- ------------------------------------------------------------
-- 4) Koça bildirim: göreve bağlı test geldi
--    Koç neyi doğrulayacağını görebilmeli.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bildirim_gorev_testi()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ogretmen UUID; v_baslik TEXT;
BEGIN
  IF NEW.task_id IS NULL THEN RETURN NEW; END IF;

  SELECT teacher_id, title INTO v_ogretmen, v_baslik FROM tasks WHERE id = NEW.task_id;
  IF v_ogretmen IS NULL THEN RETURN NEW; END IF;

  PERFORM bildirim_ekle(
    v_ogretmen,
    'odev',
    kisi_adi(NEW.student_id) || ' test yükledi',
    COALESCE(v_baslik, 'Görev') || ' — ' || NEW.subject
      || ' · ' || COALESCE(NEW.correct_count, 0) || '/' || COALESCE(NEW.question_count, 0),
    NEW.task_id
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_bildirim_gorev_testi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gorev_testi_bildirimi ON test_sessions;
CREATE TRIGGER gorev_testi_bildirimi
  AFTER INSERT ON test_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_gorev_testi();


-- ============================================================
-- DOĞRULAMA
--
-- 1) Kolonlar:
--      SELECT task_id, jsonb_array_length(dosyalar) FROM test_sessions;
--      -- eski kayıtlarda task_id NULL, görseli olanlarda dosya sayısı 1
--
-- 2) Öğrencinin tasks yazma yetkisi kalmamalı (yalnızca koç politikası
--    ve veli okuması dönmeli):
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename = 'tasks' ORDER BY cmd, policyname;
--      -- "Ogrenci gorevini tamamlar" LİSTEDE OLMAMALI
--
-- 3) Asıl test uygulamadan: öğrenci hesabında görev kutucuğu artık
--    tıklanamıyor, "Test Çözdüm" formunda görev seçilebiliyor ve
--    birden fazla görsel yüklenebiliyor.
-- ============================================================
