-- ============================================================
-- Migration: cevap kâğıtları (bölüm başına, öğrenci adına basılan)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN KAYIT TUTULUYOR ───────────────────────────────────
-- Kâğıt basıldığında bir satır açılıyor. Üç işe yarıyor:
--   1) Kâğıdın üzerindeki kimlik şeridi bu satırın KODUNU taşıyor;
--      okuyan taraf kâğıdı buradan tanıyor.
--   2) Hangi öğrenci için basıldığı yazılı — bir öğrencinin başkasının
--      kâğıdını göndermesi fark ediliyor.
--   3) Basıldığı andaki soru/şık sayısı saklanıyor. Anahtar sonradan
--      değişirse basılı kâğıdın ızgarası artık uymuyor demektir;
--      puanlama bunu fark edip reddedebilsin diye.
--
-- ── KOD NEDEN QR DEĞİL ──────────────────────────────────────
-- Kâğıdı biz bastığımız için kimliği kendi bastığımız dolu/boş kare
-- şeridiyle taşıyoruz; aynı doluluk ölçümüyle okunuyor. QR, ya birkaç
-- yüz KB kütüphane ya da iOS'ta OLMAYAN BarcodeDetector demekti
-- (ayrıntı: src/lib/cevapKagidi.js).
--
-- 24 veri biti + 6 sağlama biti. Sağlama tutmazsa kod REDDEDİLİYOR,
-- tahmin edilmiyor: yakın bir kodu tahmin etmek, bir öğrencinin
-- cevaplarını başkasının kâğıdına yazmanın yolu olurdu. Ölçüldü —
-- 500 denemenin 500'ünde tek kare hatası yakalandı, hiçbiri sessizce
-- başka bir kâğıda dönüşmedi.

CREATE TABLE IF NOT EXISTS cevap_kagitlari (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kâğıdın üstüne basılan kimlik (24 bit)
  kod           INTEGER     NOT NULL UNIQUE,
  bolum_id      UUID        NOT NULL REFERENCES soru_bankasi_bolumleri(id) ON DELETE CASCADE,
  student_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  olusturan_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- Basıldığı andaki ızgara ölçüsü
  soru_sayisi   INTEGER     NOT NULL,
  sik_sayisi    INTEGER     NOT NULL DEFAULT 5,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cevap_kagidi_kod        CHECK (kod BETWEEN 0 AND 16777215),
  CONSTRAINT cevap_kagidi_soru       CHECK (soru_sayisi BETWEEN 1 AND 200),
  CONSTRAINT cevap_kagidi_sik        CHECK (sik_sayisi BETWEEN 2 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_cevap_kagitlari_ogrenci
  ON cevap_kagitlari (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cevap_kagitlari_bolum
  ON cevap_kagitlari (bolum_id);

ALTER TABLE cevap_kagitlari ENABLE ROW LEVEL SECURITY;

-- Koç: kendi öğrencisinin kâğıdını basar, görür, siler.
DROP POLICY IF EXISTS "Kagidi ogrencinin kocu yonetir" ON cevap_kagitlari;
CREATE POLICY "Kagidi ogrencinin kocu yonetir" ON cevap_kagitlari
  FOR ALL TO authenticated
  USING      (ogrencim_mi(student_id) OR admin_mi())
  WITH CHECK (ogrencim_mi(student_id) OR admin_mi());

-- Öğrenci: YALNIZ KENDİ kâğıdını OKUR. Bu tabloda cevap yok, anahtar
-- yok — yalnız "senin adına şu bölüm için kâğıt basıldı" bilgisi.
-- Kendisi kâğıt BASAMAZ: kâğıt koçun verdiği ödevin parçası.
DROP POLICY IF EXISTS "Ogrenci kendi kagidini okur" ON cevap_kagitlari;
CREATE POLICY "Ogrenci kendi kagidini okur" ON cevap_kagitlari
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR cocugum_mu(student_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON cevap_kagitlari TO authenticated;

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; yabanci UUID; banka UUID; bolum UUID; kagit UUID;
  red BOOLEAN; okunan INTEGER; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;
  -- Koçun öğrencisi OLMAYAN biri (yoksa o sınama atlanıyor)
  SELECT id INTO yabanci FROM users
   WHERE id <> ogr AND id <> koc AND NOT ogrencim_mi(id) LIMIT 1;

  INSERT INTO soru_bankalari (sahip_id, ad) VALUES (koc, 'Kagit sinama kitabi')
    RETURNING id INTO banka;
  INSERT INTO soru_bankasi_bolumleri (banka_id, sira, baslik)
    VALUES (banka, 1, 'Sinama bolumu') RETURNING id INTO bolum;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);

  -- a) koc ogrencisi icin kagit basabiliyor
  INSERT INTO cevap_kagitlari (kod, bolum_id, student_id, olusturan_id, soru_sayisi, sik_sayisi)
  VALUES (123456, bolum, ogr, koc, 20, 5) RETURNING id INTO kagit;
  gecen := gecen + 1;

  -- b) ayni kod ikinci kez kullanilamaz
  red := false;
  BEGIN
    INSERT INTO cevap_kagitlari (kod, bolum_id, student_id, soru_sayisi)
    VALUES (123456, bolum, ogr, 20);
  EXCEPTION WHEN unique_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: ayni kod iki kagitta kullanilabildi'; END IF;
  gecen := gecen + 1;

  -- c) aralik disi kod reddediliyor
  red := false;
  BEGIN
    INSERT INTO cevap_kagitlari (kod, bolum_id, student_id, soru_sayisi)
    VALUES (99999999, bolum, ogr, 20);
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: aralik disi kod kabul edildi'; END IF;
  gecen := gecen + 1;

  -- d) ogrenci KENDI kagidini okuyabiliyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO okunan FROM cevap_kagitlari WHERE id = kagit;
  IF okunan <> 1 THEN RAISE EXCEPTION 'SINAMA d: ogrenci kendi kagidini okuyamadi'; END IF;
  gecen := gecen + 1;

  -- e) ogrenci KENDINE kagit basamaz (kagit kocun verdigi odevin parcasi)
  red := false;
  BEGIN
    INSERT INTO cevap_kagitlari (kod, bolum_id, student_id, soru_sayisi)
    VALUES (654321, bolum, ogr, 20);
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA e: ogrenci kendine kagit basabildi'; END IF;
  gecen := gecen + 1;

  -- f) yabanci kullanici kagidi goremez
  IF yabanci IS NOT NULL THEN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yabanci)::text, true);
    SELECT count(*) INTO okunan FROM cevap_kagitlari WHERE id = kagit;
    IF okunan <> 0 THEN RAISE EXCEPTION 'SINAMA f: yabanci kullanici kagidi okuyabildi'; END IF;
    gecen := gecen + 1;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM soru_bankalari WHERE id = banka;   -- bolum ve kagit cascade

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "cevap_kagitlari" FROM _sinama_sonucu;
