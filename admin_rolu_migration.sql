-- ============================================================
-- ADMIN ROLÜ — ortak müfredatın sahibi
--
-- Amaç: KPSS/LGS/DGS dahil ortak müfredat bir admin hesabına bağlansın;
-- koçlar kendi konularını ekleyip yönetsin ama ortak tabana dokunamasın.
--
-- ── ÖNEMLİ TASARIM KARARI: ADMIN, ÖĞRETMENİN ÜST KÜMESİDİR ──
-- users.role TEK DEĞERLİ bir kolon. Mevcut öğretmen hesabı 'admin'
-- yapılsaydı artık 'teacher' olmayacak ve öğretmen politikalarının
-- tamamı (ogrencim_mi ile korunanlar dahil) o hesaba kapanacaktı —
-- yani koç bütün öğrencilerini kaybederdi.
--
-- Bu yüzden rol kontrolü ogretmen_mi() fonksiyonuna taşınıyor ve
-- fonksiyon admin'e de true diyor. Böylece tek hesap hem koçluk yapar
-- hem ortak müfredatı yönetir; ikinci bir hesap açmak gerekmez.
--
-- ⬇⬇ ÇALIŞTIRMADAN ÖNCE: admin yapılacak hesabın e-postasını yazın ⬇⬇
-- ============================================================

-- ------------------------------------------------------------
-- 0) Rol değerleri arasına admin ekle
--    users.role üzerinde bir CHECK kısıtı varsa (arayüzden kurulmuş
--    olabilir, migration dosyalarında yok) admin'i reddeder.
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.users'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%role%' LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Eski rol kisiti kaldirildi: %', r.conname;
  END LOOP;
END $$;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'parent', 'teacher', 'admin'));


-- ------------------------------------------------------------
-- 1) Öğretmen yetkisi kontrolü tek yere toplanıyor
--    Bundan sonra rol kontrolü gereken her yer bunu çağırır;
--    yeni bir rol eklendiğinde tek dosya değişir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ogretmen_mi()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role IN ('teacher', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION admin_mi()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin');
$$;

REVOKE ALL ON FUNCTION public.ogretmen_mi() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mi()    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ogretmen_mi() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mi()    TO authenticated;


-- ------------------------------------------------------------
-- 2) Hesabı admin yap
--    Rol kilidi tetikleyicisi (users_rol_kilidi) rol değişimini
--    engellediği için geçici olarak kapatılıp geri açılıyor.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eposta TEXT := 'melikeerdogan589@gmail.com';   -- ⬅⬅ DEĞİŞTİRİN
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.users WHERE email = v_eposta;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Bu e-postayla kullanici yok: %', v_eposta;
  END IF;

  ALTER TABLE public.users DISABLE TRIGGER users_rol_kilidi;
  UPDATE public.users SET role = 'admin' WHERE id = v_id;
  ALTER TABLE public.users ENABLE TRIGGER users_rol_kilidi;

  RAISE NOTICE 'Admin yapildi: % (%)', v_eposta, v_id;

  -- Ortak müfredatı (sahibi olmayan satırlar) bu hesaba bağla
  UPDATE public.exam_topics SET sahip_id = v_id WHERE sahip_id IS NULL;
  RAISE NOTICE 'Ortak mufredat admine baglandi';
END $$;


-- ------------------------------------------------------------
-- 3) exam_topics politikaları admin'i tanısın
--    Sahiplik artık dolu olduğu için silme/düzenleme kuralları da
--    netleşiyor: kendi eklediğini herkes yönetir, ortak tabanı admin.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Ogretmen kendi konusunu ekler"      ON exam_topics;
DROP POLICY IF EXISTS "Ogretmen kendi konusunu siler"      ON exam_topics;
DROP POLICY IF EXISTS "Ogretmen konu tercihlerini gunceller" ON exam_topics;

CREATE POLICY "Ogretmen kendi konusunu ekler" ON exam_topics
  FOR INSERT TO authenticated
  WITH CHECK (sahip_id = auth.uid() AND ogretmen_mi());

CREATE POLICY "Kendi konusunu siler" ON exam_topics
  FOR DELETE TO authenticated
  USING (sahip_id = auth.uid());

-- Güncelleme hâlâ tüm öğretmenlere açık: aktif ve agirlik kolonları
-- GLOBAL ve öğretmenin ortak müfredattaki bir konuyu gizleyebilmesi
-- gerekiyor. Bilinen sınır — kalıcı çözüm ogretmen_konu_tercihi tablosu.
CREATE POLICY "Ogretmen konu tercihlerini gunceller" ON exam_topics
  FOR UPDATE TO authenticated
  USING (ogretmen_mi()) WITH CHECK (ogretmen_mi());


-- ------------------------------------------------------------
-- 4) Diğer öğretmen kontrolleri de ogretmen_mi() kullansın
--    Aksi halde admin hesabı program yazamaz / konu adı değiştiremez.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Ogretmen kendi programini olusturur" ON study_programs;
CREATE POLICY "Ogretmen kendi programini olusturur" ON study_programs
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND ogretmen_mi());

CREATE OR REPLACE FUNCTION konu_yeniden_adlandir(p_ders TEXT, p_eski TEXT, p_yeni TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ogrenciler UUID[];
BEGIN
  IF NOT ogretmen_mi() THEN
    RAISE EXCEPTION 'Bu islem icin ogretmen yetkisi gerekiyor';
  END IF;

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

  -- Kendi eklediği konu; ortak tabanı yalnızca admin yeniden adlandırır
  UPDATE exam_topics SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski
      AND (sahip_id = auth.uid() OR admin_mi());
END; $$;

REVOKE ALL ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- DOĞRULAMA
--   SELECT email, role FROM users ORDER BY role;
--   -- hesabınız 'admin' olmalı, öğrenciler 'student'
--
--   SELECT sahip_id IS NULL AS sahipsiz, count(*) FROM exam_topics
--   GROUP BY 1;
--   -- sahipsiz = false, tek satır (hepsi admine bağlandı)
--
-- UYGULAMADA BOZULMAMASI GEREKEN: admin hesabı hâlâ öğretmen paneli
-- görüyor (App.jsx role'e bakıyor — SONRAKİ ADIMDA kod tarafı da
-- güncellenecek), öğrencileri duruyor, görev/program atayabiliyor.
-- ============================================================
