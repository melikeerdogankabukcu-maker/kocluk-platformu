-- ============================================================
-- Migration: "görev atamış öğretmen" kalıbındaki politikalar kalkıyor
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema.
-- ============================================================
--
-- ── RİSK ────────────────────────────────────────────────────
-- Üç politikanın ölçütü "bu öğrenciye BİR KEZ görev atamış öğretmen":
--
--   EXISTS (SELECT 1 FROM tasks t
--            WHERE t.student_id = <tablo>.student_id
--              AND t.teacher_id = auth.uid())
--
-- `ogrencim_mi()` geldikten sonra gereksizleştiler ama daha GENİŞ
-- kaldılar: ölçüt geçmişe bakıyor, bugünkü bağlantıya değil. Koçla
-- öğrencinin bağlantısı kaldırıldıktan sonra bile o koç öğrencinin
-- deneme sonuçlarını ve çözdüğü testleri okumaya devam ediyordu.
-- Üstelik sınav sonucu EKLEYEBİLİYORDU.
--
-- ── ÖLÇÜLDÜ, SONRA KALDIRILDI ───────────────────────────────
-- Depodaki not "kaldırılacaksa önce hangi akışın buna dayandığı
-- ölçülmeli" diyordu. Ölçüm 31 Ekim 2026'da yapıldı: görev atamış
-- her koç–öğrenci çifti için bağlantı durumu çıkarıldı ve sonuç
-- GUVENLI döndü — `onaylandi` bağlantısı olmayan tek bir çift yok.
-- Yani bu politikaların bugün FAZLADAN geçirdiği kimse yok;
-- kaldırmak hiçbir akışı kırmıyor, yalnız geleceğe açık kapıyı
-- kapatıyor.
--
-- Kalan ölçüt her iki tabloda da `ogrencim_mi(student_id)`:
-- teacher_students'ta durumu 'onaylandi' olan bağlantı.

DROP POLICY IF EXISTS "Öğretmen sınav sonuçlarını görür"   ON public.exam_results;
DROP POLICY IF EXISTS "Öğretmen sınav sonucu ekleyebilir"  ON public.exam_results;
DROP POLICY IF EXISTS "Öğretmen öğrencinin testlerini görür" ON public.test_sessions;

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- Sınanan iki şey: (1) politikalar gerçekten gitti, (2) bağlantısı
-- ONAYLI koç hâlâ okuyabiliyor — yani daraltma fazla daraltmadı.
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; sinav UUID; yabanci UUID; sayi INTEGER; gecen INTEGER := 0;
BEGIN
  -- a) politikalar kalktı
  SELECT count(*) INTO sayi FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN ('Öğretmen sınav sonuçlarını görür',
                        'Öğretmen sınav sonucu ekleyebilir',
                        'Öğretmen öğrencinin testlerini görür');
  IF sayi <> 0 THEN
    RAISE EXCEPTION 'SINAMA a: % eski politika hala duruyor', sayi;
  END IF;
  gecen := gecen + 1;

  -- b) ogrencim_mi ölçütlü politikalar YERİNDE (yoksa koç her şeyi
  --    kaybeder; yanlışlıkla fazlasını silmediğimizin denetimi)
  SELECT count(*) INTO sayi FROM pg_policies
   WHERE schemaname = 'public'
     AND policyname IN ('Ogretmen kendi ogrencilerinin sinavlarini yonetir',
                        'Ogretmen kendi ogrencilerinin testlerini okur');
  IF sayi <> 2 THEN
    RAISE EXCEPTION 'SINAMA b: ogrencim_mi politikalarindan % tanesi var (2 bekleniyordu)', sayi;
  END IF;
  gecen := gecen + 1;

  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES (
      format('KISMEN - %s yapisal sinama gecti, onayli koc-ogrenci cifti olmadigi icin davranis sinanamadi', gecen));
    RETURN;
  END IF;

  -- Sınama kaydı: ders adı benzersiz damga, sonunda tam bununla silinir.
  INSERT INTO exam_results (student_id, exam_name, exam_type, total_net)
  VALUES (ogr, '__SINAMA_SINAV__', 'TYT', 1) RETURNING id INTO sinav;

  SET LOCAL ROLE authenticated;

  -- c) ONAYLI bağlantısı olan koç sınav sonucunu OKUYABILIYOR
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  SELECT count(*) INTO sayi FROM exam_results WHERE id = sinav;
  IF sayi <> 1 THEN
    RAISE EXCEPTION 'SINAMA c: onayli koc kendi ogrencisinin sinavini goremiyor';
  END IF;
  gecen := gecen + 1;

  -- d) koç hâlâ sınav sonucu YAZABİLİYOR (ogrencim_mi ALL politikası)
  UPDATE exam_results SET notes = 'sinama' WHERE id = sinav;
  gecen := gecen + 1;

  -- e) BAĞLANTISI OLMAYAN biri göremiyor. Asıl mesele buydu: eski
  --    politika "bir zamanlar görev atamış" koçu geçiriyordu.
  RESET ROLE;
  SELECT u.id INTO yabanci FROM users u
   WHERE u.id <> ogr AND u.id <> koc
     AND u.role <> 'admin'
     AND NOT EXISTS (SELECT 1 FROM teacher_students ts
                      WHERE ts.teacher_id = u.id AND ts.student_id = ogr)
     AND NOT EXISTS (SELECT 1 FROM family_links f
                      WHERE f.parent_id = u.id AND f.student_id = ogr)
   LIMIT 1;
  IF yabanci IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yabanci)::text, true);
    SELECT count(*) INTO sayi FROM exam_results WHERE id = sinav;
    IF sayi <> 0 THEN
      RAISE EXCEPTION 'SINAMA e: ilgisiz kullanici sinav sonucunu gordu';
    END IF;
    gecen := gecen + 1;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM exam_results WHERE exam_name = '__SINAMA_SINAV__';

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "eski_kalip_temizligi" FROM _sinama_sonucu;
