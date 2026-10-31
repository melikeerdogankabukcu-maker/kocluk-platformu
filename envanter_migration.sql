-- ============================================================
-- Migration: gelişim envanteri sonuçları
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema.
-- ============================================================
--
-- Akış OKUMA_VE_ENVANTER.md'de yazılı ve onaylandı.
--
-- ── ENVANTERİN KENDİSİ BURADA DEĞİL ─────────────────────────
-- Soru metinleri ve yorum kuralları kodda (`src/lib/envanterler.js`),
-- hazır çalışma programlarıyla aynı kalıp: yeni envanter eklemek
-- migration gerektirmiyor, sürüm çıkınca bütün koçlarda anında
-- oluyor. Burada yalnız CEVAPLAR ve koçun değerlendirmesi duruyor.
--
-- ── GÖRÜNÜRLÜK ÜÇ KADEMELİ ──────────────────────────────────
--   öğrenci : kendi cevapları
--   koç     : cevaplar + kendi değerlendirmesi
--   VELİ    : cevapları GÖRMÜYOR — yalnız hangi envanter, ne zaman,
--             ve koçun değerlendirmesi (`envanter_veli_ozeti`)
--
-- Velinin cevapları görmemesi teknik değil davranışsal bir karar:
-- öğrencinin "erteliyorum", "sabah verimsizim" gibi şeyleri dürüst
-- işaretlemesi için evde konuşulmayacağını bilmesi gerekiyor. Veli
-- görüyorsa anket dürüst doldurulmuyor ve toplanan veri çöp oluyor.
--
-- ── TEKRAR UYGULANABİLİR ────────────────────────────────────
-- Benzersizlik kısıtı YOK: aynı envanter üç ay sonra tekrar
-- uygulanınca değişim görünsün. Geçmiş silinmiyor.

CREATE TABLE IF NOT EXISTS envanter_sonuclari (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Koddaki envanterin kodu. Yabancı anahtar YOK: tanım veritabanında
  -- değil. Kod kaybolursa arayüz o kaydı "bilinmeyen envanter" diye
  -- gösteriyor, satır silinmiyor.
  envanter_kod  TEXT        NOT NULL,
  cevaplar      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- Koçun yazdığı değerlendirme. VELİNİN GÖRDÜĞÜ TEK ŞEY bu.
  koc_degerlendirmesi   TEXT,
  degerlendiren_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  degerlendirme_tarihi  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT envanter_cevap_nesne CHECK (jsonb_typeof(cevaplar) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_envanter_ogrenci
  ON envanter_sonuclari (student_id, created_at DESC);

ALTER TABLE envanter_sonuclari ENABLE ROW LEVEL SECURITY;

-- Öğrenci kendi envanterini doldurur ve okur.
DROP POLICY IF EXISTS "Envanteri ogrenci doldurur" ON envanter_sonuclari;
CREATE POLICY "Envanteri ogrenci doldurur" ON envanter_sonuclari
  FOR ALL TO authenticated
  USING      (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Envanteri kocu yonetir" ON envanter_sonuclari;
CREATE POLICY "Envanteri kocu yonetir" ON envanter_sonuclari
  FOR ALL TO authenticated
  USING      (ogrencim_mi(student_id) OR admin_mi())
  WITH CHECK (ogrencim_mi(student_id) OR admin_mi());

-- VELİ İÇİN POLİTİKA YOK. Satır güvenliği kolon gizlemiyor; veliye
-- satır açılsaydı `cevaplar` da açılırdı. Veli aşağıdaki görünümden
-- okuyor.
GRANT SELECT, INSERT, UPDATE, DELETE ON envanter_sonuclari TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON envanter_sonuclari TO service_role;

-- ------------------------------------------------------------
-- Koç değerlendirmesini öğrenci YAZAMIYOR
-- ------------------------------------------------------------
-- Öğrencinin kendi satırında tam yetkisi var (cevabını düzeltebilmeli)
-- ama koçun yorumu onun yazabileceği bir alan değil: veli o yorumu
-- okuyor ve koçun ağzından çıkmış sayıyor.
CREATE OR REPLACE FUNCTION public.envanter_degerlendirmesini_koru()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();

  IF NEW.koc_degerlendirmesi IS DISTINCT FROM OLD.koc_degerlendirmesi THEN
    IF NOT (ogrencim_mi(NEW.student_id) OR admin_mi()) THEN
      RAISE EXCEPTION 'Degerlendirmeyi yalniz koc yazabilir.'
        USING ERRCODE = '42501';
    END IF;
    NEW.degerlendiren_id     := auth.uid();
    NEW.degerlendirme_tarihi := now();
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS envanter_degerlendirme_kilidi ON envanter_sonuclari;
CREATE TRIGGER envanter_degerlendirme_kilidi
  BEFORE UPDATE ON envanter_sonuclari
  FOR EACH ROW EXECUTE FUNCTION envanter_degerlendirmesini_koru();

-- ------------------------------------------------------------
-- Velinin gördüğü özet
-- ------------------------------------------------------------
-- Görünüm SAHİBİ olarak çalışıyor (security_invoker verilmedi):
-- bilerek, çünkü veliye tabloda politika verilmedi. Görünümün
-- döndürdüğü sütunlar arasında `cevaplar` YOK.
DROP VIEW IF EXISTS public.envanter_veli_ozeti;
CREATE VIEW public.envanter_veli_ozeti AS
  SELECT e.id, e.student_id, e.envanter_kod, e.created_at,
         e.koc_degerlendirmesi, e.degerlendirme_tarihi
    FROM envanter_sonuclari e
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
  koc UUID; ogr UUID; veli UUID; kayit UUID; yabanci UUID; sayi INTEGER;
  red BOOLEAN; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;
  SELECT parent_id INTO veli FROM family_links WHERE student_id = ogr LIMIT 1;

  SET LOCAL ROLE authenticated;

  -- a) ogrenci kendi envanterini doldurabiliyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  INSERT INTO envanter_sonuclari (student_id, envanter_kod, cevaplar)
  VALUES (ogr, 'calisma_aliskanligi', '{"blok1": 5}'::jsonb)
  RETURNING id INTO kayit;
  gecen := gecen + 1;

  -- b) ogrenci KOC DEGERLENDIRMESI yazamiyor
  red := false;
  BEGIN
    UPDATE envanter_sonuclari SET koc_degerlendirmesi = 'ben yazdim' WHERE id = kayit;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN
    RAISE EXCEPTION 'SINAMA b: ogrenci koc degerlendirmesini yazabildi';
  END IF;
  gecen := gecen + 1;

  -- c) ogrenci KENDI cevabini duzeltebiliyor
  UPDATE envanter_sonuclari SET cevaplar = '{"blok1": 3}'::jsonb WHERE id = kayit;
  gecen := gecen + 1;

  -- d) koc degerlendirme yaziyor, imza kendiliginden dusuyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  UPDATE envanter_sonuclari SET koc_degerlendirmesi = 'Kisa bloklarla calismali.'
   WHERE id = kayit;
  SELECT count(*) INTO sayi FROM envanter_sonuclari
   WHERE id = kayit AND degerlendiren_id = koc AND degerlendirme_tarihi IS NOT NULL;
  IF sayi <> 1 THEN
    RAISE EXCEPTION 'SINAMA d: degerlendiren/tarih kendiliginden yazilmadi';
  END IF;
  gecen := gecen + 1;

  -- e) VELI tabloyu goremiyor (cevaplar orada)
  IF veli IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', veli)::text, true);
    SELECT count(*) INTO sayi FROM envanter_sonuclari WHERE id = kayit;
    IF sayi <> 0 THEN
      RAISE EXCEPTION 'SINAMA e: veli ham cevaplari gordu';
    END IF;
    gecen := gecen + 1;

    -- f) veli OZETI gorebiliyor ve orada degerlendirme var
    SELECT count(*) INTO sayi FROM envanter_veli_ozeti
     WHERE id = kayit AND koc_degerlendirmesi IS NOT NULL;
    IF sayi <> 1 THEN
      RAISE EXCEPTION 'SINAMA f: veli ozeti goremedi';
    END IF;
    gecen := gecen + 1;
  END IF;

  -- g) ILGISIZ bir ogrenci baskasinin envanterini goremiyor
  RESET ROLE;
  SELECT u.id INTO yabanci FROM users u
   WHERE u.role = 'student' AND u.id <> ogr LIMIT 1;
  IF yabanci IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yabanci)::text, true);
    SELECT count(*) INTO sayi FROM envanter_sonuclari WHERE id = kayit;
    IF sayi <> 0 THEN
      RAISE EXCEPTION 'SINAMA g: baska ogrenci envanteri gordu';
    END IF;
    SELECT count(*) INTO sayi FROM envanter_veli_ozeti WHERE id = kayit;
    IF sayi <> 0 THEN
      RAISE EXCEPTION 'SINAMA g2: baska ogrenci veli ozetini gordu';
    END IF;
    gecen := gecen + 1;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM envanter_sonuclari WHERE id = kayit;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "envanter" FROM _sinama_sonucu;
