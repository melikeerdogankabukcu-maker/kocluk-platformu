-- ============================================================
-- Migration: öğrencinin açık testleri + yarıda kalana devam
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Önce sorular_migration.sql ve test_oturumu_migration.sql.
-- ============================================================
--
-- Dijital test aşama 1 / 3. parça (öğrenci tarafının giriş noktası).
--
-- ── NEDEN RPC ───────────────────────────────────────────────
-- Öğrenci `sorular` tablosunu okuyamıyor (doğru cevap orada), yani
-- "bu kitapta kaç onaylı soru var" sorusunu kendisi soramıyor.
-- Liste bu yüzden sunucudan geliyor ve hak durumunu da orada
-- denetleniyor: izni olmayan kitap listeye hiç düşmüyor.

CREATE OR REPLACE FUNCTION public.acik_testlerim()
RETURNS TABLE (
  banka_id UUID, ad TEXT, ders TEXT,
  bolum_id UUID, bolum_adi TEXT,
  soru_sayisi BIGINT, devam_eden BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ogrenci UUID := auth.uid();
BEGIN
  IF ogrenci IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT b.id, b.ad, b.ders, s.bolum_id, bl.baslik,
           count(*),
           EXISTS (
             SELECT 1 FROM test_oturumlari o
              WHERE o.student_id = ogrenci
                AND o.banka_id = b.id
                -- NULL bölüm = kitabın tamamı; IS NOT DISTINCT FROM
                -- olmazsa NULL = NULL karşılaştırması tutmaz ve yarıda
                -- kalan test hiç bulunamaz.
                AND o.bolum_id IS NOT DISTINCT FROM s.bolum_id
                AND o.durum = 'devam'
           )
      FROM sorular s
      JOIN soru_bankalari b ON b.id = s.banka_id
      LEFT JOIN soru_bankasi_bolumleri bl ON bl.id = s.bolum_id
     WHERE s.onayli
       AND banka_ogrenciye_sunulabilir_mi(b.id, ogrenci)
     GROUP BY b.id, b.ad, b.ders, s.bolum_id, bl.baslik
     ORDER BY b.ad, bl.baslik NULLS FIRST;
END $fn$;

REVOKE ALL ON FUNCTION public.acik_testlerim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acik_testlerim() TO authenticated;

-- ------------------------------------------------------------
-- test_basla: YARIDA KALANA DEVAM
-- ------------------------------------------------------------
-- Öğrenci testi yarıda bıraktıysa ikinci kez "Çöz" dediğinde YENİ bir
-- oturum açılmamalı: açılsaydı verdiği cevaplar çöpe giderdi ve her
-- yarım test yeni bir kayıt olarak birikirdi.
CREATE OR REPLACE FUNCTION public.test_basla(p_banka UUID, p_bolum UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ogrenci UUID := auth.uid(); adet INTEGER; oturum UUID;
BEGIN
  IF ogrenci IS NULL THEN
    RAISE EXCEPTION 'Oturum acik degil.' USING ERRCODE = '42501';
  END IF;

  IF NOT banka_ogrenciye_sunulabilir_mi(p_banka, ogrenci) THEN
    RAISE EXCEPTION 'Bu kitap size acik degil.' USING ERRCODE = '42501';
  END IF;

  -- Devam eden oturum varsa onu döndür. Hak denetiminden SONRA:
  -- izin geri alındıysa yarıda kalan teste de devam edilmemeli.
  SELECT id INTO oturum FROM test_oturumlari
   WHERE student_id = ogrenci AND banka_id = p_banka
     AND bolum_id IS NOT DISTINCT FROM p_bolum
     AND durum = 'devam'
   ORDER BY baslangic DESC LIMIT 1;
  IF oturum IS NOT NULL THEN RETURN oturum; END IF;

  SELECT count(*) INTO adet FROM sorular s
   WHERE s.banka_id = p_banka
     AND (p_bolum IS NULL OR s.bolum_id = p_bolum)
     AND s.onayli;
  IF adet = 0 THEN
    RAISE EXCEPTION 'Bu testte onaylanmis soru yok.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO test_oturumlari (student_id, banka_id, bolum_id, soru_sayisi)
  VALUES (ogrenci, p_banka, p_bolum, adet)
  RETURNING id INTO oturum;
  RETURN oturum;
END $fn$;

REVOKE ALL ON FUNCTION public.test_basla(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_basla(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; banka UUID; s1 UUID;
  o1 UUID; o2 UUID; sayi INTEGER; r RECORD; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  INSERT INTO soru_bankalari (sahip_id, ad, ders, hak_durumu)
  VALUES (koc, 'Acik test sinamasi', '__SINAMA_DERS__', 'kapali_pilot') RETURNING id INTO banka;
  INSERT INTO sorular (banka_id, numara, metin, dogru_cevap, onayli)
  VALUES (banka, 1, 'soru 1', 'A', true) RETURNING id INTO s1;
  -- Onaysız soru listede SAYILMAMALI
  INSERT INTO sorular (banka_id, numara, metin, dogru_cevap, onayli)
  VALUES (banka, 2, 'onaysiz soru', 'B', false);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);

  -- a) test listede ve YALNIZ onayli soru sayiliyor
  SELECT * INTO r FROM acik_testlerim() WHERE banka_id = banka;
  IF r IS NULL THEN RAISE EXCEPTION 'SINAMA a: test listede yok'; END IF;
  IF r.soru_sayisi <> 1 THEN
    RAISE EXCEPTION 'SINAMA a: soru sayisi % (1 bekleniyordu, onaysiz sayilmamali)', r.soru_sayisi;
  END IF;
  gecen := gecen + 1;

  -- b) baslamadan once "devam eden" FALSE
  IF r.devam_eden THEN RAISE EXCEPTION 'SINAMA b: hic baslamadan devam eden cikti'; END IF;
  gecen := gecen + 1;

  -- c) ikinci kez baslatinca AYNI oturum donuyor (cevaplar kaybolmasin)
  o1 := test_basla(banka, NULL);
  o2 := test_basla(banka, NULL);
  IF o1 <> o2 THEN RAISE EXCEPTION 'SINAMA c: yarida kalan teste yeni oturum acildi'; END IF;
  gecen := gecen + 1;

  -- d) artik "devam eden" TRUE
  SELECT * INTO r FROM acik_testlerim() WHERE banka_id = banka;
  IF NOT r.devam_eden THEN RAISE EXCEPTION 'SINAMA d: devam eden oturum gorunmedi'; END IF;
  gecen := gecen + 1;

  -- e) bitirince listede devam_eden tekrar FALSE
  PERFORM testi_bitir(o1);
  SELECT * INTO r FROM acik_testlerim() WHERE banka_id = banka;
  IF r.devam_eden THEN RAISE EXCEPTION 'SINAMA e: bitmis test devam ediyor gorundu'; END IF;
  gecen := gecen + 1;

  -- f) hak durumu deneme olunca test LISTEDE HIC YOK
  RESET ROLE;
  UPDATE soru_bankalari SET hak_durumu = 'deneme' WHERE id = banka;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO sayi FROM acik_testlerim() WHERE banka_id = banka;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA f: izinsiz kitap listede gorundu'; END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM test_sessions WHERE subject = '__SINAMA_DERS__';
  DELETE FROM soru_bankalari WHERE id = banka;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "acik_testler" FROM _sinama_sonucu;
