-- ============================================================
-- HAFTALIK ÖZET — GELECEK HAFTALAR DA KAPSANSIN
--
-- ── BULUNAN EKSİK ───────────────────────────────────────────────
-- İlk sürüm haftaları BU HAFTAYA kadar üretiyordu. Oysa görevler
-- ileriye atanıyor: son tarihi gelecek haftalarda olan 4 görev hiçbir
-- satıra girmemişti. Doğrulama toplamı yakaladı — özet 104, kaynak 108.
--
-- İleri haftalar özette OLMALI: koç "önümüzdeki hafta 4 görev var"
-- diyebilmeli, model de atanan yükü görmeli. O haftalarda tamamlanan
-- sayısının 0 olması doğru, veri eksikliği değil.
--
-- Bitiş haftası artık öğrenci bazında hesaplanıyor: bu hafta ile o
-- öğrencinin EN İLERİ görev tarihinin haftasından hangisi büyükse o.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.haftalik_ozet_yenile(p_hafta_sayisi INTEGER DEFAULT 8)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ogr    UUID;
  h      DATE;
  buHafta DATE := date_trunc('week', now())::date;
  ilk    DATE := date_trunc('week', now())::date - (GREATEST(p_hafta_sayisi, 1) - 1) * 7;
  son    DATE;
  sayac  INTEGER := 0;
BEGIN
  IF NOT (admin_mi() OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  )) THEN
    RAISE EXCEPTION 'Bu islem icin kocluk yetkisi gerekiyor.';
  END IF;

  FOR ogr IN
    SELECT u.id FROM users u
    WHERE u.role = 'student'
      AND (admin_mi() OR EXISTS (
        SELECT 1 FROM teacher_students ts
        WHERE ts.student_id = u.id AND ts.teacher_id = auth.uid()
          AND ts.durum = 'onaylandi'))
  LOOP
    -- İleriye atanmış görevlerin haftaları da üretilsin
    SELECT GREATEST(
             buHafta,
             COALESCE(date_trunc('week', max(t.due_date))::date, buHafta)
           )
      INTO son
      FROM tasks t WHERE t.student_id = ogr;

    h := ilk;
    WHILE h <= son LOOP
      PERFORM haftalik_ozet_hesapla(ogr, h);
      sayac := sayac + 1;
      h := h + 7;
    END LOOP;
  END LOOP;

  RETURN sayac;
END $$;

REVOKE ALL ON FUNCTION public.haftalik_ozet_yenile(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haftalik_ozet_yenile(INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- Geçmişi VE geleceği yeniden doldur
-- ------------------------------------------------------------
DO $$
DECLARE
  ogr RECORD; h DATE; n INTEGER := 0;
  buHafta DATE := date_trunc('week', now())::date;
BEGIN
  FOR ogr IN
    SELECT u.id,
           LEAST(
             COALESCE((SELECT min(COALESCE(t.due_date, t.created_at::date)) FROM tasks t WHERE t.student_id = u.id), buHafta),
             COALESCE((SELECT min(x.created_at::date) FROM test_sessions x WHERE x.student_id = u.id), buHafta),
             COALESCE((SELECT min(e.exam_date)        FROM exam_results e  WHERE e.student_id = u.id), buHafta),
             COALESCE((SELECT min(l.lesson_date)      FROM lessons l       WHERE l.student_id = u.id), buHafta)
           ) AS basla,
           GREATEST(
             buHafta,
             COALESCE((SELECT max(t.due_date)   FROM tasks t   WHERE t.student_id = u.id), buHafta),
             COALESCE((SELECT max(l.lesson_date) FROM lessons l WHERE l.student_id = u.id), buHafta)
           ) AS bitir
    FROM users u WHERE u.role = 'student'
  LOOP
    h := date_trunc('week', ogr.basla)::date;
    WHILE h <= date_trunc('week', ogr.bitir)::date LOOP
      PERFORM haftalik_ozet_hesapla(ogr.id, h);
      n := n + 1;
      h := h + 7;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Haftalik ozet yeniden dolduruldu: % satir.', n;
END $$;


-- ============================================================
-- DOĞRULAMA — bu sefer tutmalı
--
--   SELECT (SELECT sum(gorev_verilen) FROM ogrenci_haftalik) AS ozet,
--          (SELECT count(*) FROM tasks) AS kaynak;
--   -- iki sayı EŞİT olmalı
-- ============================================================
