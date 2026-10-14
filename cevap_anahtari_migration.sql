-- ============================================================
-- Migration: cevap anahtarları (kitap bölümüne bağlı)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN BÖLÜME BAĞLI ──────────────────────────────────────
-- Kullanıcının kararı: anahtar kitabın BÖLÜMÜNE bağlı. Bir kez
-- girilince o kitabı kullanan her öğrencide çalışıyor. Ödeve bağlansa
-- her ödev için yeniden girilmesi gerekirdi.
-- Bölüm başına tek anahtar: birincil anahtar bolum_id'nin kendisi.
--
-- ── ÖĞRENCİ BU TABLOYU GÖREMEZ ──────────────────────────────
-- En önemli kural. Fotoğraftan net okumayı tarayıcıda yapmayı
-- planlıyoruz; ama puanlama da tarayıcıda yapılsaydı anahtarın
-- öğrencinin cihazına inmesi gerekirdi — yani öğrenci cevapları
-- okuyabilirdi. "Doğrulanmış çalışma kaydı" iddiası olan bir üründe
-- bu kabul edilemez.
--
-- Bu yüzden: okuma tarayıcıda kalabilir, KARŞILAŞTIRMA sunucuda olur.
-- Tarayıcı işaretlenen şıkları gönderir, sunucu anahtarla karşılaştırıp
-- yalnız sonucu döner. Anahtar sunucudan hiç çıkmaz.
-- (Puanlama RPC'si okuma işiyle birlikte yazılacak.)
--
-- ── İPTAL EDİLEN SORU ───────────────────────────────────────
-- Cevap dizisinde '-' iptal demek: o soru ne doğru ne yanlış sayılıyor.
-- Gerçek kitaplarda iptal edilen soru oluyor ve onu "yanlış" saymak
-- öğrencinin netini haksız yere düşürürdü.

CREATE TABLE IF NOT EXISTS cevap_anahtarlari (
  bolum_id    UUID        PRIMARY KEY
                          REFERENCES soru_bankasi_bolumleri(id) ON DELETE CASCADE,
  soru_sayisi INTEGER     NOT NULL,
  -- Şık sayısı: LGS'de 4, YKS'de 5. Anahtar harfleri bu aralıkla sınırlı.
  sik_sayisi  INTEGER     NOT NULL DEFAULT 5,
  -- Soru başına bir harf: "ABCDE..." ya da iptal için '-'
  cevaplar    TEXT        NOT NULL,
  giren_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT cevap_anahtari_soru_sayisi CHECK (soru_sayisi BETWEEN 1 AND 200),
  CONSTRAINT cevap_anahtari_sik_sayisi  CHECK (sik_sayisi BETWEEN 2 AND 5),
  -- Dizinin uzunluğu soru sayısıyla aynı olmalı: biri değişip diğeri
  -- kalırsa puanlama sessizce kayar.
  CONSTRAINT cevap_anahtari_uzunluk CHECK (char_length(cevaplar) = soru_sayisi),
  -- Harfler şık sayısıyla sınırlı: 4 şıklı testte 'E' işaretlenemez,
  -- anahtarda da bulunamaz. Desen sik_sayisi'ndan üretiliyor.
  CONSTRAINT cevap_anahtari_harfler
    CHECK (cevaplar ~ ('^[A-' || chr(64 + sik_sayisi) || '-]+$'))
);

ALTER TABLE cevap_anahtarlari ENABLE ROW LEVEL SECURITY;

-- Tek politika, tek kural: anahtara YALNIZCA kitabın sahibi (ve admin)
-- erişiyor. Öğrenci ve veli için hiçbir politika yok — yani hiç
-- göremiyorlar. Bu tabloya "görünür kitap" mantığıyla okuma izni
-- vermek, anahtarı öğrenciye açmak olurdu.
DROP POLICY IF EXISTS "Cevap anahtarina yalniz kitabin sahibi erisir" ON cevap_anahtarlari;
CREATE POLICY "Cevap anahtarina yalniz kitabin sahibi erisir" ON cevap_anahtarlari
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM soru_bankasi_bolumleri b
    WHERE b.id = bolum_id AND bankanin_sahibi_miyim(b.banka_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM soru_bankasi_bolumleri b
    WHERE b.id = bolum_id AND bankanin_sahibi_miyim(b.banka_id)
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON cevap_anahtarlari TO authenticated;

CREATE OR REPLACE FUNCTION public.cevap_anahtari_zamani()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  -- Anahtarı kimin girdiği kayıtlı kalsın: yanlış anahtar bütün
  -- sınıfın netini bozar, kime sorulacağı bilinmeli.
  IF NEW.giren_id IS NULL THEN NEW.giren_id := auth.uid(); END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS cevap_anahtari_zaman ON cevap_anahtarlari;
CREATE TRIGGER cevap_anahtari_zaman
  BEFORE INSERT OR UPDATE ON cevap_anahtarlari
  FOR EACH ROW EXECUTE FUNCTION public.cevap_anahtari_zamani();

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- Sonuç SATIR olarak dönüyor (SQL Editor NOTICE göstermiyor) ve
-- RLS sınamaları `authenticated` rolüyle yapılıyor — tablo sahibi
-- olarak çalışırsa satır güvenliği hiç devreye girmez.
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; banka UUID; bolum UUID;
  red BOOLEAN; okunan INTEGER; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  -- Sınama kitabı ve bölümü (sahip olarak hazırlanıyor)
  INSERT INTO soru_bankalari (sahip_id, ad) VALUES (koc, 'Anahtar sinama kitabi')
    RETURNING id INTO banka;
  INSERT INTO soru_bankasi_bolumleri (banka_id, sira, baslik)
    VALUES (banka, 1, 'Sinama bolumu') RETURNING id INTO bolum;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);

  -- a) kitabin sahibi anahtar girebiliyor
  INSERT INTO cevap_anahtarlari (bolum_id, soru_sayisi, sik_sayisi, cevaplar)
  VALUES (bolum, 10, 5, 'ABCDEABCDE');
  gecen := gecen + 1;

  -- b) uzunluk tutmazsa reddediliyor
  red := false;
  BEGIN
    UPDATE cevap_anahtarlari SET cevaplar = 'ABC' WHERE bolum_id = bolum;
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: uzunlugu tutmayan anahtar kabul edildi'; END IF;
  gecen := gecen + 1;

  -- c) sik sayisinin disindaki harf reddediliyor (4 sikli testte E)
  red := false;
  BEGIN
    UPDATE cevap_anahtarlari SET sik_sayisi = 4, cevaplar = 'ABCDEABCDE' WHERE bolum_id = bolum;
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: sik disi harf kabul edildi'; END IF;
  gecen := gecen + 1;

  -- d) iptal isareti kabul ediliyor
  UPDATE cevap_anahtarlari SET cevaplar = 'ABCDE-BCDE' WHERE bolum_id = bolum;
  gecen := gecen + 1;

  -- e) OGRENCI ANAHTARI GOREMEZ  (bu tablonun varlik sebebi)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO okunan FROM cevap_anahtarlari WHERE bolum_id = bolum;
  IF okunan <> 0 THEN RAISE EXCEPTION 'SINAMA e: ogrenci cevap anahtarini okuyabildi'; END IF;
  gecen := gecen + 1;

  -- f) ogrenci anahtar yazamaz
  red := false;
  BEGIN
    INSERT INTO cevap_anahtarlari (bolum_id, soru_sayisi, cevaplar)
    VALUES (bolum, 3, 'AAA');
  EXCEPTION WHEN insufficient_privilege OR unique_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA f: ogrenci anahtar yazabildi'; END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM soru_bankalari WHERE id = banka;   -- bolum ve anahtar cascade

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "cevap_anahtarlari" FROM _sinama_sonucu;
