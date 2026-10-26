-- ============================================================
-- Migration: testin birimi BÖLÜM değil KONU
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Önce sorular_migration.sql, test_oturumu_migration.sql,
-- acik_testler_migration.sql çalışmış olmalı.
-- ============================================================
--
-- ── NEDEN ───────────────────────────────────────────────────
-- Sayfa fotoğrafı akışında koç sayfayı KONUYLA eşleştiriyor; istek de
-- buydu. Ama test birimi "bölüm"dü ve `sorular.konu` kolonunu hiçbir
-- şey okumuyordu: koç konuyu giriyor, hiçbir yere gitmiyordu.
--
-- Sonucu analiz `test_sessions.topic`'ten okuyor ve o alan BÖLÜMÜN
-- konusundan doluyordu. Bölüm bağlanmamışsa konu alanına kitabın adı
-- yazılıyordu — yani konu analizi "ABC Yayınları TYT Matematik" diye
-- bir konu görüyordu.
--
-- Bundan sonra: test KONU başına açılıyor, kapsamı konu belirliyor,
-- `test_sessions.topic` doğrudan o konu oluyor.
--
-- ── ESKİ OTURUMLAR BOZULMUYOR ───────────────────────────────
-- Yarıda kalmış oturumların kapsamı bölüme göre kurulmuştu. Kapsamı
-- sessizce konuya çevirmek, öğrencinin GÖRDÜĞÜNDEN BAŞKA bir soru
-- kümesi üzerinden puanlanması demek olurdu. Bu yüzden oturum kendi
-- kapsamını yazıyor (`kapsam`), eski satırlar 'bolum' kalıyor ve eski
-- kuralla puanlanıyor.

-- ------------------------------------------------------------
-- 1) Oturum kendi kapsamını taşıyor
-- ------------------------------------------------------------
ALTER TABLE test_oturumlari ADD COLUMN IF NOT EXISTS konu   TEXT;
ALTER TABLE test_oturumlari ADD COLUMN IF NOT EXISTS kapsam TEXT NOT NULL DEFAULT 'bolum';

ALTER TABLE test_oturumlari DROP CONSTRAINT IF EXISTS test_oturum_kapsam;
ALTER TABLE test_oturumlari ADD  CONSTRAINT test_oturum_kapsam
  CHECK (kapsam IN ('konu', 'bolum'));

-- 'konu' kapsamında konu NULL OLABİLİYOR: konusu girilmemiş sorular da
-- bir küme ve öğrenciden saklanmıyorlar. NULL "kitabın tamamı"
-- DEĞİL — o anlam yalnız eski 'bolum' kapsamında geçerli.
COMMENT ON COLUMN test_oturumlari.kapsam IS
  'konu = soru.konu ile eslesen sorular (konu NULL ise konusuz sorular); bolum = eski davranis, bolum_id ile';

-- ------------------------------------------------------------
-- 2) "Bu oturumun soruları" TEK yerde tanımlı
-- ------------------------------------------------------------
-- Bu küme iki yerde kullanılıyor: öğrenciye soruları veren
-- `test_sorulari` ve puanlayan `testi_bitir`. İkisi ayrı ayrı
-- yazılmışken aynı WHERE'i iki kez taşıyordular; biri değişip diğeri
-- kalsa öğrenci GÖRMEDİĞİ sorudan puan kaybederdi ve hata test
-- bitene kadar görünmezdi. Tanım o yüzden tek.
CREATE OR REPLACE FUNCTION public.oturumun_sorulari(p_oturum UUID)
RETURNS SETOF sorular
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT s.*
    FROM sorular s
    JOIN test_oturumlari o ON o.id = p_oturum
   WHERE s.banka_id = o.banka_id
     AND s.onayli
     AND CASE WHEN o.kapsam = 'konu'
              THEN s.konu IS NOT DISTINCT FROM o.konu
              ELSE (o.bolum_id IS NULL OR s.bolum_id = o.bolum_id)
         END
   ORDER BY s.numara;
$fn$;

-- ÖĞRENCİYE KAPALI. `sorular` satırının tamamını döndürüyor, içinde
-- `dogru_cevap` var; yetkisi olsa öğrenci kendi oturumunun kimliğiyle
-- çağırıp bütün anahtarı okurdu. Yalnız SECURITY DEFINER çağıranlar
-- (test_sorulari, testi_bitir) kullanıyor: onlar sahibi olarak
-- çalıştığı için authenticated'e izin GEREKMİYOR.
REVOKE ALL ON FUNCTION public.oturumun_sorulari(UUID) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 3) Açık testler: konu başına bir satır
-- ------------------------------------------------------------
-- Dönüş tipi değiştiği için REPLACE yetmiyor, DROP gerekiyor.
DROP FUNCTION IF EXISTS public.acik_testlerim();
CREATE FUNCTION public.acik_testlerim()
RETURNS TABLE (
  banka_id UUID, ad TEXT, ders TEXT,
  konu TEXT, soru_sayisi BIGINT, devam_eden BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ogrenci UUID := auth.uid();
BEGIN
  IF ogrenci IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT b.id, b.ad, b.ders, s.konu, count(*),
           EXISTS (
             SELECT 1 FROM test_oturumlari o
              WHERE o.student_id = ogrenci
                AND o.banka_id = b.id
                AND o.kapsam = 'konu'
                -- IS NOT DISTINCT FROM olmazsa konusuz kümenin yarıda
                -- kalan oturumu hiç bulunamaz (NULL = NULL tutmaz).
                AND o.konu IS NOT DISTINCT FROM s.konu
                AND o.durum = 'devam'
           )
      FROM sorular s
      JOIN soru_bankalari b ON b.id = s.banka_id
     WHERE s.onayli
       AND banka_ogrenciye_sunulabilir_mi(b.id, ogrenci)
     GROUP BY b.id, b.ad, b.ders, s.konu
     ORDER BY b.ad, s.konu NULLS LAST;
END $fn$;

REVOKE ALL ON FUNCTION public.acik_testlerim() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acik_testlerim() TO authenticated;

-- ------------------------------------------------------------
-- 4) Test başlatma konuya göre
-- ------------------------------------------------------------
-- Eski imza KALKIYOR: ikisi birlikte dursa PostgREST çağrısı hangi
-- fonksiyona gittiği parametre adına kalırdı ve yanlış adla gelen
-- istek sessizce eski davranışı seçerdi.
DROP FUNCTION IF EXISTS public.test_basla(UUID, UUID);
DROP FUNCTION IF EXISTS public.test_basla(UUID, TEXT);

-- p_konu'nun VARSAYILANI YOK: unutulduğunda "kitabın tamamı" gibi
-- sessiz bir anlam kazanmasın, hata versin.
CREATE FUNCTION public.test_basla(p_banka UUID, p_konu TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ogrenci UUID := auth.uid(); adet INTEGER; oturum UUID;
BEGIN
  IF ogrenci IS NULL THEN
    RAISE EXCEPTION 'Oturum acik degil.' USING ERRCODE = '42501';
  END IF;

  IF NOT banka_ogrenciye_sunulabilir_mi(p_banka, ogrenci) THEN
    RAISE EXCEPTION 'Bu kitap size acik degil.' USING ERRCODE = '42501';
  END IF;

  -- Devam eden oturum varsa onu döndür; yeni oturum açmak öğrencinin
  -- verdiği cevapları çöpe atardı. Hak denetiminden SONRA: izin geri
  -- alındıysa yarıda kalan teste de devam edilmemeli.
  SELECT id INTO oturum FROM test_oturumlari
   WHERE student_id = ogrenci AND banka_id = p_banka
     AND kapsam = 'konu' AND konu IS NOT DISTINCT FROM p_konu
     AND durum = 'devam'
   ORDER BY baslangic DESC LIMIT 1;
  IF oturum IS NOT NULL THEN RETURN oturum; END IF;

  SELECT count(*) INTO adet FROM sorular s
   WHERE s.banka_id = p_banka
     AND s.konu IS NOT DISTINCT FROM p_konu
     AND s.onayli;
  IF adet = 0 THEN
    RAISE EXCEPTION 'Bu testte onaylanmis soru yok.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO test_oturumlari (student_id, banka_id, konu, kapsam, soru_sayisi)
  VALUES (ogrenci, p_banka, p_konu, 'konu', adet)
  RETURNING id INTO oturum;
  RETURN oturum;
END $fn$;

REVOKE ALL ON FUNCTION public.test_basla(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_basla(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 5) Sorular ve puanlama ortak kümeyi kullanıyor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_sorulari(p_oturum UUID)
RETURNS TABLE (
  soru_id UUID, numara INTEGER, metin TEXT, gorsel_url TEXT,
  sik_sayisi INTEGER, siklar JSONB, verilen_cevap TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE o RECORD;
BEGIN
  SELECT * INTO o FROM test_oturumlari WHERE id = p_oturum;
  IF o IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadi.'; END IF;
  -- Oturum sahibi ya da koçu; başkası soruları alamaz.
  IF NOT (o.student_id = auth.uid() OR ogrencim_mi(o.student_id) OR admin_mi()) THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT s.id, s.numara, s.metin, s.gorsel_url, s.sik_sayisi, s.siklar, c.cevap
      FROM oturumun_sorulari(p_oturum) s
      LEFT JOIN oturum_cevaplari c ON c.oturum_id = p_oturum AND c.soru_id = s.id
     ORDER BY s.numara;
  -- dogru_cevap BİLEREK seçilmiyor. Bu satır değiştirilirse testin
  -- bütün güvencesi düşer: anahtar tarayıcıya iner.
END $fn$;

REVOKE ALL ON FUNCTION public.test_sorulari(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_sorulari(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.testi_bitir(p_oturum UUID)
RETURNS TABLE (soru_id UUID, numara INTEGER, sonuc TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  o RECORD; d INTEGER; y INTEGER; b INTEGER; i INTEGER; n NUMERIC;
  ders TEXT; konu TEXT;
BEGIN
  SELECT * INTO o FROM test_oturumlari WHERE id = p_oturum;
  IF o IS NULL THEN RAISE EXCEPTION 'Oturum bulunamadi.'; END IF;
  IF NOT (o.student_id = auth.uid() OR ogrencim_mi(o.student_id) OR admin_mi()) THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  IF o.durum = 'bitti' THEN
    RAISE EXCEPTION 'Bu test zaten bitirilmis.' USING ERRCODE = 'P0001';
  END IF;

  WITH hesap AS (
    SELECT
      CASE
        WHEN s.dogru_cevap = '-'                      THEN 'iptal'
        WHEN c.cevap IS NULL                          THEN 'bos'
        WHEN upper(c.cevap) = upper(s.dogru_cevap)    THEN 'dogru'
        ELSE 'yanlis'
      END AS durum
    FROM oturumun_sorulari(p_oturum) s
    LEFT JOIN oturum_cevaplari c ON c.oturum_id = p_oturum AND c.soru_id = s.id
  )
  SELECT count(*) FILTER (WHERE durum = 'dogru'),
         count(*) FILTER (WHERE durum = 'yanlis'),
         count(*) FILTER (WHERE durum = 'bos'),
         count(*) FILTER (WHERE durum = 'iptal')
    INTO d, y, b, i FROM hesap;

  -- Net: doğru − yanlış/4. İptal edilen soru hiçbir tarafa sayılmıyor.
  n := round((d - y / 4.0)::numeric, 2);

  UPDATE test_oturumlari
     SET durum = 'bitti', bitis = now(),
         dogru = d, yanlis = y, bos = b, iptal = i, net = n
   WHERE id = p_oturum;

  -- Mevcut analiz test_sessions'tan besleniyor; dijital test de oraya
  -- yazıyor ki konu ilerlemesi ve raporlar kendiliğinden görsün.
  --
  -- KONU artık doğrudan oturumun konusu. Eskiden bölümün konusundan
  -- geliyordu ve bölüm bağlanmamışsa yerine KİTABIN ADI yazılıyordu;
  -- konu analizine konu diye kitap adı düşüyordu.
  SELECT bk.ders, COALESCE(o.konu, bl.konu, bl.baslik, bk.ad)
    INTO ders, konu
    FROM soru_bankalari bk
    LEFT JOIN soru_bankasi_bolumleri bl ON bl.id = o.bolum_id
   WHERE bk.id = o.banka_id;

  INSERT INTO test_sessions (student_id, subject, topic,
                             question_count, correct_count, yanlis_count)
  VALUES (o.student_id, COALESCE(ders, 'Genel'), COALESCE(konu, 'Konusuz'),
          d + y + b, d, y);

  -- Soru soru sonuç dönüyor ama DOĞRU ŞIK dönmüyor: dönseydi öğrenci
  -- boş bir oturumu hemen bitirip bütün anahtarı okuyabilirdi.
  RETURN QUERY
    SELECT s.id, s.numara,
      CASE
        WHEN s.dogru_cevap = '-'                   THEN 'iptal'
        WHEN c.cevap IS NULL                       THEN 'bos'
        WHEN upper(c.cevap) = upper(s.dogru_cevap) THEN 'dogru'
        ELSE 'yanlis'
      END
    FROM oturumun_sorulari(p_oturum) s
    LEFT JOIN oturum_cevaplari c ON c.oturum_id = p_oturum AND c.soru_id = s.id
    ORDER BY s.numara;
END $fn$;

REVOKE ALL ON FUNCTION public.testi_bitir(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.testi_bitir(UUID) TO authenticated;

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; banka UUID; bolum UUID;
  t1 UUID; t2 UUID; k1 UUID;         -- Türev soruları / konusuz soru
  oturum UUID; eski UUID; sayi INTEGER; r RECORD;
  konu_satir RECORD; giden_konu TEXT; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  -- Ders adı BENZERSİZ bir damga: testi_bitir'in açtığı test_sessions
  -- satırı sonunda tam olarak bununla bulunup siliniyor. 'Matematik'
  -- yazsaydık temizlik öğrencinin GERÇEK bir kaydını silebilirdi.
  INSERT INTO soru_bankalari (sahip_id, ad, ders, hak_durumu)
  VALUES (koc, 'Konu sinama kitabi', '__SINAMA_DERS__', 'kapali_pilot')
  RETURNING id INTO banka;
  INSERT INTO soru_bankasi_bolumleri (banka_id, sira, baslik)
  VALUES (banka, 1, 'Birinci bolum') RETURNING id INTO bolum;

  INSERT INTO sorular (banka_id, bolum_id, numara, metin, dogru_cevap, konu, onayli)
  VALUES (banka, bolum, 1, 'turev 1', 'A', 'Turev', true) RETURNING id INTO t1;
  INSERT INTO sorular (banka_id, bolum_id, numara, metin, dogru_cevap, konu, onayli)
  VALUES (banka, bolum, 2, 'turev 2', 'B', 'Turev', true) RETURNING id INTO t2;
  INSERT INTO sorular (banka_id, bolum_id, numara, metin, dogru_cevap, konu, onayli)
  VALUES (banka, bolum, 3, 'konusuz', 'C', NULL,    true) RETURNING id INTO k1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);

  -- a) acik_testlerim KONU basina satir donuyor (Turev + konusuz = 2)
  SELECT count(*) INTO sayi FROM acik_testlerim() WHERE banka_id = banka;
  IF sayi <> 2 THEN
    RAISE EXCEPTION 'SINAMA a: konu grubu sayisi % (2 bekleniyordu)', sayi;
  END IF;
  gecen := gecen + 1;

  -- b) Turev satiri 2 soru sayiyor
  SELECT * INTO konu_satir FROM acik_testlerim()
   WHERE banka_id = banka AND konu = 'Turev';
  IF konu_satir.soru_sayisi <> 2 THEN
    RAISE EXCEPTION 'SINAMA b: Turev soru sayisi % (2 bekleniyordu)', konu_satir.soru_sayisi;
  END IF;
  gecen := gecen + 1;

  -- c) test_basla konuya gore aciyor ve KAPSAMI yaziyor
  oturum := test_basla(banka, 'Turev');
  SELECT * INTO r FROM test_oturumlari WHERE id = oturum;
  IF (r.kapsam, r.konu, r.soru_sayisi) IS DISTINCT FROM ('konu', 'Turev', 2) THEN
    RAISE EXCEPTION 'SINAMA c: oturum kapsami yanlis (kapsam=% konu=% adet=%)',
      r.kapsam, r.konu, r.soru_sayisi;
  END IF;
  gecen := gecen + 1;

  -- d) oturum YALNIZ o konunun sorularini gosteriyor (konusuz soru yok)
  SELECT count(*) INTO sayi FROM test_sorulari(oturum);
  IF sayi <> 2 THEN
    RAISE EXCEPTION 'SINAMA d: oturumda % soru (2 bekleniyordu)', sayi;
  END IF;
  gecen := gecen + 1;

  -- e) ayni konuda ikinci cagri AYNI oturumu donduruyor
  IF test_basla(banka, 'Turev') <> oturum THEN
    RAISE EXCEPTION 'SINAMA e: yarida kalan oturum yerine yenisi acildi';
  END IF;
  gecen := gecen + 1;

  -- f) konusuz kume AYRI bir oturum (NULL "kitabin tamami" degil)
  eski := test_basla(banka, NULL);
  IF eski = oturum THEN
    RAISE EXCEPTION 'SINAMA f: konusuz kume Turev oturumuyla ayni sayildi';
  END IF;
  SELECT count(*) INTO sayi FROM test_sorulari(eski);
  IF sayi <> 1 THEN
    RAISE EXCEPTION 'SINAMA f2: konusuz oturumda % soru (1 bekleniyordu)', sayi;
  END IF;
  gecen := gecen + 1;

  -- g) puanlama yalniz oturumun sorulari uzerinden
  INSERT INTO oturum_cevaplari (oturum_id, soru_id, cevap) VALUES (oturum, t1, 'A');
  INSERT INTO oturum_cevaplari (oturum_id, soru_id, cevap) VALUES (oturum, t2, 'E');
  PERFORM testi_bitir(oturum);
  SELECT * INTO r FROM test_oturumlari WHERE id = oturum;
  IF (r.dogru, r.yanlis, r.bos, r.net) IS DISTINCT FROM (1, 1, 0, 0.75::numeric) THEN
    RAISE EXCEPTION 'SINAMA g: puanlama yanlis (d=% y=% b=% net=%)',
      r.dogru, r.yanlis, r.bos, r.net;
  END IF;
  gecen := gecen + 1;

  -- h) test_sessions.topic KITABIN ADI degil KONU
  -- Okuma SAHIP olarak: burada sinanan sey analize ne gittigi, test_sessions
  -- politikasi degil. Ogrenci rolunde okunsa politika yuzunden bos donmesi
  -- "konu yanlis" gibi gorunurdu.
  RESET ROLE;
  SELECT topic INTO giden_konu FROM test_sessions
   WHERE student_id = ogr AND subject = '__SINAMA_DERS__'
   ORDER BY created_at DESC LIMIT 1;
  IF giden_konu IS DISTINCT FROM 'Turev' THEN
    RAISE EXCEPTION 'SINAMA h: analize giden konu "%" (Turev bekleniyordu)', giden_konu;
  END IF;
  gecen := gecen + 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);

  -- i) ogrenci oturumun_sorulari'yi cagiramiyor (dogru_cevap orada)
  BEGIN
    PERFORM count(*) FROM oturumun_sorulari(eski);
    RAISE EXCEPTION 'SINAMA i: ogrenci dogru cevaplari okuyabildi';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  gecen := gecen + 1;

  -- j) ESKI oturumlar (kapsam='bolum') eski kuralla calisiyor
  RESET ROLE;
  INSERT INTO test_oturumlari (student_id, banka_id, bolum_id, kapsam, soru_sayisi)
  VALUES (ogr, banka, bolum, 'bolum', 3) RETURNING id INTO eski;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO sayi FROM test_sorulari(eski);
  IF sayi <> 3 THEN
    RAISE EXCEPTION 'SINAMA j: eski kapsamli oturumda % soru (3 bekleniyordu)', sayi;
  END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM test_sessions WHERE subject = '__SINAMA_DERS__';
  DELETE FROM soru_bankalari WHERE id = banka;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "konu_testleri" FROM _sinama_sonucu;
