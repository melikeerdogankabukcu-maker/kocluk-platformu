-- ============================================================
-- Migration: kurum logosu (kurumsal kimlik)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ÖNCE kurum_yonetimi_migration.sql çalışmış olmalı.
-- ============================================================
--
-- Karar: üst barda kurum logosu ve adı görünüyor; RENK kullanıcının
-- kendi seçtiği palet olarak KALIYOR. Kişiselleştirme yeni eklendi,
-- kurum rengi onu sessizce geri almış olurdu.
--
-- ── LOGOYU KİM GÖRÜYOR ──────────────────────────────────────
-- Kurumun koçları, onların öğrencileri ve velileri. Satış değeri
-- burada: dershane velisine kendi markasını gösteriyor.
--
-- Öğrencide kurum doğrudan yazılı DEĞİL (users.kurum_id yalnız
-- koçlarda dolu), o yüzden "koçumun kurumu" çözülüyor.
--
-- ── ANAHTAR LOGONUN VARLIĞI, KURUM TÜRÜ DEĞİL ───────────────
-- Tek kişilik bireysel kurumda da logo gösteriliyor: kendi markasıyla
-- çalışan bir koç için bu doğru davranış. Logo yoksa platformun genel
-- markası kalıyor. Yani "kurumsal mı" sorusunu ayrıca sormaya gerek
-- yok; logo varsa marka var.

ALTER TABLE kurumlar ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ------------------------------------------------------------
-- 1) Kişinin MARKA kurumu
-- ------------------------------------------------------------
-- `kurumlar` okuma politikası `id = kurumum()`; öğrenci koçunun
-- kurumunu O YOLLA GÖREMEZ. Bu yüzden SECURITY DEFINER ve yalnız
-- marka için gereken üç alanı döndürüyor (ad, logo) — kurum
-- kaydının tamamı açılmıyor.
CREATE OR REPLACE FUNCTION public.marka_kurumum()
RETURNS TABLE (kurum_id UUID, ad TEXT, logo_url TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ben UUID := auth.uid(); rolum TEXT; k UUID;
BEGIN
  IF ben IS NULL THEN RETURN; END IF;
  SELECT u.role INTO rolum FROM users u WHERE u.id = ben;

  -- ÇÖZÜM ROLE GÖRE. İlk sürüm önce `users.kurum_id`e bakıyordu ve
  -- öğrencinin kendi kurum alanı herhangi bir sebeple doluysa
  -- koçunun kurumuna HİÇ bakmıyordu. Öğrenci için anlamlı marka her
  -- zaman koçunun kurumu.
  IF rolum IN ('teacher', 'admin') THEN
    SELECT u.kurum_id INTO k FROM users u WHERE u.id = ben;

  ELSIF rolum = 'student' THEN
    -- Birden fazla koç olabiliyor; LOGOSU OLAN kurum tercih ediliyor,
    -- eşitlikte en eski bağ. Sıra belirsiz bırakılsaydı aynı öğrenci
    -- her açılışta başka marka görebilirdi.
    SELECT koc.kurum_id INTO k
      FROM teacher_students ts
      JOIN users koc ON koc.id = ts.teacher_id
      LEFT JOIN kurumlar kr ON kr.id = koc.kurum_id
     WHERE ts.student_id = ben AND ts.durum = 'onaylandi'
       AND koc.kurum_id IS NOT NULL
     ORDER BY (kr.logo_url IS NULL), ts.created_at
     LIMIT 1;

  ELSIF rolum = 'parent' THEN
    SELECT koc.kurum_id INTO k
      FROM family_links fl
      JOIN teacher_students ts ON ts.student_id = fl.student_id AND ts.durum = 'onaylandi'
      JOIN users koc ON koc.id = ts.teacher_id
      LEFT JOIN kurumlar kr ON kr.id = koc.kurum_id
     WHERE fl.parent_id = ben AND koc.kurum_id IS NOT NULL
     ORDER BY (kr.logo_url IS NULL), ts.created_at
     LIMIT 1;
  END IF;

  IF k IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT kr.id, kr.ad, kr.logo_url FROM kurumlar kr WHERE kr.id = k;
END $fn$;

REVOKE ALL ON FUNCTION public.marka_kurumum() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marka_kurumum() TO authenticated;

-- ------------------------------------------------------------
-- 2) Logoyu kim görebilir
-- ------------------------------------------------------------
-- Depo politikası ve marka çözümü AYNI soruyu soruyor; tek yerde
-- duruyor ki ikisi ayrışmasın.
CREATE OR REPLACE FUNCTION public.kurum_markasini_gorebilir_miyim(p_kurum UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT p_kurum IS NOT NULL AND (
    admin_mi()
    -- kurumun kendi üyesi
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.kurum_id = p_kurum)
    -- koçu o kurumda olan öğrenci
    OR EXISTS (
      SELECT 1 FROM teacher_students ts JOIN users koc ON koc.id = ts.teacher_id
       WHERE ts.student_id = auth.uid() AND ts.durum = 'onaylandi'
         AND koc.kurum_id = p_kurum
    )
    -- çocuğunun koçu o kurumda olan veli
    OR EXISTS (
      SELECT 1 FROM family_links fl
        JOIN teacher_students ts ON ts.student_id = fl.student_id AND ts.durum = 'onaylandi'
        JOIN users koc ON koc.id = ts.teacher_id
       WHERE fl.parent_id = auth.uid() AND koc.kurum_id = p_kurum
    )
  );
$fn$;

REVOKE ALL ON FUNCTION public.kurum_markasini_gorebilir_miyim(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kurum_markasini_gorebilir_miyim(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3) Logoyu yöneticisi yazar
-- ------------------------------------------------------------
-- `kurumlar` UPDATE politikası zaten kurum yöneticisini geçiriyor
-- (id = kurumum() AND kurum_yoneticisi_mi()), ayrıca bir şey
-- gerekmiyor — logo_url o satırın bir kolonu.

-- ------------------------------------------------------------
-- 4) Depo izni: kurum/<kurum_id>/...
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kurum_logosu_kurum(p_name TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE parcalar TEXT[];
BEGIN
  parcalar := string_to_array(COALESCE(p_name, ''), '/');
  IF array_length(parcalar, 1) < 3 OR parcalar[1] <> 'kurum' THEN
    RETURN NULL;
  END IF;
  IF parcalar[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN parcalar[2]::uuid;
  END IF;
  RETURN NULL;
END $fn$;

REVOKE ALL ON FUNCTION public.kurum_logosu_kurum(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kurum_logosu_kurum(TEXT) TO authenticated;

DROP POLICY IF EXISTS "Kurum logosunu yetkili okur" ON storage.objects;
CREATE POLICY "Kurum logosunu yetkili okur" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.kurum_logosu_kurum(name) IS NOT NULL
    AND public.kurum_markasini_gorebilir_miyim(public.kurum_logosu_kurum(name))
  );

-- Yazma: yalnız o kurumun YÖNETİCİSİ.
DROP POLICY IF EXISTS "Kurum logosunu yonetici yukler" ON storage.objects;
CREATE POLICY "Kurum logosunu yonetici yukler" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'homework'
    AND public.kurum_logosu_kurum(name) IS NOT NULL
    AND (public.admin_mi()
         OR (public.kurum_yoneticisi_mi()
             AND public.kurum_logosu_kurum(name) = public.kurumum()))
  );

DROP POLICY IF EXISTS "Kurum logosunu yonetici gunceller" ON storage.objects;
CREATE POLICY "Kurum logosunu yonetici gunceller" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.kurum_logosu_kurum(name) IS NOT NULL
    AND (public.admin_mi()
         OR (public.kurum_yoneticisi_mi()
             AND public.kurum_logosu_kurum(name) = public.kurumum()))
  );

DROP POLICY IF EXISTS "Kurum logosunu yonetici siler" ON storage.objects;
CREATE POLICY "Kurum logosunu yonetici siler" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.kurum_logosu_kurum(name) IS NOT NULL
    AND (public.admin_mi()
         OR (public.kurum_yoneticisi_mi()
             AND public.kurum_logosu_kurum(name) = public.kurumum()))
  );

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  yonetici UUID; koc UUID; ogr UUID; veli UUID; yabanci UUID; kurum UUID;
  e_kurum UUID; e_rol TEXT; yol TEXT; r RECORD;
  gecen INTEGER := 0; atlanan TEXT := '';
BEGIN
  SELECT u.id INTO yonetici FROM users u WHERE u.role = 'admin' LIMIT 1;
  IF yonetici IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - platform yoneticisi yok');
    RETURN;
  END IF;

  SELECT ts.teacher_id, ts.student_id INTO koc, ogr
    FROM teacher_students ts WHERE ts.durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;
  SELECT fl.parent_id INTO veli FROM family_links fl WHERE fl.student_id = ogr LIMIT 1;

  SELECT kurum_id, kurum_rolu INTO e_kurum, e_rol FROM users WHERE id = koc;

  INSERT INTO kurumlar (ad, tur, logo_url)
  VALUES ('__SINAMA_MARKA__', 'okul', NULL) RETURNING id INTO kurum;
  yol := 'kurum/' || kurum::text || '/logo.png';
  UPDATE kurumlar SET logo_url = yol WHERE id = kurum;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = kurum, kurum_rolu = 'yonetici' WHERE id = koc;
  PERFORM set_config('request.jwt.claims', '', true);

  -- a) yol cozumleme
  IF kurum_logosu_kurum(yol) <> kurum THEN
    RAISE EXCEPTION 'SINAMA a: yoldan kurum kimligi cikmadi';
  END IF;
  IF kurum_logosu_kurum('abc/def.png') IS NOT NULL
     OR kurum_logosu_kurum('kurum/bozuk/x.png') IS NOT NULL THEN
    RAISE EXCEPTION 'SINAMA a2: bozuk yol NULL donmedi';
  END IF;
  gecen := gecen + 1;

  SET LOCAL ROLE authenticated;

  -- b) KOC kendi kurumunun markasini goruyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  SELECT * INTO r FROM marka_kurumum();
  IF r.kurum_id IS DISTINCT FROM kurum THEN
    RAISE EXCEPTION 'SINAMA b: koc kendi kurumunun markasini goremedi';
  END IF;
  gecen := gecen + 1;

  -- c) OGRENCI kocunun kurumunu goruyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT * INTO r FROM marka_kurumum();
  IF r.kurum_id IS DISTINCT FROM kurum THEN
    -- Hata mesaji NE BULDUGUNU soyluyor: "goremedi" tek basina
    -- sebebi aramak icin yeterli degil.
    RAISE EXCEPTION 'SINAMA c: ogrenci markasi yanlis. donen=% beklenen=% ogrenci_rolu=% ogrenci_kurumu=% koc_kurumu=% bag_sayisi=%',
      COALESCE(r.kurum_id::text, 'YOK'), kurum,
      (SELECT role FROM users WHERE id = ogr),
      COALESCE((SELECT kurum_id::text FROM users WHERE id = ogr), 'NULL'),
      COALESCE((SELECT kurum_id::text FROM users WHERE id = koc), 'NULL'),
      (SELECT count(*) FROM teacher_students WHERE student_id = ogr AND durum = 'onaylandi');
  END IF;
  IF r.logo_url IS DISTINCT FROM yol THEN
    RAISE EXCEPTION 'SINAMA c2: logo adresi gelmedi';
  END IF;
  gecen := gecen + 1;

  -- d) ogrenci kurumlar tablosunu HALA okuyamiyor (sadece marka acildi)
  IF EXISTS (SELECT 1 FROM kurumlar WHERE id = kurum) THEN
    RAISE EXCEPTION 'SINAMA d: ogrenci kurum kaydinin tamamini gordu';
  END IF;
  gecen := gecen + 1;

  -- e) depo izni: ogrenci logoyu gorebiliyor
  IF NOT kurum_markasini_gorebilir_miyim(kurum) THEN
    RAISE EXCEPTION 'SINAMA e: ogrenciye logo acilmadi';
  END IF;
  gecen := gecen + 1;

  -- f) VELI de goruyor
  IF veli IS NULL THEN
    atlanan := atlanan || 'veli markasi (cocugu olan veli yok); ';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', veli)::text, true);
    SELECT * INTO r FROM marka_kurumum();
    IF r.kurum_id IS DISTINCT FROM kurum THEN
      RAISE EXCEPTION 'SINAMA f: veli cocugunun kurumunu goremedi';
    END IF;
    gecen := gecen + 1;
  END IF;

  -- g) ILGISIZ kullanici ne markayi ne logoyu goruyor
  RESET ROLE;
  SELECT u.id INTO yabanci FROM users u
   WHERE u.id <> koc AND u.id <> ogr AND u.role <> 'admin'
     AND COALESCE(u.kurum_id::text, '') <> kurum::text
     AND NOT EXISTS (SELECT 1 FROM teacher_students ts
                      WHERE ts.student_id = u.id AND ts.teacher_id = koc)
     AND NOT EXISTS (SELECT 1 FROM family_links fl WHERE fl.parent_id = u.id AND fl.student_id = ogr)
   LIMIT 1;
  IF yabanci IS NULL THEN
    atlanan := atlanan || 'ilgisiz kullanici (uygun denek yok); ';
  ELSE
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yabanci)::text, true);
    IF kurum_markasini_gorebilir_miyim(kurum) THEN
      RAISE EXCEPTION 'SINAMA g: ilgisiz kullaniciya logo acildi';
    END IF;
    gecen := gecen + 1;
  END IF;

  -- Temizlik
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = e_kurum, kurum_rolu = e_rol WHERE id = koc;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM kurumlar WHERE id = kurum;

  INSERT INTO _sinama_sonucu VALUES (
    format('GECTI - %s davranis sinamasi%s', gecen,
           CASE WHEN atlanan = '' THEN '' ELSE ' | ATLANAN: ' || atlanan END));
END $test$;

SELECT sonuc AS "kurum_marka" FROM _sinama_sonucu;
