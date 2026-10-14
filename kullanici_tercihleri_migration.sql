-- ============================================================
-- Migration: kullanıcı tercihleri (görünüm: renk teması + avatar)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN AYRI TABLO ────────────────────────────────────────
-- Tercih her rolde var: öğrenci de koç da veli de kendi panelinin
-- rengini seçebilmeli. student_profiles'a konsaydı yalnız öğrenciye
-- çalışırdı; users'a konsaydı kimlik tablosu her yeni tercihle
-- şişerdi. Burası bundan sonraki tercihlerin de yeri.
--
-- ── NE SAKLAMIYOR ───────────────────────────────────────────
-- Tema ve avatar görünüm bilgisi; kişisel veri değil. Fotoğraf
-- BURAYA GİRMİYOR — o student_profiles.photo_url'de duruyor ve
-- kapalı depodan imzalı adresle açılıyor.

CREATE TABLE IF NOT EXISTS kullanici_tercihleri (
  id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Palet kodu (src/lib/theme.js içindeki PALETLER anahtarı).
  -- NULL = rolün varsayılan paleti.
  tema       TEXT,
  -- Hazır avatar kodu (src/lib/avatarlar.js). NULL = baş harfler.
  avatar     TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE kullanici_tercihleri ENABLE ROW LEVEL SECURITY;

-- ── YAZMA: yalnız kişinin kendisi ───────────────────────────
-- Koç öğrencisinin temasını değiştiremez: bu onun paneli, onun kararı.
DROP POLICY IF EXISTS "Tercihini kendisi yazar" ON kullanici_tercihleri;
CREATE POLICY "Tercihini kendisi yazar" ON kullanici_tercihleri
  FOR ALL TO authenticated
  USING      (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ── OKUMA: kendisi + koçu + velisi ──────────────────────────
-- Seçilen avatar öğrencinin koç listesinde ve veli panelinde de
-- görünsün diye. Yalnız kendine açık olsaydı öğrenci avatarını
-- seçer, koç baş harfleri görmeye devam ederdi — yarım bir özellik.
DROP POLICY IF EXISTS "Tercihi kocu ve velisi okur" ON kullanici_tercihleri;
CREATE POLICY "Tercihi kocu ve velisi okur" ON kullanici_tercihleri
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR ogrencim_mi(id) OR cocugum_mu(id) OR admin_mi());

GRANT SELECT, INSERT, UPDATE, DELETE ON kullanici_tercihleri TO authenticated;

-- updated_at'i sunucu yazsın: istemcinin gönderdiği saate güvenmek
-- "en son ne zaman değişti" sorusunu cevapsız bırakıyor.
CREATE OR REPLACE FUNCTION public.tercih_zamani()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tercih_zaman_damgasi ON kullanici_tercihleri;
CREATE TRIGGER tercih_zaman_damgasi
  BEFORE INSERT OR UPDATE ON kullanici_tercihleri
  FOR EACH ROW EXECUTE FUNCTION public.tercih_zamani();

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
--
-- ── SQL EDITOR RLS'İ BAYPAS EDER ────────────────────────────
-- Bu blok önce RLS'siz yazılmıştı ve "ogrenci kocun tercihini
-- yazabildi" diye patladı. Sebep politika değil, sınamanın kendisiydi:
-- SQL Editor sorguları TABLO SAHİBİ olarak çalıştırıyor ve tablo
-- sahibine satır güvenliği UYGULANMIYOR. Yani jwt'yi öğrenciye
-- çevirmek tek başına yetmiyor — politikalar hiç devreye girmiyordu.
--
-- Önceki migration'larda sınamaların geçmesi bunu gizlemişti: oradaki
-- korumalar RLS değil TETİKLEYİCİ, ve tetikleyici sahibe de işliyor.
--
-- Doğrusu: `SET LOCAL ROLE authenticated`. PostgREST gerçek isteklerde
-- zaten bu rolü kullanıyor, yani sınama artık üretimdeki yolu deniyor.
-- Temizlik rol geri alındıktan SONRA yapılıyor, yoksa silme işini de
-- RLS engeller.
DO $test$
DECLARE
  koc UUID; ogr UUID; red BOOLEAN; okunan INTEGER; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
    RETURN;
  END IF;

  SET LOCAL ROLE authenticated;

  -- a) ogrenci kendi tercihini yazabilir
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  INSERT INTO kullanici_tercihleri (id, tema, avatar) VALUES (ogr, 'gece', 'baykus')
    ON CONFLICT (id) DO UPDATE SET tema = 'gece', avatar = 'baykus';
  gecen := gecen + 1;

  -- b) ogrenci KOCUN tercihini yazamaz
  red := false;
  BEGIN
    INSERT INTO kullanici_tercihleri (id, tema) VALUES (koc, 'gul');
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: ogrenci kocun tercihini yazabildi'; END IF;
  gecen := gecen + 1;

  -- c) koc ogrencisinin tercihini OKUYABILIR (avatar her yerde gorunsun)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  SELECT count(*) INTO okunan FROM kullanici_tercihleri WHERE id = ogr;
  IF okunan <> 1 THEN RAISE EXCEPTION 'SINAMA c: koc ogrencisinin tercihini okuyamadi'; END IF;
  gecen := gecen + 1;

  -- d) koc ogrencinin tercihini DEGISTIREMEZ
  -- Yazma politikasi yalnizca kisinin kendisine aciyor; kocun UPDATE'i
  -- hic satir bulamiyor (okuma politikasi SELECT'e ozel).
  red := false;
  BEGIN
    UPDATE kullanici_tercihleri SET tema = 'gul' WHERE id = ogr;
    IF NOT FOUND THEN red := true; END IF;
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: koc ogrencinin temasini degistirebildi'; END IF;
  gecen := gecen + 1;

  -- e) yabanci bir kullanici ogrencinin tercihini OKUYAMAZ
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-0000-0000-000000000000')::text, true);
  SELECT count(*) INTO okunan FROM kullanici_tercihleri WHERE id = ogr;
  IF okunan <> 0 THEN RAISE EXCEPTION 'SINAMA e: yabanci kullanici tercihi okuyabildi'; END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM kullanici_tercihleri WHERE id IN (ogr, koc);

  RAISE NOTICE 'kullanici_tercihleri: % davranis sinamasi gecti.', gecen;
END $test$;
