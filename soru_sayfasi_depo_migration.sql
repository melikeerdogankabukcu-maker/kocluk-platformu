-- ============================================================
-- Migration: soru sayfası görselleri için depolama izni
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public/storage politikaları, idempotent.
-- ============================================================
--
-- ── NEDEN YENİ BİR YOL ──────────────────────────────────────
-- Bugünkü depolama kuralı YOL TABANLI: dosyanın ilk klasörü sahibinin
-- kimliği (`yol_sahibi`) ve okuma izni o kimliğe göre veriliyor —
-- öğrenci kendi klasörünü, koç öğrencisinin klasörünü, veli çocuğunun
-- klasörünü okuyor.
--
-- Soru sayfası bu kalıba girmiyor: dosyayı KOÇ yüklüyor, ÖĞRENCİ
-- okuyor. Koçun kendi klasörüne konsa öğrenci açamazdı (koç, öğrencinin
-- öğrencisi değil). Öğrencinin klasörüne konsa her öğrenci için ayrı
-- kopya gerekirdi.
--
-- Çözüm: ayrı bir yol öneki — `sorular/<banka_id>/<dosya>` — ve ona
-- özel politika. Erişim ölçütü KİŞİ değil KİTAP: görseli, kitap
-- kendisine açık olan okuyor.
--
-- ── TELİF KİLİDİ GÖRSELLERE DE UYGULANIYOR ──────────────────
-- Ölçüt `banka_ogrenciye_sunulabilir_mi()` — yani `hak_durumu`
-- denetimi. Kitap `deneme` ise sayfanın fotoğrafı öğrenciye AÇILMIYOR.
-- Artık yayınevi sayfalarının fotoğrafları saklandığı için bu kilit,
-- tablo tarafındakinden daha önemli: görsel doğrudan çoğaltmadır.

-- ------------------------------------------------------------
-- 1) Yoldan kitap kimliğini çıkar
-- ------------------------------------------------------------
-- 'sorular/<uuid>/dosya.jpg' → <uuid>. Kalıba uymayan yolda NULL;
-- politika da NULL'da kapalı kalıyor.
CREATE OR REPLACE FUNCTION public.soru_sayfasi_banka(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE parcalar TEXT[];
BEGIN
  parcalar := string_to_array(COALESCE(p_name, ''), '/');
  IF array_length(parcalar, 1) < 3 OR parcalar[1] <> 'sorular' THEN
    RETURN NULL;
  END IF;
  IF parcalar[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN parcalar[2]::uuid;
  END IF;
  RETURN NULL;
END $fn$;

REVOKE ALL ON FUNCTION public.soru_sayfasi_banka(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soru_sayfasi_banka(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) Okuma: kitabın sahibi + kitap kendisine açık olan öğrenci
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Soru sayfasini yetkili okur" ON storage.objects;
CREATE POLICY "Soru sayfasini yetkili okur" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.soru_sayfasi_banka(name) IS NOT NULL
    AND (
      public.bankanin_sahibi_miyim(public.soru_sayfasi_banka(name))
      OR public.banka_ogrenciye_sunulabilir_mi(public.soru_sayfasi_banka(name), auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 3) Yükleme / değiştirme / silme: YALNIZ kitabın sahibi
-- ------------------------------------------------------------
-- Öğrenci soru sayfası yükleyemiyor: sayfa kitabın içeriği, öğrencinin
-- gönderdiği bir ödev değil. Yükleyebilseydi kendi hazırladığı bir
-- sayfayı teste sokabilirdi.
DROP POLICY IF EXISTS "Soru sayfasini sahibi yukler" ON storage.objects;
CREATE POLICY "Soru sayfasini sahibi yukler" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'homework'
    AND public.soru_sayfasi_banka(name) IS NOT NULL
    AND public.bankanin_sahibi_miyim(public.soru_sayfasi_banka(name))
  );

DROP POLICY IF EXISTS "Soru sayfasini sahibi gunceller" ON storage.objects;
CREATE POLICY "Soru sayfasini sahibi gunceller" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.soru_sayfasi_banka(name) IS NOT NULL
    AND public.bankanin_sahibi_miyim(public.soru_sayfasi_banka(name))
  );

DROP POLICY IF EXISTS "Soru sayfasini sahibi siler" ON storage.objects;
CREATE POLICY "Soru sayfasini sahibi siler" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.soru_sayfasi_banka(name) IS NOT NULL
    AND public.bankanin_sahibi_miyim(public.soru_sayfasi_banka(name))
  );

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- Politikalar storage.objects üzerinde; satır eklemeden, yalnız
-- ÖLÇÜTLERİ sınıyoruz (yol çözümleme + hak kapısı). Gerçek dosya
-- yükleme denemesi arayüzden yapılacak.
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; banka UUID; yol TEXT; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  INSERT INTO soru_bankalari (sahip_id, ad, hak_durumu)
  VALUES (koc, 'Sayfa depo sinamasi', 'deneme') RETURNING id INTO banka;
  yol := 'sorular/' || banka::text || '/sayfa-1.jpg';

  -- a) yol cozumleme dogru
  IF soru_sayfasi_banka(yol) <> banka THEN
    RAISE EXCEPTION 'SINAMA a: yoldan kitap kimligi cikarilamadi';
  END IF;
  gecen := gecen + 1;

  -- b) kaliba uymayan yollar NULL
  IF soru_sayfasi_banka('abc/def.jpg') IS NOT NULL
     OR soru_sayfasi_banka('sorular/bozuk/x.jpg') IS NOT NULL
     OR soru_sayfasi_banka(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'SINAMA b: bozuk yol NULL donmedi';
  END IF;
  gecen := gecen + 1;

  SET LOCAL ROLE authenticated;

  -- c) hak durumu 'deneme' iken OGRENCIYE kapali
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  IF banka_ogrenciye_sunulabilir_mi(banka, ogr) THEN
    RAISE EXCEPTION 'SINAMA c: deneme kitabinin sayfasi ogrenciye acik cikti';
  END IF;
  gecen := gecen + 1;

  -- d) kitabin sahibi (koc) her halukarda okuyabiliyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  IF NOT bankanin_sahibi_miyim(banka) THEN
    RAISE EXCEPTION 'SINAMA d: kitabin sahibi kendi sayfasini okuyamiyor';
  END IF;
  gecen := gecen + 1;

  -- e) kapali pilotta kendi ogrencisine aciliyor
  RESET ROLE;
  UPDATE soru_bankalari SET hak_durumu = 'kapali_pilot' WHERE id = banka;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  IF NOT banka_ogrenciye_sunulabilir_mi(banka, ogr) THEN
    RAISE EXCEPTION 'SINAMA e: kapali pilotta kendi ogrencisine acilmadi';
  END IF;
  gecen := gecen + 1;

  -- f) ogrenci kitabin sahibi SAYILMIYOR (yukleme yetkisi yok)
  IF bankanin_sahibi_miyim(banka) THEN
    RAISE EXCEPTION 'SINAMA f: ogrenci kitabin sahibi gorundu, sayfa yukleyebilirdi';
  END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM soru_bankalari WHERE id = banka;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "soru_sayfasi_depo" FROM _sinama_sonucu;
