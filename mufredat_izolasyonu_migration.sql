-- ============================================================
-- MÜFREDAT İZOLASYONU (kurum bazlı)
--
-- ── DURUM ───────────────────────────────────────────────────────
-- exam_topics ve study_programs okuması "USING (true)" idi: giriş
-- yapmış herkes her şeyi görüyordu. Bir koçun kendi yazdığı konu ve
-- programlar diğer koçlara da görünüyordu.
--
-- ── KURAL ───────────────────────────────────────────────────────
-- Gömülü müfredat (sahip_id IS NULL) HERKESE açık — platformun ortak
-- tabanı, 534 konu. Koçun kendi yazdıkları yalnızca kendi kurumunda.
--
-- ── ÖĞRENCİ İSTİSNASI (şart) ────────────────────────────────────
-- Öğrenci, kendi koçunun yazdığı konuyu GÖRMEK ZORUNDA: o konuyla
-- görev atanıyor. Yalnızca "aynı kurum" deseydik, farklı kurumdan bir
-- koça bağlanan öğrenci kendi görevinin konusunu göremez ve görev
-- başlıksız görünürdü. Bu yüzden "onaylı koçum yazdıysa görürüm"
-- dalı da var. İzolasyonu delmiyor: yalnızca gerçekten bağlı olduğu
-- koçun konularını açıyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.kurumda_gorunur_mu(p_sahip UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- gömülü: platformun ortak müfredatı
    p_sahip IS NULL
    -- kendi yazdığı
    OR p_sahip = auth.uid()
    -- platform yöneticisi her şeyi görür
    OR admin_mi()
    -- aynı kurumdan biri yazdıysa
    OR EXISTS (
      SELECT 1
      FROM users sahip, users ben
      WHERE sahip.id = p_sahip
        AND ben.id = auth.uid()
        AND sahip.kurum_id IS NOT NULL
        AND sahip.kurum_id = ben.kurum_id
    )
    -- onaylı koçum yazdıysa (öğrenci kendi görevinin konusunu görmeli)
    OR EXISTS (
      SELECT 1 FROM teacher_students
      WHERE teacher_id = p_sahip
        AND student_id = auth.uid()
        AND durum = 'onaylandi'
    )
    -- çocuğumun koçu yazdıysa (veli aynı görevleri görüyor)
    OR EXISTS (
      SELECT 1
      FROM family_links fl
      JOIN teacher_students ts ON ts.student_id = fl.student_id
      WHERE fl.parent_id = auth.uid()
        AND ts.teacher_id = p_sahip
        AND ts.durum = 'onaylandi'
    );
$$;

-- Politika içinden çağrılıyor: EXECUTE yetkisi olmayan bir rol için
-- politika değerlendirilemez ve sorgu boş sonuç yerine HATA döner.
-- Bu yüzden PUBLIC'ten alınmıyor (ogrencim_mi ile aynı gerekçe).
GRANT EXECUTE ON FUNCTION public.kurumda_gorunur_mu(UUID) TO authenticated;


-- ------------------------------------------------------------
-- exam_topics okuması
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Konulari herkes okur"        ON exam_topics;
DROP POLICY IF EXISTS "Konulari kurum icinde okur"  ON exam_topics;

CREATE POLICY "Konulari kurum icinde okur" ON exam_topics
  FOR SELECT TO authenticated
  USING (kurumda_gorunur_mu(sahip_id));


-- ------------------------------------------------------------
-- study_programs okuması
--
-- hazir = true olanlar koddaki hazır programlar, herkese açık.
-- Koçun kendi yazdıkları created_by üzerinden kurumla sınırlanıyor.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Programlari herkes okur"       ON study_programs;
DROP POLICY IF EXISTS "Programlari kurum icinde okur" ON study_programs;

CREATE POLICY "Programlari kurum icinde okur" ON study_programs
  FOR SELECT TO authenticated
  USING (hazir = true OR kurumda_gorunur_mu(created_by));


-- ------------------------------------------------------------
-- YOLDA ÇIKAN İKİ AÇIK
--
-- 1) exam_topics UPDATE politikası yalnızca "role = 'teacher'" diyordu,
--    SAHİP KONTROLÜ YOKTU: herhangi bir koç HERHANGİ BİR konu satırını
--    yeniden yazabiliyordu — adını, sırasını, hatta sahip_id'sini.
--    534 konuyu ortak müfredat yaptığımız için bu artık tüm platformu
--    etkiler hale geldi. Arayüz bu politikayı hiç kullanmıyor (aktif ve
--    ağırlık tercihleri ogretmen_konu_tercihi'nde tutuluyor), yani
--    daraltmak hiçbir şeyi bozmuyor; açık kalması saf saldırı yüzeyiydi.
--
-- 2) Yönetici rolü konu silemiyor ve yeniden adlandıramıyordu: iki kural
--    da role = 'teacher' arıyor, yöneticinin rolü 'admin'. Hesap admin
--    yapıldığından beri sessizce böyleydi. Ortak müfredatı düzeltebilecek
--    tek kişi platform sahibi olduğu için bu artık gerçekten engel.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Ogretmen konu tercihlerini gunceller" ON exam_topics;
DROP POLICY IF EXISTS "Konu sahibi gunceller"                ON exam_topics;

CREATE POLICY "Konu sahibi gunceller" ON exam_topics
  FOR UPDATE TO authenticated
  USING      (sahip_id = auth.uid() OR admin_mi())
  WITH CHECK (sahip_id = auth.uid() OR admin_mi());

-- Silme: sahibi ya da platform yöneticisi. Gömülü konular sahipsiz
-- olduğu için yalnızca yönetici temizleyebilir — ortak müfredatı bir
-- koçun silebilmesi tüm kurumları etkilerdi.
DROP POLICY IF EXISTS "Ogretmen kendi konusunu siler" ON exam_topics;
DROP POLICY IF EXISTS "Konu sahibi siler"             ON exam_topics;

CREATE POLICY "Konu sahibi siler" ON exam_topics
  FOR DELETE TO authenticated
  USING (sahip_id = auth.uid() OR admin_mi());


CREATE OR REPLACE FUNCTION konu_yeniden_adlandir(p_ders TEXT, p_eski TEXT, p_yeni TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ogrenciler UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('teacher', 'admin')) THEN
    RAISE EXCEPTION 'Bu islem icin ogretmen yetkisi gerekiyor';
  END IF;

  -- Yalnızca çağıranın onaylı öğrencileri. Bu sınır AYNEN duruyor:
  -- yeniden adlandırma öğrenci kayıtlarını da yeniden yazdığı için
  -- başkasının öğrencisine dokunmamalı.
  SELECT array_agg(student_id) INTO v_ogrenciler
  FROM teacher_students
  WHERE teacher_id = auth.uid() AND durum = 'onaylandi';

  IF v_ogrenciler IS NULL THEN v_ogrenciler := ARRAY[]::UUID[]; END IF;

  UPDATE tasks         SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski AND student_id = ANY(v_ogrenciler);
  UPDATE test_sessions SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski AND student_id = ANY(v_ogrenciler);

  UPDATE exam_results er
  SET subject_details = jsonb_set(
        er.subject_details,
        ARRAY[p_ders, 'yanlis_konular'],
        (SELECT COALESCE(jsonb_agg(
                  CASE WHEN x = to_jsonb(p_eski) THEN to_jsonb(p_yeni) ELSE x END
                ), '[]'::jsonb)
         FROM jsonb_array_elements(er.subject_details -> p_ders -> 'yanlis_konular') x)
      )
  WHERE er.student_id = ANY(v_ogrenciler)
    AND er.subject_details ? p_ders
    AND er.subject_details -> p_ders -> 'yanlis_konular' @> to_jsonb(ARRAY[p_eski]);

  -- Konu kaydının kendisi: kendi eklediği konu, ya da platform sahibi
  -- ise ortak müfredattaki konu. Başka bir koçun konusuna dokunulmuyor.
  UPDATE exam_topics SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski
      AND (sahip_id = auth.uid() OR (admin_mi() AND sahip_id IS NULL));
END; $$;

REVOKE ALL ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- DOĞRULAMA
--
-- 1) Politikalar yerinde:
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename IN ('exam_topics','study_programs') ORDER BY tablename, policyname;
--
-- 2) Kural tablosu — bir koçun id'siyle:
--      SELECT count(*) FROM exam_topics WHERE sahip_id IS NULL;   -- 534
--      SELECT count(*) FROM exam_topics WHERE sahip_id IS NOT NULL; -- 1
--
-- 3) Asıl test uygulamadan: yekabukcu ile girip Konu Yönetimi'ni açın.
--    534 gömülü konu GÖRÜNMELİ, "TYT/Matematik/Problem" GÖRÜNMEMELİ.
--    Kendi hesabınızda ikisi de görünür.
--
-- NOT: Öğrencinin sınav/test formundaki konu listesi de bu politikadan
-- besleniyor. Öğrenci kendi kurumunda olduğu için koçunun konularını
-- görmeye devam eder; kurumlar arası bağlanan öğrenci için de yukarıdaki
-- "onaylı koçum" dalı devrede.
-- ============================================================
