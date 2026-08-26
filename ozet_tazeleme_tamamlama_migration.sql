-- ============================================================
-- ÖZET TAZELEME: GÖREV, SINAV VE DERSE DE BAĞLANIYOR
--
-- Test tarafı bağlanmıştı ama diğer üçü elle yenileme istiyordu. Bu,
-- kartta bazı sütunların taze bazılarının eski olması demekti ve koç
-- hangisinin güncel olduğunu ayırt edemiyordu.
--
-- ── HER TABLONUN TARİHİ FARKLI ──────────────────────────────────
--   tasks         -> due_date, yoksa created_at (işin ait olduğu hafta)
--   exam_results  -> exam_date
--   lessons       -> lesson_date
-- Ortak bir tetikleyici yazılamıyor; her biri kendi kolonunu okuyor.
--
-- ── GÖREVDE İKİ HAFTA VAR ───────────────────────────────────────
-- Bir görev İKİ haftayı birden etkiliyor:
--   ait olduğu hafta      -> gorev_verilen / gorev_tamamlanan
--   tamamlandığı hafta    -> gorev_yapilan
-- Koç görevi doğruladığında tamamlanma tarihi doluyor ve bu ikisi
-- FARKLI haftalar olabiliyor. Yalnızca birini tazelesek diğeri eski
-- kalırdı; ikisi de hesaplanıyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- Görev: ait olduğu hafta + tamamlandığı hafta, eski ve yeni değerler
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ozet_tazele_gorev()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
BEGIN
  -- Etkilenen her (öğrenci, tarih) çifti bir kez hesaplansın diye
  -- UNION ile toplanıyor; aynı hafta iki kez gelirse iki kez
  -- hesaplamanın anlamı yok.
  FOR r IN
    SELECT DISTINCT * FROM (
      SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.student_id END AS ogr,
             CASE WHEN TG_OP <> 'INSERT'
                  THEN COALESCE(OLD.due_date, OLD.created_at::date) END AS gun
      UNION ALL
      SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.student_id END,
             CASE WHEN TG_OP <> 'INSERT'
                  THEN COALESCE(OLD.tamamlanma_tarihi::date, OLD.due_date, OLD.created_at::date) END
      UNION ALL
      SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.student_id END,
             CASE WHEN TG_OP <> 'DELETE'
                  THEN COALESCE(NEW.due_date, NEW.created_at::date) END
      UNION ALL
      SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.student_id END,
             CASE WHEN TG_OP <> 'DELETE'
                  THEN COALESCE(NEW.tamamlanma_tarihi::date, NEW.due_date, NEW.created_at::date) END
    ) x
    WHERE x.ogr IS NOT NULL AND x.gun IS NOT NULL
  LOOP
    PERFORM haftalik_ozet_hesapla(r.ogr, r.gun);
  END LOOP;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

REVOKE ALL ON FUNCTION public.trg_ozet_tazele_gorev() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gorev_ozet_tazele ON tasks;
CREATE TRIGGER gorev_ozet_tazele
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_ozet_tazele_gorev();


-- ------------------------------------------------------------
-- Sınav
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ozet_tazele_sinav()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.exam_date);
    RETURN OLD;
  END IF;
  PERFORM haftalik_ozet_hesapla(NEW.student_id, NEW.exam_date);
  IF TG_OP = 'UPDATE' AND (
       OLD.student_id IS DISTINCT FROM NEW.student_id
    OR date_trunc('week', OLD.exam_date) IS DISTINCT FROM date_trunc('week', NEW.exam_date)
  ) THEN
    PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.exam_date);
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_ozet_tazele_sinav() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sinav_ozet_tazele ON exam_results;
CREATE TRIGGER sinav_ozet_tazele
  AFTER INSERT OR UPDATE OR DELETE ON exam_results
  FOR EACH ROW EXECUTE FUNCTION trg_ozet_tazele_sinav();


-- ------------------------------------------------------------
-- Ders
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_ozet_tazele_ders()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.lesson_date);
    RETURN OLD;
  END IF;
  PERFORM haftalik_ozet_hesapla(NEW.student_id, NEW.lesson_date);
  -- Ders düzenlenebiliyor: tarihi değişince eski hafta da tazelenmeli
  IF TG_OP = 'UPDATE' AND (
       OLD.student_id IS DISTINCT FROM NEW.student_id
    OR date_trunc('week', OLD.lesson_date) IS DISTINCT FROM date_trunc('week', NEW.lesson_date)
  ) THEN
    PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.lesson_date);
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_ozet_tazele_ders() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ders_ozet_tazele ON lessons;
CREATE TRIGGER ders_ozet_tazele
  AFTER INSERT OR UPDATE OR DELETE ON lessons
  FOR EACH ROW EXECUTE FUNCTION trg_ozet_tazele_ders();


-- ============================================================
-- DOĞRULAMA
--
--   SELECT tgname, c.relname FROM pg_trigger t
--   JOIN pg_class c ON c.oid = t.tgrelid
--   WHERE NOT t.tgisinternal AND tgname LIKE '%ozet_tazele%'
--   ORDER BY c.relname;
--   -- 4 satır: tasks, exam_results, lessons, test_sessions
--
--   -- Toplamlar hâlâ tutmalı:
--   SELECT (SELECT sum(gorev_verilen) FROM ogrenci_haftalik) AS ozet,
--          (SELECT count(*) FROM tasks) AS kaynak;
-- ============================================================
