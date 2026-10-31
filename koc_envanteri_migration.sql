-- ============================================================
-- Migration: koçun kendi envanteri
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ÖNCE envanter_migration.sql çalışmış olmalı.
-- ============================================================
--
-- Koç kendi envanterini şablondan içe aktarıp öğrencisine atıyor.
-- Şablon Word/Google Dokümanlar/Excel'de doldurulup YAPIŞTIRILIYOR
-- (gerekçe: src/lib/envanterSablonu.js başındaki not).
--
-- ── KARAR: ŞABLON YORUM METNİ İSTEMİYOR ─────────────────────
-- Hazır envanterler kendiliğinden öneri üretiyor çünkü yorum
-- metinlerini biz yazdık. Koçun kendi envanterinde bu istenmiyor:
-- her boyut için üç metin yazmak şablonu üç katına çıkarır ve ilk
-- envanteri yüklemek bir saat sürerdi. Sistem bu yüzden YORUM
-- UYDURMUYOR — boyut ortalamasını gösterip değerlendirmeyi koça
-- bırakıyor. Veliye giden şey de zaten koçun değerlendirmesi.

-- ------------------------------------------------------------
-- 1) "Bu kişi benim koçum mu"
-- ------------------------------------------------------------
-- ogrencim_mi()'nin tersi; öğrencinin koçunun içeriğini görebilmesi
-- için gerekiyor ve böyle bir yardımcı yoktu.
CREATE OR REPLACE FUNCTION public.kocum_mu(p_ogretmen UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM teacher_students ts
     WHERE ts.teacher_id = p_ogretmen
       AND ts.student_id = auth.uid()
       AND ts.durum = 'onaylandi'
  );
$fn$;

REVOKE ALL ON FUNCTION public.kocum_mu(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kocum_mu(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2) Koç envanteri
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS koc_envanterleri (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sahip_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad         TEXT        NOT NULL,
  aciklama   TEXT,
  -- { sorular: [{kod, metin, tur, boyut, ters}], boyutlar: {kod: ad} }
  -- Şablon ayrıştırması tarayıcıda yapılıyor (saf ve sınanmış);
  -- buraya hazır tanım geliyor.
  tanim      JSONB       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT koc_envanter_tanim_nesne CHECK (jsonb_typeof(tanim) = 'object'),
  CONSTRAINT koc_envanter_sorular CHECK (jsonb_typeof(tanim -> 'sorular') = 'array'),
  -- Boş envanter atanamasın
  CONSTRAINT koc_envanter_dolu CHECK (jsonb_array_length(tanim -> 'sorular') BETWEEN 1 AND 60)
);

CREATE INDEX IF NOT EXISTS idx_koc_envanter_sahip
  ON koc_envanterleri (sahip_id, created_at DESC);

ALTER TABLE koc_envanterleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Koc envanterini sahibi yonetir" ON koc_envanterleri;
CREATE POLICY "Koc envanterini sahibi yonetir" ON koc_envanterleri
  FOR ALL TO authenticated
  USING      (sahip_id = auth.uid() OR admin_mi())
  WITH CHECK (sahip_id = auth.uid() OR admin_mi());

-- Öğrenci KOÇUNUN envanterini okuyor (soruları görmesi gerekiyor).
-- Başka koçun envanteri görünmüyor: içerik koçun kendi birikimi.
DROP POLICY IF EXISTS "Koc envanterini ogrencisi okur" ON koc_envanterleri;
CREATE POLICY "Koc envanterini ogrencisi okur" ON koc_envanterleri
  FOR SELECT TO authenticated
  USING (kocum_mu(sahip_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON koc_envanterleri TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Sonuç ya hazır envantere ya koç envanterine bağlı
-- ------------------------------------------------------------
ALTER TABLE envanter_sonuclari
  ADD COLUMN IF NOT EXISTS koc_envanteri_id UUID
    REFERENCES koc_envanterleri(id) ON DELETE CASCADE;

-- envanter_kod artık zorunlu değil: koç envanterinde kod yok.
ALTER TABLE envanter_sonuclari ALTER COLUMN envanter_kod DROP NOT NULL;

-- İkisinden TAM BİRİ dolu olmalı. İkisi birden dolu olsa hangi
-- envanterin cevabı olduğu belirsiz kalırdı; ikisi de boş olsa
-- sahipsiz cevap olurdu.
ALTER TABLE envanter_sonuclari DROP CONSTRAINT IF EXISTS envanter_kaynak_tek;
ALTER TABLE envanter_sonuclari ADD  CONSTRAINT envanter_kaynak_tek
  CHECK ((envanter_kod IS NOT NULL) <> (koc_envanteri_id IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_envanter_koc_envanteri
  ON envanter_sonuclari (koc_envanteri_id) WHERE koc_envanteri_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4) Cevabı olan envanterin SORULARI değişmiyor
-- ------------------------------------------------------------
-- Cevaplar `s1, s2...` kodlarıyla saklanıyor. Soru sırası sonradan
-- değişirse eski cevaplar BAŞKA SORUYA denk gelir ve bunun hiçbir
-- izi olmaz. Ad ve açıklama serbest; tanıma dokunulamıyor.
CREATE OR REPLACE FUNCTION public.koc_envanteri_tanimini_koru()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE cevap_var BOOLEAN;
BEGIN
  NEW.updated_at := now();

  IF NEW.tanim IS DISTINCT FROM OLD.tanim THEN
    SELECT EXISTS (SELECT 1 FROM envanter_sonuclari s
                    WHERE s.koc_envanteri_id = OLD.id) INTO cevap_var;
    IF cevap_var THEN
      RAISE EXCEPTION 'Cevaplanmis envanterin sorulari degistirilemez; yeni envanter olusturun.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS koc_envanteri_tanim_kilidi ON koc_envanterleri;
CREATE TRIGGER koc_envanteri_tanim_kilidi
  BEFORE UPDATE ON koc_envanterleri
  FOR EACH ROW EXECUTE FUNCTION koc_envanteri_tanimini_koru();

-- ------------------------------------------------------------
-- 5) Veli özeti: koç envanterinin ADI da görünsün
-- ------------------------------------------------------------
-- Veliye `koc_envanterleri` üzerinde politika VERİLMİYOR; görünüm
-- sahibi olarak çalıştığı için adı o çözüyor. Veli yine yalnız
-- "hangi envanter, ne zaman, koç ne dedi" görüyor — sorular ve
-- cevaplar görünümde yok.
DROP VIEW IF EXISTS public.envanter_veli_ozeti;
CREATE VIEW public.envanter_veli_ozeti AS
  SELECT e.id, e.student_id, e.envanter_kod, e.koc_envanteri_id,
         ke.ad AS koc_envanteri_adi,
         e.created_at, e.koc_degerlendirmesi, e.degerlendirme_tarihi
    FROM envanter_sonuclari e
    LEFT JOIN koc_envanterleri ke ON ke.id = e.koc_envanteri_id
   WHERE auth.uid() IS NOT NULL
     AND (e.student_id = auth.uid()
          OR ogrencim_mi(e.student_id)
          OR cocugum_mu(e.student_id)
          OR admin_mi());

REVOKE ALL ON public.envanter_veli_ozeti FROM PUBLIC, anon;
GRANT SELECT ON public.envanter_veli_ozeti TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; yabanci UUID; env UUID; kayit UUID;
  sayi INTEGER; red BOOLEAN; gecen INTEGER := 0;
  ornek JSONB := '{"sorular":[{"kod":"s1","metin":"soru bir","tur":"siklik","boyut":"a","ters":false}],"boyutlar":{"a":"A"}}'::jsonb;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);

  -- a) koc envanter olusturuyor
  INSERT INTO koc_envanterleri (sahip_id, ad, tanim)
  VALUES (koc, '__SINAMA_ENVANTER__', ornek) RETURNING id INTO env;
  gecen := gecen + 1;

  -- b) ogrenci KOCUNUN envanterini goruyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA b: ogrenci kocunun envanterini goremedi'; END IF;
  gecen := gecen + 1;

  -- c) ogrenci cevap yaziyor (koc envanterine bagli)
  INSERT INTO envanter_sonuclari (student_id, koc_envanteri_id, cevaplar)
  VALUES (ogr, env, '{"s1": 4}'::jsonb) RETURNING id INTO kayit;
  gecen := gecen + 1;

  -- d) IKISI BIRDEN dolu olan satir reddediliyor
  red := false;
  BEGIN
    INSERT INTO envanter_sonuclari (student_id, envanter_kod, koc_envanteri_id)
    VALUES (ogr, 'calisma_aliskanligi', env);
  EXCEPTION WHEN check_violation THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: iki kaynakli satir kabul edildi'; END IF;
  gecen := gecen + 1;

  -- e) IKISI DE BOS olan satir reddediliyor
  red := false;
  BEGIN
    INSERT INTO envanter_sonuclari (student_id) VALUES (ogr);
  EXCEPTION WHEN check_violation THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA e: kaynaksiz satir kabul edildi'; END IF;
  gecen := gecen + 1;

  -- f) CEVAPLANMIS envanterin sorulari degistirilemiyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  red := false;
  BEGIN
    UPDATE koc_envanterleri SET tanim = ornek || '{"boyutlar":{"b":"B"}}'::jsonb
     WHERE id = env;
  EXCEPTION WHEN raise_exception THEN red := true;
  END;
  IF NOT red THEN
    RAISE EXCEPTION 'SINAMA f: cevaplanmis envanterin sorulari degistirildi';
  END IF;
  gecen := gecen + 1;

  -- g) ADI degistirmek SERBEST
  UPDATE koc_envanterleri SET ad = '__SINAMA_ENVANTER_2__' WHERE id = env;
  gecen := gecen + 1;

  -- h) BASKA kocun ogrencisi envanteri goremiyor
  RESET ROLE;
  SELECT u.id INTO yabanci FROM users u
   WHERE u.role = 'student' AND u.id <> ogr
     AND NOT EXISTS (SELECT 1 FROM teacher_students ts
                      WHERE ts.teacher_id = koc AND ts.student_id = u.id
                        AND ts.durum = 'onaylandi')
   LIMIT 1;
  IF yabanci IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yabanci)::text, true);
    SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
    IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA h: ilgisiz ogrenci envanteri gordu'; END IF;
    gecen := gecen + 1;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM koc_envanterleri WHERE id = env;   -- sonuclar cascade

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "koc_envanteri" FROM _sinama_sonucu;
