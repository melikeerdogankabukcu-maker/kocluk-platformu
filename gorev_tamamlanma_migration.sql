-- ============================================================
-- GÖREV TAMAMLANMA TARİHİ
--
-- ── EKSİK ───────────────────────────────────────────────────────
-- is_done bir boolean; NE ZAMAN yapıldığı hiçbir yerde yok. Haftalık
-- özet bu yüzden tamamlananları görevin AİT OLDUĞU haftaya yazıyordu.
-- Öğrenci geç yaptığında iki hafta birbirine karışıyor: geçen haftanın
-- görevini bu hafta bitirmek, geçen haftayı çalışkan gösteriyordu.
--
-- ── İKİ AYRI ÖLÇÜ ───────────────────────────────────────────────
-- Bunlar farklı sorular ve ikisi de gerekli:
--   gorev_tamamlanan : bu haftanın görevlerinin kaçı yapıldı
--                      (o haftanın yüküne göre tamamlanma oranı)
--   gorev_yapilan    : bu hafta fiilen kaç görev bitirildi
--                      (haftanın gerçek etkinliği, ne zaman atandığından
--                       bağımsız)
-- Tek sayıya indirmek, geç yapılan işi ya görünmez kılar ya da yanlış
-- haftaya yazar.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS tamamlanma_tarihi TIMESTAMPTZ;

COMMENT ON COLUMN tasks.tamamlanma_tarihi IS
  'Görevin tamamlandığı an. is_done true olunca tetikleyici yazar, '
  'false olunca siler. Eski kayıtlarda NULL: o zaman tutulmuyordu.';


-- ------------------------------------------------------------
-- Tetikleyici: is_done değişince tarihi kendi yönetsin
--
-- İstemciye bırakılmıyor. is_done birden fazla yoldan değişiyor (koç
-- doğrulaması, koç iadesi) ve ileride başka yollar da eklenebilir;
-- her çağrı yerinde tarihi elle yazmayı hatırlamak zorunda kalsaydık
-- er ya da geç biri unutulur ve o satır sessizce tarihsiz kalırdı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION gorev_tamamlanma_zamani()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_done AND NOT COALESCE(OLD.is_done, false) THEN
    -- COALESCE: çağıran açıkça bir tarih verdiyse (geriye dönük giriş)
    -- ona dokunulmuyor
    NEW.tamamlanma_tarihi := COALESCE(NEW.tamamlanma_tarihi, now());
  ELSIF NOT NEW.is_done AND COALESCE(OLD.is_done, false) THEN
    -- İade edildi: görev yeniden yapılacak, eski tarih artık yanlış
    NEW.tamamlanma_tarihi := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS gorev_tamamlanma_kilidi ON tasks;
CREATE TRIGGER gorev_tamamlanma_kilidi
  BEFORE UPDATE OF is_done ON tasks
  FOR EACH ROW EXECUTE FUNCTION gorev_tamamlanma_zamani();


-- Geçmiş: koç doğrulaması yapılmış görevlerde onay tarihi biliniyor.
-- Diğer tamamlanmış görevlerde tarih GERÇEKTEN bilinmiyor, uydurulmuyor;
-- NULL kalıyor ve özet aşağıda görevin kendi haftasına düşüyor.
UPDATE tasks
SET tamamlanma_tarihi = onay_tarihi
WHERE is_done AND tamamlanma_tarihi IS NULL AND onay_tarihi IS NOT NULL;


-- ------------------------------------------------------------
-- Haftalık özete "bu hafta fiilen yapılan" eklendi
-- ------------------------------------------------------------
ALTER TABLE ogrenci_haftalik
  ADD COLUMN IF NOT EXISTS gorev_yapilan INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ogrenci_haftalik.gorev_yapilan IS
  'Bu hafta fiilen tamamlanan görev sayısı (atandığı haftadan bağımsız). '
  'gorev_tamamlanan ise bu haftanın görevlerinin kaçının yapıldığı.';


CREATE OR REPLACE FUNCTION public.haftalik_ozet_hesapla(p_student UUID, p_hafta DATE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b DATE := date_trunc('week', p_hafta)::date;
  s DATE := b + 7;
  v RECORD;
BEGIN
  SELECT
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student
        AND COALESCE(t.due_date, t.created_at::date) >= b
        AND COALESCE(t.due_date, t.created_at::date) <  s) AS g_verilen,
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student AND t.is_done
        AND COALESCE(t.due_date, t.created_at::date) >= b
        AND COALESCE(t.due_date, t.created_at::date) <  s) AS g_tamam,
    -- Fiilen bu hafta bitirilenler. Tamamlanma tarihi bilinmiyorsa
    -- (eski kayıt) görevin kendi haftasına düşülüyor: sıfır saymak o işi
    -- hiç yapılmamış gibi gösterirdi.
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student AND t.is_done
        AND COALESCE(t.tamamlanma_tarihi::date, t.due_date, t.created_at::date) >= b
        AND COALESCE(t.tamamlanma_tarihi::date, t.due_date, t.created_at::date) <  s) AS g_yapilan,
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student AND t.ogretmen_onayi = 'iade_edildi'
        AND COALESCE(t.due_date, t.created_at::date) >= b
        AND COALESCE(t.due_date, t.created_at::date) <  s) AS g_iade,

    (SELECT count(*) FROM test_sessions x
      WHERE x.student_id = p_student
        AND x.created_at >= b AND x.created_at < s) AS t_sayi,
    (SELECT count(*) FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS t_ayrintili,
    (SELECT COALESCE(sum(x.question_count), 0) FROM test_sessions x
      WHERE x.student_id = p_student
        AND x.created_at >= b AND x.created_at < s) AS s_toplam,
    (SELECT COALESCE(sum(x.correct_count), 0) FROM test_sessions x
      WHERE x.student_id = p_student
        AND x.created_at >= b AND x.created_at < s) AS s_dogru,
    (SELECT COALESCE(sum(x.yanlis_count), 0) FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS s_yanlis,
    (SELECT COALESCE(sum(x.question_count - x.correct_count - x.yanlis_count), 0)
       FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS s_bos,
    (SELECT sum(x.correct_count - x.yanlis_count / 4.0) FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS t_net,

    (SELECT count(*) FROM exam_results e
      WHERE e.student_id = p_student
        AND e.exam_date >= b AND e.exam_date < s) AS sv_sayi,
    (SELECT avg(e.total_net) FROM exam_results e
      WHERE e.student_id = p_student AND e.total_net IS NOT NULL
        AND e.exam_date >= b AND e.exam_date < s) AS sv_net,

    (SELECT count(*) FROM lessons l
      WHERE l.student_id = p_student AND l.status = 'onaylandi'
        AND l.lesson_date >= b AND l.lesson_date < s) AS d_plan,
    (SELECT count(*) FROM lessons l
      WHERE l.student_id = p_student AND l.katilim IN ('geldi', 'gec_geldi')
        AND l.lesson_date >= b AND l.lesson_date < s) AS d_geldi,
    (SELECT count(*) FROM lessons l
      WHERE l.student_id = p_student AND l.katilim = 'gelmedi'
        AND l.lesson_date >= b AND l.lesson_date < s) AS d_gelmedi
  INTO v;

  INSERT INTO ogrenci_haftalik AS o (
    student_id, hafta,
    gorev_verilen, gorev_tamamlanan, gorev_yapilan, gorev_iade,
    test_sayisi, test_ayrintili, soru_toplam, soru_dogru, soru_yanlis, soru_bos, test_net,
    sinav_sayisi, sinav_net_ort,
    ders_planlanan, ders_geldi, ders_gelmedi,
    hesaplanma
  ) VALUES (
    p_student, b,
    v.g_verilen, v.g_tamam, v.g_yapilan, v.g_iade,
    v.t_sayi, v.t_ayrintili, v.s_toplam, v.s_dogru, v.s_yanlis, v.s_bos, v.t_net,
    v.sv_sayi, v.sv_net,
    v.d_plan, v.d_geldi, v.d_gelmedi,
    now()
  )
  ON CONFLICT (student_id, hafta) DO UPDATE SET
    gorev_verilen = EXCLUDED.gorev_verilen,
    gorev_tamamlanan = EXCLUDED.gorev_tamamlanan,
    gorev_yapilan = EXCLUDED.gorev_yapilan,
    gorev_iade = EXCLUDED.gorev_iade,
    test_sayisi = EXCLUDED.test_sayisi,
    test_ayrintili = EXCLUDED.test_ayrintili,
    soru_toplam = EXCLUDED.soru_toplam,
    soru_dogru = EXCLUDED.soru_dogru,
    soru_yanlis = EXCLUDED.soru_yanlis,
    soru_bos = EXCLUDED.soru_bos,
    test_net = EXCLUDED.test_net,
    sinav_sayisi = EXCLUDED.sinav_sayisi,
    sinav_net_ort = EXCLUDED.sinav_net_ort,
    ders_planlanan = EXCLUDED.ders_planlanan,
    ders_geldi = EXCLUDED.ders_geldi,
    ders_gelmedi = EXCLUDED.ders_gelmedi,
    hesaplanma = now();
END $$;

REVOKE ALL ON FUNCTION public.haftalik_ozet_hesapla(UUID, DATE)
  FROM PUBLIC, anon, authenticated;


-- Yeni kolon dolsun diye tüm seri yeniden hesaplanıyor
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
  RAISE NOTICE 'Haftalik ozet yeniden hesaplandi: % satir.', n;
END $$;


-- ============================================================
-- DOĞRULAMA
--
--   SELECT (SELECT sum(gorev_verilen)    FROM ogrenci_haftalik) AS verilen,
--          (SELECT count(*)              FROM tasks)            AS kaynak,
--          (SELECT sum(gorev_yapilan)    FROM ogrenci_haftalik) AS yapilan,
--          (SELECT count(*)              FROM tasks WHERE is_done) AS kaynak_yapilan;
--   -- verilen = kaynak, yapilan = kaynak_yapilan olmalı
--
-- Tetikleyici denemesi: bir görevi is_done = true yapın, tamamlanma_tarihi
-- kendiliğinden dolmalı; false yapınca silinmeli.
-- ============================================================
