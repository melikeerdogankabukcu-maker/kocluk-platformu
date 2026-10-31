-- ============================================================
-- Migration: kitap kapağı için depolama izni
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ÖNCE kitap_okuma_migration.sql çalışmış olmalı.
-- ============================================================
--
-- Soru sayfalarındaki aynı problem: dosyayı KOÇ yüklüyor, ÖĞRENCİ
-- okuyor. Yol tabanlı kural (`yol_sahibi`) bunu açmıyor — koç,
-- öğrencinin öğrencisi değil.
--
-- Çözüm aynı kalıpta: ayrı bir yol öneki `kitaplar/<kitap_id>/...`
-- ve erişim ölçütü KİŞİ değil KİTAP. Ölçüt tek yerde yazılı
-- (`okuma_kitabi_gorebilir_miyim`), tablo politikalarıyla aynı
-- fonksiyon; ikisi ayrışamıyor.
--
-- Telif notu: saklanan şey kapak fotoğrafı, yani kitabın KİMLİĞİ.
-- Soru sayfası eserin içeriğinin çoğaltılmasıydı, bu değil.

CREATE OR REPLACE FUNCTION public.kitap_kapagi_kitap(p_name TEXT)
RETURNS UUID
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE parcalar TEXT[];
BEGIN
  parcalar := string_to_array(COALESCE(p_name, ''), '/');
  IF array_length(parcalar, 1) < 3 OR parcalar[1] <> 'kitaplar' THEN
    RETURN NULL;
  END IF;
  IF parcalar[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN parcalar[2]::uuid;
  END IF;
  RETURN NULL;
END $fn$;

REVOKE ALL ON FUNCTION public.kitap_kapagi_kitap(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kitap_kapagi_kitap(TEXT) TO authenticated;

-- Okuma: kitabı görebilen herkes (sahibi, atanan öğrenci, velisi).
DROP POLICY IF EXISTS "Kitap kapagini yetkili okur" ON storage.objects;
CREATE POLICY "Kitap kapagini yetkili okur" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.kitap_kapagi_kitap(name) IS NOT NULL
    AND public.okuma_kitabi_gorebilir_miyim(public.kitap_kapagi_kitap(name))
  );

-- Yazma/değiştirme/silme: YALNIZ kitabın sahibi. Öğrenci kapak
-- yükleyemiyor — kitap koçun tanımladığı içerik, öğrencinin
-- gönderdiği bir ödev değil.
DROP POLICY IF EXISTS "Kitap kapagini sahibi yukler" ON storage.objects;
CREATE POLICY "Kitap kapagini sahibi yukler" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'homework'
    AND public.kitap_kapagi_kitap(name) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.okuma_kitaplari k
                 WHERE k.id = public.kitap_kapagi_kitap(name)
                   AND (k.sahip_id = auth.uid() OR public.admin_mi()))
  );

DROP POLICY IF EXISTS "Kitap kapagini sahibi gunceller" ON storage.objects;
CREATE POLICY "Kitap kapagini sahibi gunceller" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.kitap_kapagi_kitap(name) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.okuma_kitaplari k
                 WHERE k.id = public.kitap_kapagi_kitap(name)
                   AND (k.sahip_id = auth.uid() OR public.admin_mi()))
  );

DROP POLICY IF EXISTS "Kitap kapagini sahibi siler" ON storage.objects;
CREATE POLICY "Kitap kapagini sahibi siler" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'homework'
    AND public.kitap_kapagi_kitap(name) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.okuma_kitaplari k
                 WHERE k.id = public.kitap_kapagi_kitap(name)
                   AND (k.sahip_id = auth.uid() OR public.admin_mi()))
  );

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; kitap UUID; yol TEXT; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  INSERT INTO okuma_kitaplari (sahip_id, ad) VALUES (koc, '__SINAMA_KAPAK__')
  RETURNING id INTO kitap;
  yol := 'kitaplar/' || kitap::text || '/kapak.jpg';

  -- a) yol cozumleme
  IF kitap_kapagi_kitap(yol) <> kitap THEN
    RAISE EXCEPTION 'SINAMA a: yoldan kitap kimligi cikmadi';
  END IF;
  gecen := gecen + 1;

  -- b) bozuk yollar NULL
  IF kitap_kapagi_kitap('abc/def.jpg') IS NOT NULL
     OR kitap_kapagi_kitap('kitaplar/bozuk/x.jpg') IS NOT NULL
     OR kitap_kapagi_kitap(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'SINAMA b: bozuk yol NULL donmedi';
  END IF;
  gecen := gecen + 1;

  SET LOCAL ROLE authenticated;

  -- c) ATAMA YOKKEN ogrenci kapagi acamiyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  IF okuma_kitabi_gorebilir_miyim(kitap) THEN
    RAISE EXCEPTION 'SINAMA c: atamasi olmayan ogrenciye kapak acildi';
  END IF;
  gecen := gecen + 1;

  -- d) ATAMA YAPILINCA aciliyor
  RESET ROLE;
  INSERT INTO okuma_atamalari (kitap_id, student_id, atayan_id, gun_sayisi)
  VALUES (kitap, ogr, koc, 15);
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  IF NOT okuma_kitabi_gorebilir_miyim(kitap) THEN
    RAISE EXCEPTION 'SINAMA d: atanan ogrenciye kapak acilmadi';
  END IF;
  gecen := gecen + 1;

  -- e) kitabin sahibi her halukarda goruyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  IF NOT okuma_kitabi_gorebilir_miyim(kitap) THEN
    RAISE EXCEPTION 'SINAMA e: kitabin sahibi kapagi goremedi';
  END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM okuma_kitaplari WHERE id = kitap;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "kitap_kapagi_depo" FROM _sinama_sonucu;
