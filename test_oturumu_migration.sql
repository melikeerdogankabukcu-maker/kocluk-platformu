-- ============================================================
-- Migration: test oturumu, cevaplar ve SUNUCUDA puanlama
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent. Önce sorular_migration.sql.
-- ============================================================
--
-- Dijital test aşama 1 / 2. parça.
--
-- ── NEDEN HER ŞEY RPC ÜZERİNDEN ─────────────────────────────
-- Öğrenci `sorular` tablosunu okuyamıyor, çünkü doğru cevap orada ve
-- RLS kolon gizlemiyor. Dolayısıyla öğrencinin yapacağı her iş bir
-- RPC'den geçiyor:
--   test_basla(banka, bolum)   oturum açar (hak durumunu denetler)
--   test_sorulari(oturum)      soruları DOĞRU CEVAPSIZ döndürür
--   test_cevapla(oturum, soru, cevap)   cevabı kaydeder
--   testi_bitir(oturum)        SUNUCUDA puanlar, oturumu kilitler
--
-- ── BİTİRİNCE DOĞRU CEVAPLAR DÖNMÜYOR ───────────────────────
-- Sonuçta soru soru "doğru/yanlış/boş" dönüyor ama DOĞRU ŞIK
-- dönmüyor. Sebep: dönseydi öğrenci boş bir oturum açıp hemen
-- bitirerek bütün anahtarı okuyabilirdi. Öğrencinin elinde kitabın
-- kendisi zaten var; doğru cevabı oradan görüyor. Koç ise `sorular`
-- tablosunu okuyabildiği için her şeyi görüyor.

-- ------------------------------------------------------------
-- 1) Oturum ve cevaplar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_oturumlari (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banka_id    UUID        NOT NULL REFERENCES soru_bankalari(id) ON DELETE CASCADE,
  bolum_id    UUID        REFERENCES soru_bankasi_bolumleri(id) ON DELETE SET NULL,
  durum       TEXT        NOT NULL DEFAULT 'devam',
  soru_sayisi INTEGER     NOT NULL DEFAULT 0,
  dogru       INTEGER     NOT NULL DEFAULT 0,
  yanlis      INTEGER     NOT NULL DEFAULT 0,
  bos         INTEGER     NOT NULL DEFAULT 0,
  iptal       INTEGER     NOT NULL DEFAULT 0,
  net         NUMERIC(6,2),
  baslangic   TIMESTAMPTZ NOT NULL DEFAULT now(),
  bitis       TIMESTAMPTZ,
  CONSTRAINT test_oturum_durum CHECK (durum IN ('devam', 'bitti'))
);

CREATE INDEX IF NOT EXISTS idx_test_oturum_ogrenci
  ON test_oturumlari (student_id, baslangic DESC);

CREATE TABLE IF NOT EXISTS oturum_cevaplari (
  oturum_id UUID NOT NULL REFERENCES test_oturumlari(id) ON DELETE CASCADE,
  soru_id   UUID NOT NULL REFERENCES sorular(id) ON DELETE CASCADE,
  -- NULL = boş bıraktı
  cevap     TEXT,
  sure_sn   INTEGER,
  PRIMARY KEY (oturum_id, soru_id),
  CONSTRAINT oturum_cevap_harf CHECK (cevap IS NULL OR cevap ~ '^[A-E]$')
);

ALTER TABLE test_oturumlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE oturum_cevaplari ENABLE ROW LEVEL SECURITY;

-- Oturumu öğrenci okur; koçu ve velisi de okur (ilerleme takibi).
-- YAZMAYI öğrenci yapmıyor: oturum RPC ile açılıyor ve RPC ile
-- kapanıyor. Öğrenci kendi oturumuna "bitti, 40 doğru" yazamasın.
DROP POLICY IF EXISTS "Oturumu taraflar okur" ON test_oturumlari;
CREATE POLICY "Oturumu taraflar okur" ON test_oturumlari
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR ogrencim_mi(student_id)
         OR cocugum_mu(student_id) OR admin_mi());

-- Cevapları öğrenci kendi oturumunda yazabiliyor (devam ederken).
DROP POLICY IF EXISTS "Cevabi ogrenci yazar" ON oturum_cevaplari;
CREATE POLICY "Cevabi ogrenci yazar" ON oturum_cevaplari
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM test_oturumlari o
    WHERE o.id = oturum_id
      AND (o.student_id = auth.uid() OR ogrencim_mi(o.student_id)
           OR cocugum_mu(o.student_id) OR admin_mi())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM test_oturumlari o
    WHERE o.id = oturum_id AND o.student_id = auth.uid() AND o.durum = 'devam'
  ));

GRANT SELECT ON test_oturumlari TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON oturum_cevaplari TO authenticated;

-- Bitmiş oturumun cevabı değişmiyor. WITH CHECK yalnız yazarken
-- bakıyor; silmeyi de engellemek için tetikleyici gerekiyor.
CREATE OR REPLACE FUNCTION public.oturum_cevabi_koru()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE o_durum TEXT; o_ogrenci UUID;
BEGIN
  SELECT durum, student_id INTO o_durum, o_ogrenci FROM test_oturumlari
   WHERE id = COALESCE(NEW.oturum_id, OLD.oturum_id);
  IF o_durum = 'bitti' AND NOT admin_mi() THEN
    RAISE EXCEPTION 'Bitmis testin cevaplari degistirilemez.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $fn$;

DROP TRIGGER IF EXISTS oturum_cevap_kilidi ON oturum_cevaplari;
CREATE TRIGGER oturum_cevap_kilidi
  BEFORE INSERT OR UPDATE OR DELETE ON oturum_cevaplari
  FOR EACH ROW EXECUTE FUNCTION public.oturum_cevabi_koru();

-- ------------------------------------------------------------
-- 2) Testi başlat
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_basla(p_banka UUID, p_bolum UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE ogrenci UUID := auth.uid(); adet INTEGER; oturum UUID;
BEGIN
  IF ogrenci IS NULL THEN
    RAISE EXCEPTION 'Oturum acik degil.' USING ERRCODE = '42501';
  END IF;

  -- Hak durumu kapısı. Kitap öğrenciye açık değilse test hiç başlamaz.
  IF NOT banka_ogrenciye_sunulabilir_mi(p_banka, ogrenci) THEN
    RAISE EXCEPTION 'Bu kitap size acik degil.' USING ERRCODE = '42501';
  END IF;

  -- Yalnız ONAYLI sorular sayılıyor: koç gözden geçirmediyse test yok.
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

-- ------------------------------------------------------------
-- 3) Soruları sun — DOĞRU CEVAP YOK
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
      FROM sorular s
      LEFT JOIN oturum_cevaplari c ON c.oturum_id = p_oturum AND c.soru_id = s.id
     WHERE s.banka_id = o.banka_id
       AND (o.bolum_id IS NULL OR s.bolum_id = o.bolum_id)
       AND s.onayli
     ORDER BY s.numara;
  -- dogru_cevap BİLEREK seçilmiyor. Bu satır değiştirilirse testin
  -- cevapları öğrencinin tarayıcısına iner.
END $fn$;

-- ------------------------------------------------------------
-- 4) Testi bitir — PUANLAMA SUNUCUDA
-- ------------------------------------------------------------
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
    FROM sorular s
    LEFT JOIN oturum_cevaplari c ON c.oturum_id = p_oturum AND c.soru_id = s.id
    WHERE s.banka_id = o.banka_id
      AND (o.bolum_id IS NULL OR s.bolum_id = o.bolum_id)
      AND s.onayli
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
  SELECT bk.ders, COALESCE(bl.konu, bl.baslik, bk.ad)
    INTO ders, konu
    FROM soru_bankalari bk
    LEFT JOIN soru_bankasi_bolumleri bl ON bl.id = o.bolum_id
   WHERE bk.id = o.banka_id;

  INSERT INTO test_sessions (student_id, subject, topic,
                             question_count, correct_count, yanlis_count)
  VALUES (o.student_id, COALESCE(ders, 'Genel'), COALESCE(konu, 'Test'),
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
    FROM sorular s
    LEFT JOIN oturum_cevaplari c ON c.oturum_id = p_oturum AND c.soru_id = s.id
    WHERE s.banka_id = o.banka_id
      AND (o.bolum_id IS NULL OR s.bolum_id = o.bolum_id)
      AND s.onayli
    ORDER BY s.numara;
END $fn$;

REVOKE ALL ON FUNCTION public.test_basla(UUID, UUID)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.test_sorulari(UUID)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.testi_bitir(UUID)         FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.test_basla(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_sorulari(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.testi_bitir(UUID)      TO authenticated;

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; banka UUID; s1 UUID; s2 UUID; s3 UUID;
  oturum UUID; red BOOLEAN; sayi INTEGER; r RECORD; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  -- Ders adı BENZERSİZ bir damga: testi_bitir'in açtığı test_sessions
  -- satırı sonunda tam olarak bununla bulunup siliniyor. 'Matematik'
  -- yazsaydık temizlik öğrencinin GERÇEK bir test kaydını silebilirdi.
  INSERT INTO soru_bankalari (sahip_id, ad, ders, hak_durumu)
  VALUES (koc, 'Oturum sinama kitabi', '__SINAMA_DERS__', 'kapali_pilot')
  RETURNING id INTO banka;
  INSERT INTO sorular (banka_id, numara, metin, dogru_cevap, onayli)
  VALUES (banka, 1, 'soru 1', 'A', true) RETURNING id INTO s1;
  INSERT INTO sorular (banka_id, numara, metin, dogru_cevap, onayli)
  VALUES (banka, 2, 'soru 2', 'B', true) RETURNING id INTO s2;
  INSERT INTO sorular (banka_id, numara, metin, dogru_cevap, onayli)
  VALUES (banka, 3, 'soru 3', '-', true) RETURNING id INTO s3;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);

  -- a) ogrenci test baslatabiliyor (kapali pilot, kendi kocunun kitabi)
  oturum := test_basla(banka, NULL);
  gecen := gecen + 1;

  -- b) sorular DOGRU CEVAPSIZ geliyor
  SELECT count(*) INTO sayi FROM test_sorulari(oturum);
  IF sayi <> 3 THEN RAISE EXCEPTION 'SINAMA b: soru sayisi % (3 bekleniyordu)', sayi; END IF;
  gecen := gecen + 1;

  -- c) ogrenci sorular tablosunu hala okuyamiyor
  SELECT count(*) INTO sayi FROM sorular WHERE banka_id = banka;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA c: ogrenci sorulari okuyabildi'; END IF;
  gecen := gecen + 1;

  -- d) cevap yazilabiliyor (1 dogru, 1 yanlis, 1 iptal sorusu bos)
  INSERT INTO oturum_cevaplari (oturum_id, soru_id, cevap) VALUES (oturum, s1, 'A');
  INSERT INTO oturum_cevaplari (oturum_id, soru_id, cevap) VALUES (oturum, s2, 'C');
  gecen := gecen + 1;

  -- e) puanlama SUNUCUDA dogru hesapliyor
  PERFORM testi_bitir(oturum);
  SELECT * INTO r FROM test_oturumlari WHERE id = oturum;
  IF (r.dogru, r.yanlis, r.bos, r.iptal, r.net, r.durum)
     IS DISTINCT FROM (1, 1, 0, 1, 0.75::numeric, 'bitti') THEN
    RAISE EXCEPTION 'SINAMA e: puanlama yanlis (d=% y=% b=% i=% net=% durum=%)',
      r.dogru, r.yanlis, r.bos, r.iptal, r.net, r.durum;
  END IF;
  gecen := gecen + 1;

  -- f) bitmis testin cevabi DEGISTIRILEMIYOR
  red := false;
  BEGIN
    UPDATE oturum_cevaplari SET cevap = 'A' WHERE oturum_id = oturum AND soru_id = s2;
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA f: bitmis testin cevabi degistirildi'; END IF;
  gecen := gecen + 1;

  -- g) ikinci kez bitirilemiyor
  red := false;
  BEGIN PERFORM testi_bitir(oturum);
  EXCEPTION WHEN raise_exception THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA g: test iki kez bitirildi'; END IF;
  gecen := gecen + 1;

  -- h) test_sessions'a kayit dustu (mevcut analiz bunu goruyor)
  SELECT count(*) INTO sayi FROM test_sessions
   WHERE student_id = ogr AND subject = '__SINAMA_DERS__';
  IF sayi = 0 THEN RAISE EXCEPTION 'SINAMA h: test_sessions kaydi olusmadi'; END IF;
  gecen := gecen + 1;

  -- i) hak durumu 'deneme' olunca test BASLATILAMIYOR
  RESET ROLE;
  UPDATE soru_bankalari SET hak_durumu = 'deneme' WHERE id = banka;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  red := false;
  BEGIN PERFORM test_basla(banka, NULL);
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA i: izinsiz kitapta test baslatildi'; END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM test_sessions WHERE subject = '__SINAMA_DERS__';
  DELETE FROM soru_bankalari WHERE id = banka;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "test_oturumu" FROM _sinama_sonucu;
