-- ============================================================
-- Migration: kurum içi içerik paylaşımı (SEÇMELİ)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ÖNCE kurum_yonetimi_migration.sql, envanter_migration.sql,
-- koc_envanteri_migration.sql, kitap_okuma_migration.sql.
-- ============================================================
--
-- Karar: koç içeriğini kuruma AÇIK işaretleyebiliyor; kendiliğinden
-- paylaşım yok.
--
-- ── ÖNCE GÖRÜNÜRLÜK ZİNCİRİ ÇIKARILDI ───────────────────────
-- İlk tasarım yanlıştı; çalıştırılsaydı ya hiçbir şeyi kısıtlamaz ya
-- da öğrencinin erişimini sessizce koparırdı. Canlıdaki zincir:
--
--   kurumda_gorunur_mu(sahip)           ← müfredat, hazır programlar
--     = sahip NULL | sahip = ben | admin | AYNI KURUM
--       | onaylı koçum | çocuğumun koçu
--
--   banka_sahibi_gorunur_mu(sahip)      ← soru bankası, bölümler
--     = kurumda_gorunur_mu(sahip) | öğrencim | çocuğum
--
--   soru_bankalari SELECT politikası
--     = banka_sahibi_gorunur_mu(sahip)
--       AND (sahibi | admin | PERSONEL | öğrenciye atanmış | veliye)
--
-- İki sonuç:
--   1. Politika EKLEMEK erişimi genişletir, daraltmaz. "Seçmeli"
--      davranış ancak fonksiyonun İÇİNDEKİ kurum dalı koşullu hâle
--      getirilerek olur.
--   2. O dal `kurumda_gorunur_mu` içinde ve onu müfredat ile hazır
--      programlar da kullanıyor; doğrudan değiştirmek onları bozardı.
--
-- Çözüm: fonksiyon DAVRANIŞ DEĞİŞTİRMEDEN ikiye ayrılıyor. Kurum dalı
-- kendi fonksiyonu oluyor, `kurumda_gorunur_mu` ikisinin birleşimi
-- olarak yeniden yazılıyor — müfredat ve programlar için hiçbir şey
-- değişmiyor. Soru bankası koşullu sürümü kullanıyor.

-- ------------------------------------------------------------
-- 1) Kurum dalı kendi fonksiyonuna ayrılıyor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ayni_kurumda_mi(p_sahip UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM users sahip, users ben
     WHERE sahip.id = p_sahip
       AND ben.id = auth.uid()
       AND sahip.kurum_id IS NOT NULL
       AND sahip.kurum_id = ben.kurum_id
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.ayni_kurumda_mi(UUID) TO authenticated;

-- Kurum DIŞINDAKİ bütün yollar: `kurumda_gorunur_mu`nun kurum dalı
-- çıkarılmış hâli, başka hiçbir fark yok.
CREATE OR REPLACE FUNCTION public.kurum_disi_gorunur_mu(p_sahip UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT
    p_sahip IS NULL                       -- gömülü: platformun ortak içeriği
    OR p_sahip = auth.uid()               -- kendi yazdığı
    OR admin_mi()                         -- platform yöneticisi
    OR EXISTS (                           -- onaylı koçum yazdıysa
      SELECT 1 FROM teacher_students
       WHERE teacher_id = p_sahip AND student_id = auth.uid()
         AND durum = 'onaylandi'
    )
    OR EXISTS (                           -- çocuğumun koçu yazdıysa
      SELECT 1 FROM family_links fl
        JOIN teacher_students ts ON ts.student_id = fl.student_id
       WHERE fl.parent_id = auth.uid()
         AND ts.teacher_id = p_sahip
         AND ts.durum = 'onaylandi'
    );
$fn$;

GRANT EXECUTE ON FUNCTION public.kurum_disi_gorunur_mu(UUID) TO authenticated;

-- DAVRANIŞI AYNI: iki parçanın birleşimi, eskisinin birebir karşılığı.
-- exam_topics ve study_programs bunu kullanmaya devam ediyor; orada
-- paylaşım hâlâ kendiliğinden.
CREATE OR REPLACE FUNCTION public.kurumda_gorunur_mu(p_sahip UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT kurum_disi_gorunur_mu(p_sahip) OR ayni_kurumda_mi(p_sahip);
$fn$;

GRANT EXECUTE ON FUNCTION public.kurumda_gorunur_mu(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2) Soru bankası: kurum dalı artık koşullu
-- ------------------------------------------------------------
-- VAR OLAN SATIRLAR AÇIK KALIYOR. Bugün kurum içinde kendiliğinden
-- paylaşılıyorlar; seçmeli yapmak meslektaşların bugün gördüğü
-- kitaplıkları gizlerdi. Kolon false varsayılanıyla ekleniyor, hemen
-- ardından var olanlar true yapılıyor; yalnız yeniler kapalı başlıyor.
DO $$
DECLARE yeni_kolon BOOLEAN;
BEGIN
  yeni_kolon := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'soru_bankalari'
       AND column_name = 'kuruma_acik');

  ALTER TABLE soru_bankalari
    ADD COLUMN IF NOT EXISTS kuruma_acik BOOLEAN NOT NULL DEFAULT false;

  IF yeni_kolon THEN
    UPDATE soru_bankalari SET kuruma_acik = true;
  END IF;
END $$;

-- İki argümanlı sürüm: kurum dalı bayrağa bağlı. Tek argümanlı eski
-- sürüm DURUYOR ve davranışı değişmiyor.
CREATE OR REPLACE FUNCTION public.banka_sahibi_gorunur_mu(p_sahip UUID, p_acik BOOLEAN)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT kurum_disi_gorunur_mu(p_sahip)
      OR ogrencim_mi(p_sahip)                      -- öğrencimin eklediği kaynak
      OR EXISTS (                                  -- çocuğumun eklediği kaynak
        SELECT 1 FROM family_links
         WHERE parent_id = auth.uid() AND student_id = p_sahip
      )
      OR (COALESCE(p_acik, false) AND ayni_kurumda_mi(p_sahip));
$fn$;

GRANT EXECUTE ON FUNCTION public.banka_sahibi_gorunur_mu(UUID, BOOLEAN) TO authenticated;

-- Canlıdaki politika birebir korunuyor; TEK fark görünürlük
-- çağrısının bayrağı da alması.
DROP POLICY IF EXISTS "Soru bankasini gorenler okur" ON soru_bankalari;
CREATE POLICY "Soru bankasini gorenler okur" ON soru_bankalari
  FOR SELECT TO authenticated
  USING (
    banka_sahibi_gorunur_mu(sahip_id, kuruma_acik)
    AND (
      sahip_id = auth.uid()
      OR admin_mi()
      OR EXISTS (SELECT 1 FROM users u
                  WHERE u.id = auth.uid() AND u.role IN ('teacher', 'admin'))
      OR banka_ogrenciye_acik_mi(id, auth.uid())
      OR EXISTS (SELECT 1 FROM family_links fl
                  WHERE fl.parent_id = auth.uid()
                    AND banka_ogrenciye_acik_mi(soru_bankalari.id, fl.student_id))
    )
  );

-- Bölümler kitabın görünürlüğüne bağlı; bayrağı kitaptan okuyor.
CREATE OR REPLACE FUNCTION public.banka_gorunur_mu(p_banka UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM soru_bankalari b
     WHERE b.id = p_banka
       AND banka_sahibi_gorunur_mu(b.sahip_id, b.kuruma_acik)
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.banka_gorunur_mu(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3) Koç envanteri — varsayılan KAPALI
-- ------------------------------------------------------------
ALTER TABLE koc_envanterleri
  ADD COLUMN IF NOT EXISTS kuruma_acik BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Koc envanterini kurum okur" ON koc_envanterleri;
CREATE POLICY "Koc envanterini kurum okur" ON koc_envanterleri
  FOR SELECT TO authenticated
  USING (kuruma_acik AND ayni_kurumda_mi(sahip_id));

-- Öğrenci, koçunun kuruma açılmış envanterini de görmeli: envanteri
-- meslektaşı yazmış olsa bile koçu onu atayabiliyor.
DROP POLICY IF EXISTS "Kurum envanterini ogrenci okur" ON koc_envanterleri;
CREATE POLICY "Kurum envanterini ogrenci okur" ON koc_envanterleri
  FOR SELECT TO authenticated
  USING (
    kuruma_acik
    AND EXISTS (
      SELECT 1 FROM teacher_students ts
        JOIN users kocum ON kocum.id = ts.teacher_id
        JOIN users yazan ON yazan.id = koc_envanterleri.sahip_id
       WHERE ts.student_id = auth.uid()
         AND ts.durum = 'onaylandi'
         AND kocum.kurum_id IS NOT NULL
         AND kocum.kurum_id = yazan.kurum_id
    )
  );

-- ------------------------------------------------------------
-- 4) Okuma kitabı — varsayılan KAPALI
-- ------------------------------------------------------------
ALTER TABLE okuma_kitaplari
  ADD COLUMN IF NOT EXISTS kuruma_acik BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Kitabi kurum okur" ON okuma_kitaplari;
CREATE POLICY "Kitabi kurum okur" ON okuma_kitaplari
  FOR SELECT TO authenticated
  USING (kuruma_acik AND ayni_kurumda_mi(sahip_id));

-- Kapak da açılmalı, yoksa paylaşılan kitap meslektaşta kapaksız
-- görünür. Depo politikası bu fonksiyondan geçiyor.
CREATE OR REPLACE FUNCTION public.okuma_kitabi_gorebilir_miyim(p_kitap UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM okuma_kitaplari k
     WHERE k.id = p_kitap
       AND (k.sahip_id = auth.uid()
            OR admin_mi()
            OR (k.kuruma_acik AND ayni_kurumda_mi(k.sahip_id)))
  ) OR EXISTS (
    SELECT 1 FROM okuma_atamalari a
     WHERE a.kitap_id = p_kitap
       AND (a.student_id = auth.uid()
            OR ogrencim_mi(a.student_id)
            OR cocugum_mu(a.student_id))
  );
$fn$;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- Ortam varsayılmıyor; eksik ön koşul atlanıp sebebi yazılıyor.
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  yonetici UUID; koc UUID; meslektas UUID; ogr UUID; kurum UUID;
  env UUID; kitap UUID; banka UUID;
  e_koc UUID; e_mes UUID;
  sayi INTEGER; gecen INTEGER := 0; atlanan TEXT := '';
  ornek JSONB := '{"sorular":[{"kod":"s1","metin":"soru bir","tur":"siklik","boyut":"a","ters":false}],"boyutlar":{"a":"A"}}'::jsonb;
BEGIN
  SELECT u.id INTO yonetici FROM users u WHERE u.role = 'admin' LIMIT 1;
  IF yonetici IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - platform yoneticisi yok');
    RETURN;
  END IF;

  SELECT u.id INTO koc FROM users u WHERE u.role IN ('teacher','admin') LIMIT 1;
  SELECT u.id INTO meslektas FROM users u
   WHERE u.role IN ('teacher','admin') AND u.id <> koc LIMIT 1;
  IF koc IS NULL OR meslektas IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - iki ogretmen gerekiyor');
    RETURN;
  END IF;
  SELECT ts.student_id INTO ogr FROM teacher_students ts
   WHERE ts.teacher_id = koc AND ts.durum = 'onaylandi' LIMIT 1;

  SELECT kurum_id INTO e_koc FROM users WHERE id = koc;
  SELECT kurum_id INTO e_mes FROM users WHERE id = meslektas;

  INSERT INTO kurumlar (ad, tur) VALUES ('__SINAMA_ICERIK__', 'okul') RETURNING id INTO kurum;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = kurum WHERE id IN (koc, meslektas);
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO koc_envanterleri (sahip_id, ad, tanim)
  VALUES (koc, '__SINAMA_ENV__', ornek) RETURNING id INTO env;
  INSERT INTO okuma_kitaplari (sahip_id, ad) VALUES (koc, '__SINAMA_KITAP__')
  RETURNING id INTO kitap;
  INSERT INTO soru_bankalari (sahip_id, ad) VALUES (koc, '__SINAMA_BANKA__')
  RETURNING id INTO banka;

  -- a) YENI banka KAPALI basliyor (goc yalnız var olanlari acti)
  IF (SELECT kuruma_acik FROM soru_bankalari WHERE id = banka) THEN
    RAISE EXCEPTION 'SINAMA a: yeni banka acik baslamamali';
  END IF;
  gecen := gecen + 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', meslektas)::text, true);

  -- b) KAPALIYKEN meslektas goremiyor (uc icerik turu de)
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA b: kapali envanter gorundu'; END IF;
  SELECT count(*) INTO sayi FROM okuma_kitaplari WHERE id = kitap;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA b2: kapali kitap gorundu'; END IF;
  SELECT count(*) INTO sayi FROM soru_bankalari WHERE id = banka;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA b3: kapali banka gorundu'; END IF;
  gecen := gecen + 1;

  -- c) ACILINCA goruyor
  RESET ROLE;
  UPDATE koc_envanterleri SET kuruma_acik = true WHERE id = env;
  UPDATE okuma_kitaplari  SET kuruma_acik = true WHERE id = kitap;
  UPDATE soru_bankalari   SET kuruma_acik = true WHERE id = banka;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', meslektas)::text, true);

  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA c: acik envanter gorunmedi'; END IF;
  SELECT count(*) INTO sayi FROM okuma_kitaplari WHERE id = kitap;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA c2: acik kitap gorunmedi'; END IF;
  SELECT count(*) INTO sayi FROM soru_bankalari WHERE id = banka;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA c3: acik banka gorunmedi'; END IF;
  gecen := gecen + 1;

  -- d) kapak da aciliyor
  IF NOT okuma_kitabi_gorebilir_miyim(kitap) THEN
    RAISE EXCEPTION 'SINAMA d: paylasilan kitabin kapagi acilmadi';
  END IF;
  gecen := gecen + 1;

  -- e) KURUM DISINDAKI goremiyor
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = NULL WHERE id = meslektas;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', meslektas)::text, true);
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA e: kurum disindaki gordu'; END IF;
  gecen := gecen + 1;

  -- f) sahibi her halukarda goruyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA f: sahibi goremedi'; END IF;
  SELECT count(*) INTO sayi FROM soru_bankalari WHERE id = banka;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA f2: sahibi bankasini goremedi'; END IF;
  gecen := gecen + 1;

  -- g) OGRENCI kocunun kaynagini KAPALIYKEN DE goruyor.
  --    Asil risk buydu: kurum dalini kosullu yaparken ogrenci ve veli
  --    yollarinin kopmamasi gerekiyordu.
  IF ogr IS NULL THEN
    atlanan := atlanan || 'ogrenci erisimi (kocun onayli ogrencisi yok); ';
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
    IF NOT banka_sahibi_gorunur_mu(koc, false) THEN
      RAISE EXCEPTION 'SINAMA g: ogrenci kocunun kaynagini goremez oldu';
    END IF;
    gecen := gecen + 1;
  END IF;

  -- h) kurumda_gorunur_mu DAVRANISI DEGISMEDI
  --    (mufredat ve hazir programlar buna bagli)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  IF NOT kurumda_gorunur_mu(koc) THEN
    RAISE EXCEPTION 'SINAMA h: kisi kendi icerigini goremez oldu';
  END IF;
  IF NOT kurumda_gorunur_mu(NULL) THEN
    RAISE EXCEPTION 'SINAMA h2: gomulu icerik gorunmez oldu';
  END IF;
  gecen := gecen + 1;

  -- Temizlik
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  DELETE FROM koc_envanterleri WHERE id = env;
  DELETE FROM okuma_kitaplari  WHERE id = kitap;
  DELETE FROM soru_bankalari   WHERE id = banka;
  UPDATE users SET kurum_id = e_koc WHERE id = koc;
  UPDATE users SET kurum_id = e_mes WHERE id = meslektas;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM kurumlar WHERE id = kurum;

  INSERT INTO _sinama_sonucu VALUES (
    format('GECTI - %s davranis sinamasi%s', gecen,
           CASE WHEN atlanan = '' THEN '' ELSE ' | ATLANAN: ' || atlanan END));
END $test$;

SELECT sonuc AS "kurum_icerik" FROM _sinama_sonucu;
