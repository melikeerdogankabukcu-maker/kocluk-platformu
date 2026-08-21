-- ============================================================
-- DERS KATILIMI (devamsızlık takibi)
--
-- lessons tablosunda "öğrenci geldi mi" diye bir bilgi yoktu. Bir ders ya
-- completed ya değildi; öğrencinin GELMEDİĞİ ders ile HENÜZ OLMAMIŞ ders
-- birbirinden ayırt edilemiyordu. Devamsızlık da ölçülemiyordu.
--
-- katilim kolonu bunu ayırıyor:
--   geldi      · derse katıldı
--   gec_geldi  · katıldı ama geç
--   gelmedi    · gelmedi (devamsızlık)
--   NULL       · henüz işaretlenmemiş
--
-- completed KALDI ve anlamı değişmedi: "ders kapandı". Katılım
-- işaretlemek dersi kapatıyor — gelmese de o saat harcandı ve genelde
-- ücretlendiriliyor, bu yüzden ödeme akışı aynen işlemeye devam ediyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE lessons
  ADD COLUMN IF NOT EXISTS katilim TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.lessons'::regclass AND conname = 'lessons_katilim_check'
  ) THEN
    ALTER TABLE lessons ADD CONSTRAINT lessons_katilim_check
      CHECK (katilim IS NULL OR katilim IN ('geldi', 'gec_geldi', 'gelmedi'));
  END IF;
END $$;

-- Devamsızlık raporu bu kırılımla çekiliyor
CREATE INDEX IF NOT EXISTS idx_lessons_katilim
  ON lessons (student_id, katilim) WHERE katilim IS NOT NULL;


-- ------------------------------------------------------------
-- XP DÜZELTMESİ — gelmediği ders puan kazandırmasın
--
-- ogrenci_puan "completed" dersleri sayıp ders başına 10 XP veriyor.
-- Katılım eklenince bu yanlışa dönüştü: öğrenci derse GELMEDİĞİNDE de
-- ders kapandığı (completed = true) için puan kazanıyordu. Devamsızlık
-- ödüllendirilmemeli.
--
-- Gövdenin tamamı korunuyor; yalnızca ders sayımına katilim koşulu
-- ekleniyor. NULL (işaretlenmemiş) eskisi gibi sayılıyor ki geçmiş
-- kayıtlar geriye dönük puan kaybetmesin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ogrenci_puan(p_user UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_odev INT; v_sinav INT;
  v_ders INT; v_adim INT; v_rozet INT; v_artis INT := 0;
  r RECORD; v_son NUMERIC; v_onceki NUMERIC;
  v_xp INT;
BEGIN
  IF NOT (
       p_user = auth.uid()
    OR ogrencim_mi(p_user)
    OR EXISTS (SELECT 1 FROM family_links
               WHERE parent_id = auth.uid() AND student_id = p_user)
  ) THEN
    RAISE EXCEPTION 'Bu ogrencinin puanini goruntuleme yetkiniz yok';
  END IF;

  SELECT count(*) INTO v_gorev FROM tasks         WHERE student_id = p_user AND is_done;
  SELECT count(*) INTO v_test  FROM test_sessions WHERE student_id = p_user;
  SELECT count(*) INTO v_sinav FROM exam_results  WHERE student_id = p_user;
  SELECT count(*) INTO v_odev  FROM homework_submissions
    WHERE student_id = p_user AND status = 'onaylandi';
  -- DEĞİŞEN SATIR: gelmediği ders sayılmıyor
  SELECT count(*) INTO v_ders  FROM lessons
    WHERE student_id = p_user AND completed
      AND (katilim IS NULL OR katilim <> 'gelmedi');
  SELECT count(*) INTO v_rozet FROM badges        WHERE user_id = p_user;
  SELECT COALESCE(sum(jsonb_array_length(tamamlananlar)), 0) INTO v_adim
    FROM program_atamalari WHERE student_id = p_user;

  FOR r IN SELECT exam_type FROM exam_results
           WHERE student_id = p_user AND total_net IS NOT NULL
           GROUP BY exam_type HAVING count(*) >= 2 LOOP
    SELECT total_net INTO v_son FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC LIMIT 1;
    SELECT total_net INTO v_onceki FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC OFFSET 1 LIMIT 1;
    IF COALESCE(v_son,0) > COALESCE(v_onceki,0) THEN v_artis := v_artis + 1; END IF;
  END LOOP;

  v_xp := v_gorev * 10 + v_test * 5 + v_odev * 15 + v_sinav * 20
        + v_ders * 10 + v_adim * 8 + v_rozet * 25 + v_artis * 30;

  RETURN jsonb_build_object(
    'xp', v_xp,
    'kirilim', jsonb_build_object(
      'gorev', v_gorev, 'test', v_test, 'odev', v_odev, 'sinav', v_sinav,
      'ders', v_ders, 'program_adimi', v_adim, 'rozet', v_rozet, 'net_artisi', v_artis
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.ogrenci_puan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ogrenci_puan(UUID) TO authenticated;


-- ------------------------------------------------------------
-- Devamsızlık bildirimi
-- Öğretmen "gelmedi" işaretleyince öğrenci ve velisi haberdar olsun.
-- Yalnızca gelmedi için bildirim var; geldi/geç geldi için zil çalmıyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bildirim_katilim()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tarih TEXT;
BEGIN
  IF NEW.katilim = 'gelmedi' AND OLD.katilim IS DISTINCT FROM 'gelmedi' THEN
    v_tarih := to_char(NEW.lesson_date, 'DD.MM.YYYY');

    PERFORM bildirim_ekle(NEW.student_id, 'ders', 'Derse katılmadın',
      v_tarih || ' tarihli ders devamsızlık olarak işaretlendi.', NEW.id);

    -- Velilere de haber ver
    PERFORM bildirim_ekle(fl.parent_id, 'ders', 'Devamsızlık',
      v_tarih || ' tarihli derse katılım olmadı.', NEW.id)
    FROM family_links fl WHERE fl.student_id = NEW.student_id;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_bildirim_katilim() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bildirim_katilim ON lessons;
CREATE TRIGGER bildirim_katilim
  AFTER UPDATE OF katilim ON lessons
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_katilim();


-- ============================================================
-- DOĞRULAMA
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'lessons' AND column_name = 'katilim';
--
--   SELECT katilim, count(*) FROM lessons GROUP BY katilim;
--   -- hepsi NULL olmalı (geçmiş dersler işaretlenmemiş)
--
--   Bir dersi "gelmedi" işaretledikten sonra:
--     SELECT tur, baslik FROM notifications ORDER BY created_at DESC LIMIT 3;
--   Öğrencide (ve varsa velisinde) devamsızlık bildirimi olmalı.
--
-- NOT: geçmiş dersler NULL kalıyor; XP'de NULL "gelmiş" sayılıyor ki
-- eski kayıtlar geriye dönük puan kaybetmesin.
-- ============================================================
