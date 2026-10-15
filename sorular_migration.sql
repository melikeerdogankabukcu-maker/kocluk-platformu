-- ============================================================
-- Migration: soru içeriği + kitapta hak durumu
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- Dijital test aşama 1 / 1. parça. Akış DIJITAL_TEST.md'de onaylandı.
--
-- ── HAK DURUMU: YANLIŞLIKLA YAYIMLAMAYI ENGELLEYEN KİLİT ────
-- Yayınevi kitaplarının soruları telifli. İzin alınana kadar bu
-- içerik öğrenciye GİTMEMELİ; ama bunu hatırlamaya bırakmak, bir gün
-- birinin yanlışlıkla açması demek. Bu yüzden kural veritabanında:
--
--   deneme        geliştirme/ölçüm — öğrenciye KAPALI (varsayılan)
--   kapali_pilot  izin yok; yalnız kitabı ekleyen koçun KENDİ
--                 öğrencilerine açık, dışa aktarma yok, erişim kayıtlı
--   izinli        yayınevi ile yazılı anlaşma var
--   kendi         kuruma/koça ait özgün sorular
--   acik          kamuya açık (ÖSYM çıkmış sorular vb.)
--
-- Bu hukuki bir koruma değil, operasyonel bir kilit: izni veren de
-- alan da kullanıcı. Sistem yalnızca kazara yayımlamayı engelliyor.
--
-- ── DOĞRU CEVAP ÖĞRENCİYE HİÇBİR YOLDAN GİTMEZ ──────────────
-- RLS satır gizler, KOLON gizlemez. Bu yüzden öğrenci bu tabloyu
-- hiç okumuyor: tek politika kitabın sahibine. Öğrenciye soruları
-- `test_sorulari()` RPC'si sunacak ve o RPC dogru_cevap'ı DÖNDÜRMEZ
-- (2. parçada yazılacak). Cevap anahtarında verdiğimiz kararın
-- aynısı: tarayıcıya inen her şeyi öğrenci okuyabilir.

-- ------------------------------------------------------------
-- 1) Kitapta hak durumu
-- ------------------------------------------------------------
ALTER TABLE soru_bankalari
  ADD COLUMN IF NOT EXISTS hak_durumu TEXT NOT NULL DEFAULT 'deneme';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.soru_bankalari'::regclass
      AND conname = 'soru_bankalari_hak_durumu_check'
  ) THEN
    ALTER TABLE soru_bankalari ADD CONSTRAINT soru_bankalari_hak_durumu_check
      CHECK (hak_durumu IN ('deneme', 'kapali_pilot', 'izinli', 'kendi', 'acik'));
  END IF;
END $$;

COMMENT ON COLUMN soru_bankalari.hak_durumu IS
  'Soruların öğrenciye açılabilirliği. deneme=kapalı, kapali_pilot=yalnız sahibin öğrencileri, izinli/kendi/acik=açık.';

-- Öğrenciye açılabilir mi? Tek yerde tanımlı olsun ki politika ve RPC
-- aynı kuralı iki farklı şekilde yorumlamasın.
CREATE OR REPLACE FUNCTION public.banka_ogrenciye_sunulabilir_mi(p_banka UUID, p_student UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM soru_bankalari b
    WHERE b.id = p_banka
      AND (
        b.hak_durumu IN ('izinli', 'kendi', 'acik')
        OR (
          -- Kapalı pilot: yalnız kitabı ekleyen koçun kendi öğrencisi
          b.hak_durumu = 'kapali_pilot'
          AND EXISTS (
            SELECT 1 FROM teacher_students ts
            WHERE ts.teacher_id = b.sahip_id
              AND ts.student_id = p_student
              AND ts.durum = 'onaylandi'
          )
        )
      )
  );
$fn$;

REVOKE ALL ON FUNCTION public.banka_ogrenciye_sunulabilir_mi(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.banka_ogrenciye_sunulabilir_mi(UUID, UUID) TO authenticated;

-- ------------------------------------------------------------
-- 2) Sorular
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sorular (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  banka_id    UUID        NOT NULL REFERENCES soru_bankalari(id) ON DELETE CASCADE,
  -- Bölüm boş kalabilir: kitaba girilmiş ama henüz bölüme bağlanmamış
  -- soru, bağlanmamış diye kaybolmamalı.
  bolum_id    UUID        REFERENCES soru_bankasi_bolumleri(id) ON DELETE SET NULL,
  numara      INTEGER     NOT NULL,
  -- Metin BOŞ olabilir: bazı sorular tamamen şekilden ibaret.
  metin       TEXT,
  gorsel_url  TEXT,
  sik_sayisi  INTEGER     NOT NULL DEFAULT 5,
  -- [{harf, metin, gorsel_url}] — şıklar da görsel olabiliyor
  siklar      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  -- 'A'..'E' ya da '-' (iptal edilmiş soru: ne doğru ne yanlış)
  dogru_cevap TEXT        NOT NULL,
  konu        TEXT,
  -- Koç gözden geçirmeden öğrenciye AÇILMIYOR. İçe aktarma (PDF)
  -- hatası sessizce öğrencinin önüne gitmesin.
  onayli      BOOLEAN     NOT NULL DEFAULT false,
  ekleyen_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT soru_numara     CHECK (numara BETWEEN 1 AND 1000),
  CONSTRAINT soru_sik_sayisi CHECK (sik_sayisi BETWEEN 2 AND 5),
  -- Doğru cevap şık aralığının dışına çıkamaz (4 şıklı soruda 'E' yok)
  CONSTRAINT soru_dogru_cevap
    CHECK (dogru_cevap = '-' OR dogru_cevap ~ ('^[A-' || chr(64 + sik_sayisi) || ']$')),
  -- Metin de görsel de yoksa ortada soru yok demektir
  CONSTRAINT soru_icerik CHECK (metin IS NOT NULL OR gorsel_url IS NOT NULL),
  CONSTRAINT soru_siklar_dizi CHECK (jsonb_typeof(siklar) = 'array'),
  -- Aynı kitapta aynı numara iki kez olmasın
  CONSTRAINT soru_banka_numara UNIQUE (banka_id, numara)
);

CREATE INDEX IF NOT EXISTS idx_sorular_banka ON sorular (banka_id, numara);
CREATE INDEX IF NOT EXISTS idx_sorular_bolum ON sorular (bolum_id) WHERE bolum_id IS NOT NULL;

ALTER TABLE sorular ENABLE ROW LEVEL SECURITY;

-- TEK POLİTİKA: yalnız kitabın sahibi (ve admin). Öğrenci bu tabloyu
-- HİÇ okumuyor — dogru_cevap kolonu burada ve RLS kolon gizleyemez.
DROP POLICY IF EXISTS "Sorulara yalniz kitabin sahibi erisir" ON sorular;
CREATE POLICY "Sorulara yalniz kitabin sahibi erisir" ON sorular
  FOR ALL TO authenticated
  USING      (bankanin_sahibi_miyim(banka_id))
  WITH CHECK (bankanin_sahibi_miyim(banka_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON sorular TO authenticated;

CREATE OR REPLACE FUNCTION public.soru_zamani()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  IF NEW.ekleyen_id IS NULL THEN NEW.ekleyen_id := auth.uid(); END IF;
  -- Soru DEĞİŞİRSE onay düşüyor: koçun onayladığı metin değil de
  -- başkası öğrenciye gitmesin.
  IF TG_OP = 'UPDATE' AND (
       NEW.metin IS DISTINCT FROM OLD.metin
    OR NEW.siklar IS DISTINCT FROM OLD.siklar
    OR NEW.dogru_cevap IS DISTINCT FROM OLD.dogru_cevap
    OR NEW.gorsel_url IS DISTINCT FROM OLD.gorsel_url
  ) AND NEW.onayli = OLD.onayli THEN
    NEW.onayli := false;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS soru_zaman ON sorular;
CREATE TRIGGER soru_zaman
  BEFORE INSERT OR UPDATE ON sorular
  FOR EACH ROW EXECUTE FUNCTION public.soru_zamani();

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; banka UUID; soru UUID;
  red BOOLEAN; okunan INTEGER; acik BOOLEAN; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  INSERT INTO soru_bankalari (sahip_id, ad) VALUES (koc, 'Soru sinama kitabi')
    RETURNING id INTO banka;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);

  -- a) kitabin sahibi soru ekleyebiliyor
  INSERT INTO sorular (banka_id, numara, metin, siklar, dogru_cevap)
  VALUES (banka, 1, '2+2 kactir?',
          '[{"harf":"A","metin":"3"},{"harf":"B","metin":"4"}]'::jsonb, 'B')
  RETURNING id INTO soru;
  gecen := gecen + 1;

  -- b) sik araligi disinda dogru cevap reddediliyor
  red := false;
  BEGIN
    UPDATE sorular SET sik_sayisi = 4, dogru_cevap = 'E' WHERE id = soru;
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: sik disi dogru cevap kabul edildi'; END IF;
  gecen := gecen + 1;

  -- c) ayni kitapta ayni numara iki kez olamaz
  red := false;
  BEGIN
    INSERT INTO sorular (banka_id, numara, metin, dogru_cevap)
    VALUES (banka, 1, 'baska soru', 'A');
  EXCEPTION WHEN unique_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: ayni numara iki kez eklendi'; END IF;
  gecen := gecen + 1;

  -- d) metin de gorsel de yoksa reddediliyor
  red := false;
  BEGIN
    INSERT INTO sorular (banka_id, numara, dogru_cevap) VALUES (banka, 2, 'A');
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: icerigi olmayan soru kabul edildi'; END IF;
  gecen := gecen + 1;

  -- e) soru degisince ONAY DUSUYOR
  UPDATE sorular SET onayli = true WHERE id = soru;
  UPDATE sorular SET metin = 'degisti' WHERE id = soru;
  IF (SELECT onayli FROM sorular WHERE id = soru) THEN
    RAISE EXCEPTION 'SINAMA e: soru degisti ama onay dusmedi';
  END IF;
  gecen := gecen + 1;

  -- f) OGRENCI SORULARI GOREMEZ (dogru_cevap bu tabloda)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO okunan FROM sorular WHERE banka_id = banka;
  IF okunan <> 0 THEN RAISE EXCEPTION 'SINAMA f: ogrenci sorulari okuyabildi'; END IF;
  gecen := gecen + 1;

  -- g) hak durumu 'deneme' iken kitap ogrenciye SUNULAMAZ
  SELECT banka_ogrenciye_sunulabilir_mi(banka, ogr) INTO acik;
  IF acik THEN RAISE EXCEPTION 'SINAMA g: deneme kitabi ogrenciye sunulabilir cikti'; END IF;
  gecen := gecen + 1;

  -- h) kapali_pilot'ta SAHIBIN ogrencisine sunulabilir
  RESET ROLE;
  UPDATE soru_bankalari SET hak_durumu = 'kapali_pilot' WHERE id = banka;
  SET LOCAL ROLE authenticated;
  SELECT banka_ogrenciye_sunulabilir_mi(banka, ogr) INTO acik;
  IF NOT acik THEN RAISE EXCEPTION 'SINAMA h: kapali pilot kendi ogrencisine sunulamadi'; END IF;
  gecen := gecen + 1;

  -- i) kapali_pilot'ta YABANCI ogrenciye sunulamaz
  SELECT banka_ogrenciye_sunulabilir_mi(banka, koc) INTO acik;   -- koc, kendi ogrencisi degil
  IF acik THEN RAISE EXCEPTION 'SINAMA i: kapali pilot yabanciya sunulabilir cikti'; END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM soru_bankalari WHERE id = banka;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "sorular" FROM _sinama_sonucu;
