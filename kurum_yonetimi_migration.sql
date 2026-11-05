-- ============================================================
-- Migration: kurum yöneticisinin yetkileri
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema. Akış: KURUM_ALTYAPISI.md
-- ============================================================
--
-- ── NEDEN RPC, NEDEN RLS GENİŞLETİLMİYOR ────────────────────
-- Kurum yöneticisinin her işi BAŞKASININ satırına dokunuyor: başka
-- kullanıcının kurum_id'si, başka koçun öğrenci bağı. Bunları RLS ile
-- açmak o genişliği yalnız bu ekranlar için değil HER SORGU için
-- açardı. Onun yerine her işlem tek bir SECURITY DEFINER fonksiyonunda
-- ve girişte kurum_yoneticisi_mi() denetimiyle.
--
-- Bugün yönetici hiçbir şey yapamıyor: users üzerinde UPDATE yalnız
-- kendi satırına ve platform yöneticisine açık, dolayısıyla
-- users_rol_koru içindeki kurum yöneticisi izni hiç devreye girmiyor.

-- ------------------------------------------------------------
-- 0) users_rol_koru GENİŞLETİLİYOR
-- ------------------------------------------------------------
-- Tetikleyici kurum yöneticisine yalnız "kendi kurumuna ALMA" izni
-- veriyordu: `NEW.kurum_id = kurumum()`. Çıkarma (`kurum_id = NULL`)
-- bu koşulu sağlamadığı için reddediliyordu — yani aşağıdaki
-- `kurumdan_koc_cikar` çalışma anında patlardı. Aynı şekilde yeni
-- üyeye `kurum_rolu` yazmak da takılıyordu, çünkü o dal
-- `OLD.kurum_id = kurumum()` istiyor ve yeni üyenin eski kurumu NULL.
--
-- Eksik olan yetki değil, kuralın yarısıydı: "üye al" yazılmış,
-- "üye çıkar" yazılmamış.
--
-- Bu genişletme istemciye yeni bir kapı AÇMIYOR: `users` üzerinde
-- UPDATE zaten yalnız kendi satırına ve platform yöneticisine açık.
-- Buradaki izin yalnız SECURITY DEFINER fonksiyonların önünü açıyor.
--
-- Ayrıca baştaki yorumda yazan ama koda geçmemiş kural artık
-- işletiliyor: KİMSE KENDİ kurumunu değiştiremiyor. Yoksa bir
-- yönetici kendini kurumdan çıkarıp kurumu yöneticisiz bırakabilirdi.
CREATE OR REPLACE FUNCTION users_rol_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT admin_mi() THEN
      RAISE EXCEPTION 'Rol degistirilemez. Ogretmen yetkisi yalnizca yonetici tarafindan verilir.';
    END IF;
    IF NEW.role NOT IN ('student', 'parent', 'teacher') THEN
      RAISE EXCEPTION 'Bu rol uygulamadan atanamaz: %', NEW.role;
    END IF;
  END IF;

  IF NEW.onay_durumu IS DISTINCT FROM OLD.onay_durumu AND NOT admin_mi() THEN
    RAISE EXCEPTION 'Hesap onayi yalnizca yonetici tarafindan degistirilebilir.';
  END IF;

  IF NEW.kurum_id IS DISTINCT FROM OLD.kurum_id THEN
    IF admin_mi() THEN
      NULL;                                  -- platform yöneticisi serbest
    ELSIF NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'Kendi kurumunuzu degistiremezsiniz.';
    ELSIF kurum_yoneticisi_mi() AND (
            NEW.kurum_id = kurumum()                               -- üye alma
         OR (OLD.kurum_id = kurumum() AND NEW.kurum_id IS NULL)    -- üye çıkarma
          ) THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Kurum degisikligi yalnizca yonetici tarafindan yapilabilir.';
    END IF;
  END IF;

  IF NEW.kurum_rolu IS DISTINCT FROM OLD.kurum_rolu THEN
    -- Kurum rolü, üyenin kuruma GİRERKEN de yazılabilmeli: o anda
    -- OLD.kurum_id henüz NULL.
    IF NOT (admin_mi() OR (kurum_yoneticisi_mi()
            AND (OLD.kurum_id = kurumum() OR NEW.kurum_id = kurumum()))) THEN
      RAISE EXCEPTION 'Kurum rolu yalnizca yonetici tarafindan degistirilebilir.';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.users_rol_koru() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- Ortak kapı
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kurum_kapisi()
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE k UUID;
BEGIN
  k := kurumum();
  IF k IS NULL THEN
    RAISE EXCEPTION 'Bir kuruma bagli degilsiniz.' USING ERRCODE = '42501';
  END IF;
  IF NOT (kurum_yoneticisi_mi() OR admin_mi()) THEN
    RAISE EXCEPTION 'Bu islem kurum yoneticisine acik.' USING ERRCODE = '42501';
  END IF;
  RETURN k;
END $fn$;

REVOKE ALL ON FUNCTION public.kurum_kapisi() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 1) Kurumun koçları + özet sayılar
-- ------------------------------------------------------------
-- Sayılar SUNUCUDA toplanıyor: müdüre satırlar değil özet iniyor.
-- Hem izinleri genişletmemek hem de bir dershanede yüzlerce satırı
-- tarayıcıya indirmemek için.
CREATE OR REPLACE FUNCTION public.kurum_koclari()
RETURNS TABLE (
  koc_id UUID, ad TEXT, kurum_rolu TEXT,
  ogrenci_sayisi BIGINT,
  gorev_toplam BIGINT, gorev_biten BIGINT,
  test_30g BIGINT, calisma_dk_30g BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE k UUID := kurum_kapisi();
BEGIN
  RETURN QUERY
  WITH koclar AS (
    SELECT u.id, u.full_name, u.kurum_rolu
      FROM users u
     WHERE u.kurum_id = k AND u.role IN ('teacher', 'admin')
  ),
  baglar AS (
    SELECT ts.teacher_id, ts.student_id
      FROM teacher_students ts
      JOIN koclar c ON c.id = ts.teacher_id
     WHERE ts.durum = 'onaylandi'
  )
  SELECT c.id, c.full_name, c.kurum_rolu,
         (SELECT count(*) FROM baglar b WHERE b.teacher_id = c.id),
         (SELECT count(*) FROM tasks t
           WHERE t.student_id IN (SELECT student_id FROM baglar b WHERE b.teacher_id = c.id)),
         (SELECT count(*) FROM tasks t
           WHERE t.student_id IN (SELECT student_id FROM baglar b WHERE b.teacher_id = c.id)
             AND t.is_done),
         (SELECT count(*) FROM test_sessions s
           WHERE s.student_id IN (SELECT student_id FROM baglar b WHERE b.teacher_id = c.id)
             AND s.created_at >= now() - INTERVAL '30 days'),
         COALESCE((SELECT sum(cb.sayacla_olculen_dk) FROM calisma_bloklari cb
                    JOIN calisma_planlari cp ON cp.id = cb.plan_id
                   WHERE cp.student_id IN (SELECT student_id FROM baglar b WHERE b.teacher_id = c.id)
                     AND cp.hafta_basi >= (CURRENT_DATE - 30)), 0)
    FROM koclar c
   ORDER BY c.full_name;
END $fn$;

REVOKE ALL ON FUNCTION public.kurum_koclari() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kurum_koclari() TO authenticated;

-- ------------------------------------------------------------
-- 2) Kurumun öğrencileri (hangi koçta)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kurum_ogrencileri()
RETURNS TABLE (ogrenci_id UUID, ad TEXT, koc_id UUID, koc_adi TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE k UUID := kurum_kapisi();
BEGIN
  RETURN QUERY
    SELECT o.id, o.full_name, kc.id, kc.full_name
      FROM teacher_students ts
      JOIN users kc ON kc.id = ts.teacher_id AND kc.kurum_id = k
      JOIN users o  ON o.id  = ts.student_id
     WHERE ts.durum = 'onaylandi'
     ORDER BY kc.full_name, o.full_name;
END $fn$;

REVOKE ALL ON FUNCTION public.kurum_ogrencileri() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kurum_ogrencileri() TO authenticated;

-- ------------------------------------------------------------
-- 3) Koç ekleme — E-POSTA İLE
-- ------------------------------------------------------------
-- E-posta artık istemciye hiç inmiyor (users_sutun_izni_migration).
-- Müdür bir listeden seçemez; yazdığı adresi SUNUCU çözüyor. Bu,
-- daraltmanın etrafından dolaşmak değil, onunla tutarlı tek yol.
CREATE OR REPLACE FUNCTION public.kuruma_koc_ekle(p_eposta TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE k UUID := kurum_kapisi(); hedef RECORD;
BEGIN
  SELECT u.id, u.full_name, u.role, u.kurum_id INTO hedef
    FROM users u
   WHERE lower(trim(u.email)) = lower(trim(p_eposta));

  IF hedef IS NULL THEN
    RAISE EXCEPTION 'Bu e-postayla kayitli kullanici yok.' USING ERRCODE = 'P0001';
  END IF;
  IF hedef.role NOT IN ('teacher', 'admin') THEN
    RAISE EXCEPTION 'Bu kullanici ogretmen degil.' USING ERRCODE = 'P0001';
  END IF;
  IF hedef.kurum_id = k THEN
    RAISE EXCEPTION 'Bu koc zaten kurumunuzda.' USING ERRCODE = 'P0001';
  END IF;
  -- Başka kurumdaysa sessizce taşınmıyor: iki kurum aynı koç
  -- üzerinden birbirinin içeriğini görmeye başlardı.
  IF hedef.kurum_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bu koc baska bir kuruma bagli; once oradan ayrilmasi gerekiyor.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE users SET kurum_id = k, kurum_rolu = 'uye' WHERE id = hedef.id;
  RETURN hedef.full_name;
END $fn$;

REVOKE ALL ON FUNCTION public.kuruma_koc_ekle(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kuruma_koc_ekle(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 4) Koç çıkarma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kurumdan_koc_cikar(p_koc UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE k UUID := kurum_kapisi(); ogrenci_sayisi INTEGER;
BEGIN
  -- Müdür KENDİNİ çıkaramıyor: kurum yöneticisiz kalırsa içeri kimse
  -- koç ekleyemez ve kurum kilitlenir.
  IF p_koc = auth.uid() THEN
    RAISE EXCEPTION 'Kendinizi kurumdan cikaramazsiniz.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_koc AND u.kurum_id = k) THEN
    RAISE EXCEPTION 'Bu koc kurumunuzda degil.' USING ERRCODE = 'P0001';
  END IF;

  -- Öğrencisi duran koç çıkarılmıyor: bağlar koçta kalır ve kurum
  -- o öğrencileri bir daha göremez. Önce devir.
  SELECT count(*) INTO ogrenci_sayisi FROM teacher_students ts
   WHERE ts.teacher_id = p_koc AND ts.durum = 'onaylandi';
  IF ogrenci_sayisi > 0 THEN
    RAISE EXCEPTION 'Bu kocun % ogrencisi var; once baska koca devredin.', ogrenci_sayisi
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE users SET kurum_id = NULL, kurum_rolu = 'uye' WHERE id = p_koc;
END $fn$;

REVOKE ALL ON FUNCTION public.kurumdan_koc_cikar(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kurumdan_koc_cikar(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5) Öğrenci devri
-- ------------------------------------------------------------
-- Görev, sınav ve plan politikaları teacher_id'ye değil
-- ogrencim_mi(student_id)'ye bakıyor (38 yerde). Yani bağ devredilince
-- yeni koç öğrencinin GEÇMİŞİNİ de görüyor; ayrıca veri taşımak
-- gerekmiyor.
CREATE OR REPLACE FUNCTION public.ogrenci_devret(
  p_ogrenci UUID, p_eski_koc UUID, p_yeni_koc UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE k UUID := kurum_kapisi();
BEGIN
  IF p_eski_koc = p_yeni_koc THEN
    RAISE EXCEPTION 'Eski ve yeni koc ayni.' USING ERRCODE = 'P0001';
  END IF;
  -- İKİ koç da bu kurumda olmalı: aksi hâlde müdür öğrenciyi kurum
  -- dışına çıkarabilirdi.
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_eski_koc AND kurum_id = k)
  OR NOT EXISTS (SELECT 1 FROM users WHERE id = p_yeni_koc AND kurum_id = k) THEN
    RAISE EXCEPTION 'Her iki koc da kurumunuzda olmali.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM teacher_students
                  WHERE teacher_id = p_eski_koc AND student_id = p_ogrenci
                    AND durum = 'onaylandi') THEN
    RAISE EXCEPTION 'Bu ogrenci o koca bagli degil.' USING ERRCODE = 'P0001';
  END IF;

  -- Yeni koçta zaten bağ varsa eskisi siliniyor; yoksa taşınıyor.
  -- Birincil anahtar (teacher_id, student_id) olduğu için düz UPDATE
  -- çakışabilirdi.
  IF EXISTS (SELECT 1 FROM teacher_students
              WHERE teacher_id = p_yeni_koc AND student_id = p_ogrenci) THEN
    UPDATE teacher_students SET durum = 'onaylandi'
     WHERE teacher_id = p_yeni_koc AND student_id = p_ogrenci;
    DELETE FROM teacher_students
     WHERE teacher_id = p_eski_koc AND student_id = p_ogrenci;
  ELSE
    UPDATE teacher_students SET teacher_id = p_yeni_koc
     WHERE teacher_id = p_eski_koc AND student_id = p_ogrenci;
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.ogrenci_devret(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ogrenci_devret(UUID, UUID, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- ── SINAMA ORTAMI VARSAYMIYOR, KEŞFEDİYOR ───────────────────
-- Önceki sürümler ortam hakkında sessiz varsayımlar yapıyordu ve üç
-- kez kendi varsayımını ölçtü:
--   • müdür seçilen koç aynı zamanda PLATFORM yöneticisiydi; "üye
--     çağıramaz" sınaması haklı olarak geçti, çünkü admin_mi() kurum
--     kapısını zaten açıyor,
--   • ikinci koçun kendi öğrencileri vardı; "devredince çıkarılır"
--     sınaması haklı olarak düştü,
--   • devir doğrulaması müdür rolünde yapıldı ve RLS satırı gizledi.
--
-- Bu sürüm her adımın ön koşulunu ÖNCE arıyor; bulamazsa adımı
-- atlayıp SEBEBİNİ sonuca yazıyor. "Geçti" ile "sınanamadı" artık
-- birbirine karışmıyor.
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  yonetici UUID; mudur UUID; uye UUID; ogr UUID; kurum UUID;
  mudur_admin_mi BOOLEAN; uye_bos_mu BOOLEAN;
  e_kurum_m UUID; e_rol_m TEXT; e_kurum_u UUID; ogr_eposta TEXT;
  sayi INTEGER; red BOOLEAN; r RECORD;
  gecen INTEGER := 0; atlanan TEXT := '';
BEGIN
  -- ── Ortamı keşfet ────────────────────────────────────────
  SELECT u.id INTO yonetici FROM users u WHERE u.role = 'admin' LIMIT 1;
  IF yonetici IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - platform yoneticisi yok');
    RETURN;
  END IF;

  -- Müdür tercihen ADMIN OLMAYAN bir koç: admin_mi() kurum kapısını
  -- zaten açtığı için yetki reddi ancak böyle sınanabiliyor.
  SELECT ts.teacher_id, ts.student_id INTO mudur, ogr
    FROM teacher_students ts
    JOIN users u ON u.id = ts.teacher_id
   WHERE ts.durum = 'onaylandi' AND u.role = 'teacher'
   LIMIT 1;
  IF mudur IS NULL THEN
    SELECT ts.teacher_id, ts.student_id INTO mudur, ogr
      FROM teacher_students ts WHERE ts.durum = 'onaylandi' LIMIT 1;
  END IF;
  IF mudur IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;
  SELECT (u.role = 'admin') INTO mudur_admin_mi FROM users u WHERE u.id = mudur;

  -- İkinci koç tercihen ÖĞRENCİSİ OLMAYAN biri.
  SELECT u.id INTO uye FROM users u
   WHERE u.role IN ('teacher','admin') AND u.id <> mudur
     AND NOT EXISTS (SELECT 1 FROM teacher_students ts
                      WHERE ts.teacher_id = u.id AND ts.durum = 'onaylandi')
   LIMIT 1;
  uye_bos_mu := uye IS NOT NULL;
  IF uye IS NULL THEN
    SELECT u.id INTO uye FROM users u
     WHERE u.role IN ('teacher','admin') AND u.id <> mudur LIMIT 1;
  END IF;

  SELECT kurum_id, kurum_rolu INTO e_kurum_m, e_rol_m FROM users WHERE id = mudur;
  IF uye IS NOT NULL THEN SELECT kurum_id INTO e_kurum_u FROM users WHERE id = uye; END IF;
  SELECT email INTO ogr_eposta FROM users WHERE id = ogr;

  -- ── Kurulum: PLATFORM YÖNETİCİSİ kimliğiyle ──────────────
  -- users_rol_koru tablo sahibine de işliyor ve SQL Editor'da
  -- auth.uid() boş; düz UPDATE reddedilirdi.
  INSERT INTO kurumlar (ad, tur) VALUES ('__SINAMA_KURUM__', 'okul') RETURNING id INTO kurum;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = kurum, kurum_rolu = 'yonetici' WHERE id = mudur;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', mudur)::text, true);

  -- a) kurum koclari listesi
  SELECT count(*) INTO sayi FROM kurum_koclari();
  IF sayi < 1 THEN RAISE EXCEPTION 'SINAMA a: koc listesi bos'; END IF;
  gecen := gecen + 1;

  -- b) ogrenci sayisi dogru
  SELECT * INTO r FROM kurum_koclari() WHERE koc_id = mudur;
  IF r.ogrenci_sayisi < 1 THEN
    RAISE EXCEPTION 'SINAMA b: ogrenci sayisi % (en az 1 bekleniyordu)', r.ogrenci_sayisi;
  END IF;
  gecen := gecen + 1;

  -- c) ogrenci listesi
  SELECT count(*) INTO sayi FROM kurum_ogrencileri() WHERE ogrenci_id = ogr;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA c: ogrenci listede yok'; END IF;
  gecen := gecen + 1;

  -- d) mudur KENDINI cikaramiyor
  red := false;
  BEGIN PERFORM kurumdan_koc_cikar(mudur);
  EXCEPTION WHEN raise_exception THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: mudur kendini cikardi'; END IF;
  gecen := gecen + 1;

  -- e) olmayan e-posta reddediliyor
  red := false;
  BEGIN PERFORM kuruma_koc_ekle('__yok__@ornek.test');
  EXCEPTION WHEN raise_exception THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA e: olmayan e-posta kabul edildi'; END IF;
  gecen := gecen + 1;

  -- f) ogretmen olmayan eklenemiyor
  red := false;
  BEGIN PERFORM kuruma_koc_ekle(ogr_eposta);
  EXCEPTION WHEN raise_exception THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA f: ogrenci koc olarak eklendi'; END IF;
  gecen := gecen + 1;

  IF uye IS NULL THEN
    atlanan := atlanan || 'devir ve cikarma (ikinci ogretmen yok); ';
  ELSE
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
    UPDATE users SET kurum_id = kurum, kurum_rolu = 'uye' WHERE id = uye;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', mudur)::text, true);

    -- g) devir
    PERFORM ogrenci_devret(ogr, mudur, uye);
    -- Doğrulama SAHİP olarak: teacher_students politikası yalnız
    -- TARAFLARI geçiriyor; müdür devredilen satırı göremez ve sonuç
    -- "devir olmadı" diye okunurdu.
    RESET ROLE;
    SELECT count(*) INTO sayi FROM teacher_students
     WHERE teacher_id = uye AND student_id = ogr AND durum = 'onaylandi';
    IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA g: devir olmadi'; END IF;
    SELECT count(*) INTO sayi FROM teacher_students
     WHERE teacher_id = mudur AND student_id = ogr;
    IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA g2: eski bag duruyor'; END IF;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', mudur)::text, true);
    gecen := gecen + 1;

    -- h) ogrencisi olan koc cikarilamiyor
    red := false;
    BEGIN PERFORM kurumdan_koc_cikar(uye);
    EXCEPTION WHEN raise_exception THEN red := true; END;
    IF NOT red THEN RAISE EXCEPTION 'SINAMA h: ogrencisi olan koc cikarildi'; END IF;
    gecen := gecen + 1;

    -- geri devret
    PERFORM ogrenci_devret(ogr, uye, mudur);
    gecen := gecen + 1;

    -- i) ogrencisi kalmayan koc cikarilabiliyor
    IF uye_bos_mu THEN
      PERFORM kurumdan_koc_cikar(uye);
      RESET ROLE;
      SELECT count(*) INTO sayi FROM users WHERE id = uye AND kurum_id = kurum;
      IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA i: koc cikarilmadi'; END IF;
      SET LOCAL ROLE authenticated;
      PERFORM set_config('request.jwt.claims', json_build_object('sub', mudur)::text, true);
      gecen := gecen + 1;
    ELSE
      atlanan := atlanan || 'bos koc cikarma (ikinci kocun kendi ogrencileri var); ';
    END IF;
  END IF;

  -- j) YONETICI OLMAYAN cagiramiyor
  --    Müdür aynı zamanda PLATFORM yöneticisiyse sınanamıyor:
  --    admin_mi() kurum kapısını açıyor ve bu DOĞRU davranış.
  IF mudur_admin_mi THEN
    atlanan := atlanan || 'yetki reddi (secilen koc ayni zamanda platform yoneticisi); ';
  ELSE
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
    UPDATE users SET kurum_rolu = 'uye' WHERE id = mudur;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', mudur)::text, true);
    red := false;
    BEGIN PERFORM count(*) FROM kurum_koclari();
    EXCEPTION WHEN insufficient_privilege THEN red := true; END;
    IF NOT red THEN RAISE EXCEPTION 'SINAMA j: uye kurum listesini aldi'; END IF;
    gecen := gecen + 1;
  END IF;

  -- ── Temizlik ─────────────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = e_kurum_m, kurum_rolu = e_rol_m WHERE id = mudur;
  IF uye IS NOT NULL THEN UPDATE users SET kurum_id = e_kurum_u WHERE id = uye; END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM kurumlar WHERE id = kurum;

  INSERT INTO _sinama_sonucu VALUES (
    format('GECTI - %s davranis sinamasi%s', gecen,
           CASE WHEN atlanan = '' THEN '' ELSE ' | ATLANAN: ' || atlanan END));
END $test$;

SELECT sonuc AS "kurum_yonetimi" FROM _sinama_sonucu;
