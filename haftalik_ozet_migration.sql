-- ============================================================
-- HAFTALIK ÖĞRENCİ ÖZETİ (snapshot)
--
-- ── NEDEN ───────────────────────────────────────────────────────
-- Görev, test, sınav ve ders verisi zaten birikiyor ama dağınık ve
-- tarih bazında. İleride yapay zekâ koçu için gereken şey, her öğrenci
-- için HAFTA HAFTA sabit biçimli bir zaman serisi: "bu hafta 8 görev
-- verildi, 6'sı yapıldı, 120 soru çözüldü, net 78, 2 derse geldi".
--
-- ── NEDEN GÖRÜNÜM (VIEW) DEĞİL ──────────────────────────────────
-- Görünüm her sorguda dört tabloyu yeniden tarardı ve geçmiş, kaynak
-- satırlar silindiğinde/değiştiğinde geriye dönük DEĞİŞİRDİ. Model
-- eğitimi için o hafta gerçekte ne olduğunun sabit kalması gerekiyor.
--
-- ── HANGİ HAFTAYA YAZILIYOR ─────────────────────────────────────
-- Görev: due_date varsa o, yoksa created_at. "İşin ait olduğu hafta"
--   bu; atanma tarihi değil. Tamamlanma tarihi TUTULMUYOR (is_done'ın
--   zaman damgası yok), o yüzden tamamlanan sayısı da görevin ait
--   olduğu haftaya yazılıyor.
-- Test: created_at · Sınav: exam_date · Ders: lesson_date
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS ogrenci_haftalik (
  student_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hafta            DATE NOT NULL,              -- haftanın pazartesisi

  gorev_verilen    INTEGER NOT NULL DEFAULT 0,
  gorev_tamamlanan INTEGER NOT NULL DEFAULT 0,
  gorev_iade       INTEGER NOT NULL DEFAULT 0,

  test_sayisi      INTEGER NOT NULL DEFAULT 0,
  -- Yanlış/boş ayrımı girilmiş test sayısı. Ayrım eski kayıtlarda yok;
  -- net yalnızca bunlardan hesaplanıyor, yoksa net olduğundan yüksek
  -- çıkardı.
  test_ayrintili   INTEGER NOT NULL DEFAULT 0,
  soru_toplam      INTEGER NOT NULL DEFAULT 0,
  soru_dogru       INTEGER NOT NULL DEFAULT 0,
  soru_yanlis      INTEGER NOT NULL DEFAULT 0,
  soru_bos         INTEGER NOT NULL DEFAULT 0,
  test_net         NUMERIC(8,2),

  sinav_sayisi     INTEGER NOT NULL DEFAULT 0,
  sinav_net_ort    NUMERIC(8,2),

  ders_planlanan   INTEGER NOT NULL DEFAULT 0,
  ders_geldi       INTEGER NOT NULL DEFAULT 0,
  ders_gelmedi     INTEGER NOT NULL DEFAULT 0,

  hesaplanma       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, hafta)
);

CREATE INDEX IF NOT EXISTS idx_haftalik_hafta ON ogrenci_haftalik (hafta);

COMMENT ON TABLE ogrenci_haftalik IS
  'Haftalık öğrenci özeti. Kaynak tablolardan türetilir, elle yazılmaz. '
  'Yapay zekâ koçu için sabit biçimli zaman serisi.';


-- ------------------------------------------------------------
-- Tek bir (öğrenci, hafta) satırını hesapla ve yaz
--
-- Yetki denetimi YOK: bu fonksiyon yalnızca aşağıdaki yenile()
-- tarafından çağrılıyor ve authenticated'tan alınıyor. Denetim orada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haftalik_ozet_hesapla(p_student UUID, p_hafta DATE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b DATE := date_trunc('week', p_hafta)::date;   -- pazartesi
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
    -- Net yalnızca ayrımı girilmiş testlerden: net = doğru − yanlış/4
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
    gorev_verilen, gorev_tamamlanan, gorev_iade,
    test_sayisi, test_ayrintili, soru_toplam, soru_dogru, soru_yanlis, soru_bos, test_net,
    sinav_sayisi, sinav_net_ort,
    ders_planlanan, ders_geldi, ders_gelmedi,
    hesaplanma
  ) VALUES (
    p_student, b,
    v.g_verilen, v.g_tamam, v.g_iade,
    v.t_sayi, v.t_ayrintili, v.s_toplam, v.s_dogru, v.s_yanlis, v.s_bos, v.t_net,
    v.sv_sayi, v.sv_net,
    v.d_plan, v.d_geldi, v.d_gelmedi,
    now()
  )
  ON CONFLICT (student_id, hafta) DO UPDATE SET
    gorev_verilen = EXCLUDED.gorev_verilen,
    gorev_tamamlanan = EXCLUDED.gorev_tamamlanan,
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


-- ------------------------------------------------------------
-- Son N haftayı yenile
--
-- Yönetici tüm öğrencileri, koç YALNIZCA kendi onaylı öğrencilerini
-- yeniliyor. Öğrenci ve veli çağıramıyor: yazma işlemi ve maliyeti var,
-- okumaları için tabloyu okumak yeterli.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haftalik_ozet_yenile(p_hafta_sayisi INTEGER DEFAULT 8)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ogr    UUID;
  h      DATE;
  ilk    DATE := date_trunc('week', now())::date - (GREATEST(p_hafta_sayisi, 1) - 1) * 7;
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
    h := ilk;
    WHILE h <= date_trunc('week', now())::date LOOP
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
-- RLS — okuma; yazma yalnızca yukarıdaki fonksiyonlardan
-- ------------------------------------------------------------
ALTER TABLE ogrenci_haftalik ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'ogrenci_haftalik'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.ogrenci_haftalik', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Ogrenci kendi ozetini gorur" ON ogrenci_haftalik
  FOR SELECT TO authenticated USING (student_id = auth.uid());

CREATE POLICY "Koc ogrencisinin ozetini gorur" ON ogrenci_haftalik
  FOR SELECT TO authenticated USING (ogrencim_mi(student_id));

CREATE POLICY "Veli cocugunun ozetini gorur" ON ogrenci_haftalik
  FOR SELECT TO authenticated USING (cocugum_mu(student_id));

CREATE POLICY "Yonetici tum ozetleri gorur" ON ogrenci_haftalik
  FOR SELECT TO authenticated USING (admin_mi());


-- ------------------------------------------------------------
-- GEÇMİŞİ DOLDUR
--
-- Her öğrenci için İLK etkinliğinden bu haftaya kadar tüm haftalar
-- yazılıyor — hiç etkinlik olmayan haftalar da SIFIRLARLA. Boş hafta
-- bir bilgi: model için "o hafta hiçbir şey yapılmadı" ile "o hafta
-- veri yok" aynı şey değil.
-- ------------------------------------------------------------
DO $$
DECLARE ogr RECORD; h DATE; son DATE := date_trunc('week', now())::date; n INTEGER := 0;
BEGIN
  FOR ogr IN
    SELECT u.id,
           LEAST(
             COALESCE((SELECT min(COALESCE(t.due_date, t.created_at::date)) FROM tasks t WHERE t.student_id = u.id), son),
             COALESCE((SELECT min(x.created_at::date) FROM test_sessions x WHERE x.student_id = u.id), son),
             COALESCE((SELECT min(e.exam_date)        FROM exam_results e  WHERE e.student_id = u.id), son),
             COALESCE((SELECT min(l.lesson_date)      FROM lessons l       WHERE l.student_id = u.id), son)
           ) AS basla
    FROM users u WHERE u.role = 'student'
  LOOP
    h := date_trunc('week', ogr.basla)::date;
    WHILE h <= son LOOP
      PERFORM haftalik_ozet_hesapla(ogr.id, h);
      n := n + 1;
      h := h + 7;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Haftalik ozet dolduruldu: % satir.', n;
END $$;


-- ============================================================
-- DOĞRULAMA
--
--   SELECT u.full_name, o.hafta, o.gorev_verilen, o.gorev_tamamlanan,
--          o.soru_toplam, o.test_net, o.sinav_net_ort, o.ders_geldi
--   FROM ogrenci_haftalik o JOIN users u ON u.id = o.student_id
--   ORDER BY u.full_name, o.hafta;
--
--   -- Toplam görev sayısı kaynakla tutmalı:
--   SELECT (SELECT sum(gorev_verilen) FROM ogrenci_haftalik) AS ozet,
--          (SELECT count(*) FROM tasks) AS kaynak;
--
-- Yenileme (koç/yönetici olarak, uygulamadan):
--   SELECT haftalik_ozet_yenile(8);
-- ============================================================
