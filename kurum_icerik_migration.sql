-- ============================================================
-- Migration: kurum içi içerik paylaşımı (seçmeli)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ÖNCE envanter_migration, koc_envanteri_migration,
-- kitap_okuma_migration çalışmış olmalı.
-- ============================================================
--
-- Karar: koç her envanteri / kitabı / soru bankasını oluştururken
-- "kuruma açık" işaretleyebiliyor. Kendiliğinden paylaşım değil,
-- seçmeli.
--
-- ── SORU BANKASINDA DİKKAT ──────────────────────────────────
-- Soru bankaları bugün kurum içinde KENDİLİĞİNDEN paylaşılıyor
-- (`kurumda_gorunur_mu`). Seçmeli yapmak, var olan kitaplıkları
-- meslektaşlardan gizlerdi — bugün görülen bir şey kaybolmamalı.
-- Bu yüzden kolon VAR OLAN SATIRLAR İÇİN true olarak ekleniyor;
-- yalnız bundan sonra açılanlar varsayılan olarak kapalı.
--
-- Envanter ve okuma kitabı bugün koça özel, onlarda varsayılan
-- false: kimsenin beklentisi değişmiyor.
--
-- `kurumda_gorunur_mu()` fonksiyonuna DOKUNULMUYOR: müfredat ve
-- hazır programlar da onu kullanıyor.

-- ------------------------------------------------------------
-- Yardımcı: bu içerik bana kurum üzerinden açık mı
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kurumda_paylasildi_mi(p_sahip UUID, p_acik BOOLEAN)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT COALESCE(p_acik, false)
     AND p_sahip IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM users ben, users sahip
        WHERE ben.id = auth.uid()
          AND sahip.id = p_sahip
          AND ben.kurum_id IS NOT NULL
          AND ben.kurum_id = sahip.kurum_id
     );
$fn$;

REVOKE ALL ON FUNCTION public.kurumda_paylasildi_mi(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kurumda_paylasildi_mi(UUID, BOOLEAN) TO authenticated;

-- ------------------------------------------------------------
-- 1) Koç envanteri
-- ------------------------------------------------------------
ALTER TABLE koc_envanterleri
  ADD COLUMN IF NOT EXISTS kuruma_acik BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Koc envanterini kurum okur" ON koc_envanterleri;
CREATE POLICY "Koc envanterini kurum okur" ON koc_envanterleri
  FOR SELECT TO authenticated
  USING (kurumda_paylasildi_mi(sahip_id, kuruma_acik));

-- Öğrenci, KOÇUNUN kuruma açtığı envanteri de görmeli: envanteri
-- meslektaşı yazmış olsa bile koçu ona atayabiliyor.
DROP POLICY IF EXISTS "Kurum envanterini ogrenci okur" ON koc_envanterleri;
CREATE POLICY "Kurum envanterini ogrenci okur" ON koc_envanterleri
  FOR SELECT TO authenticated
  USING (
    kuruma_acik
    AND EXISTS (
      SELECT 1 FROM teacher_students ts
      JOIN users kocum  ON kocum.id = ts.teacher_id
      JOIN users yazan  ON yazan.id = koc_envanterleri.sahip_id
       WHERE ts.student_id = auth.uid()
         AND ts.durum = 'onaylandi'
         AND kocum.kurum_id IS NOT NULL
         AND kocum.kurum_id = yazan.kurum_id
    )
  );

-- ------------------------------------------------------------
-- 2) Okuma kitabı
-- ------------------------------------------------------------
ALTER TABLE okuma_kitaplari
  ADD COLUMN IF NOT EXISTS kuruma_acik BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Kitabi kurum okur" ON okuma_kitaplari;
CREATE POLICY "Kitabi kurum okur" ON okuma_kitaplari
  FOR SELECT TO authenticated
  USING (kurumda_paylasildi_mi(sahip_id, kuruma_acik));

-- Kapak fotoğrafı da açılmalı, yoksa paylaşılan kitap meslektaşta
-- kapaksız görünür. Depo politikası `okuma_kitabi_gorebilir_miyim`
-- üzerinden çalışıyor; kurum koşulu oraya ekleniyor.
CREATE OR REPLACE FUNCTION public.okuma_kitabi_gorebilir_miyim(p_kitap UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM okuma_kitaplari k
     WHERE k.id = p_kitap
       AND (k.sahip_id = auth.uid()
            OR admin_mi()
            OR kurumda_paylasildi_mi(k.sahip_id, k.kuruma_acik))
  ) OR EXISTS (
    SELECT 1 FROM okuma_atamalari a
     WHERE a.kitap_id = p_kitap
       AND (a.student_id = auth.uid()
            OR ogrencim_mi(a.student_id)
            OR cocugum_mu(a.student_id))
  );
$fn$;

-- ------------------------------------------------------------
-- 3) Soru bankası — VAR OLANLAR AÇIK KALIYOR
-- ------------------------------------------------------------
-- Kolon eklenirken varsayılan false; hemen ardından var olan bütün
-- satırlar true yapılıyor. Böylece bugün görülen hiçbir kitaplık
-- kaybolmuyor, yeni açılanlar ise kapalı başlıyor.
DO $$
DECLARE yeni_kolon BOOLEAN;
BEGIN
  yeni_kolon := NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'soru_bankalari'
       AND column_name = 'kuruma_acik');

  ALTER TABLE soru_bankalari
    ADD COLUMN IF NOT EXISTS kuruma_acik BOOLEAN NOT NULL DEFAULT false;

  IF yeni_kolon THEN
    UPDATE soru_bankalari SET kuruma_acik = true;
  END IF;
END $$;

-- Eski politika kurumdaki HERKESE açıyordu; yerine seçmeli olan
-- geliyor. Sahibin kendi erişimi ayrı politikada (bankanin_sahibi_miyim).
DROP POLICY IF EXISTS "Soru bankasini kurum icinde okur" ON soru_bankalari;
CREATE POLICY "Soru bankasini kurum icinde okur" ON soru_bankalari
  FOR SELECT TO authenticated
  USING (sahip_id = auth.uid()
         OR admin_mi()
         OR kurumda_paylasildi_mi(sahip_id, kuruma_acik));

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; meslektas UUID; kurum UUID; env UUID; kitap UUID;
  sayi INTEGER; yeni UUID; yonetici UUID; gecen INTEGER := 0;
  eski_k UUID; eski_m UUID;
  ornek JSONB := '{"sorular":[{"kod":"s1","metin":"soru bir","tur":"siklik","boyut":"a","ters":false}],"boyutlar":{"a":"A"}}'::jsonb;
BEGIN
  SELECT u.id INTO koc FROM users u WHERE u.role IN ('teacher','admin') LIMIT 1;
  SELECT u.id INTO meslektas FROM users u
   WHERE u.role IN ('teacher','admin') AND u.id <> koc LIMIT 1;
  IF koc IS NULL OR meslektas IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - iki ogretmen gerekiyor');
    RETURN;
  END IF;

  SELECT kurum_id INTO eski_k FROM users WHERE id = koc;
  SELECT kurum_id INTO eski_m FROM users WHERE id = meslektas;

  -- Kurum değişiklikleri PLATFORM YÖNETİCİSİ kimliğiyle yapılıyor:
  -- users_rol_koru tablo sahibine de işliyor ve SQL Editor'da
  -- auth.uid() boş olduğu için düz UPDATE reddediliyor.
  SELECT u.id INTO yonetici FROM users u WHERE u.role = 'admin' LIMIT 1;
  IF yonetici IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - platform yoneticisi yok');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);

  INSERT INTO kurumlar (ad, tur) VALUES ('__SINAMA_ICERIK__', 'okul') RETURNING id INTO kurum;
  UPDATE users SET kurum_id = kurum WHERE id IN (koc, meslektas);

  INSERT INTO koc_envanterleri (sahip_id, ad, tanim)
  VALUES (koc, '__SINAMA_ENV__', ornek) RETURNING id INTO env;
  INSERT INTO okuma_kitaplari (sahip_id, ad) VALUES (koc, '__SINAMA_KITAP__')
  RETURNING id INTO kitap;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', meslektas)::text, true);

  -- a) KAPALIYKEN meslektas goremiyor
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA a: kapali envanter meslektasa gorundu'; END IF;
  SELECT count(*) INTO sayi FROM okuma_kitaplari WHERE id = kitap;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA a2: kapali kitap meslektasa gorundu'; END IF;
  gecen := gecen + 1;

  -- b) ACILINCA goruyor
  RESET ROLE;
  UPDATE koc_envanterleri SET kuruma_acik = true WHERE id = env;
  UPDATE okuma_kitaplari  SET kuruma_acik = true WHERE id = kitap;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', meslektas)::text, true);

  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA b: acik envanter gorunmedi'; END IF;
  SELECT count(*) INTO sayi FROM okuma_kitaplari WHERE id = kitap;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA b2: acik kitap gorunmedi'; END IF;
  gecen := gecen + 1;

  -- c) kapak da aciliyor
  IF NOT okuma_kitabi_gorebilir_miyim(kitap) THEN
    RAISE EXCEPTION 'SINAMA c: paylasilan kitabin kapagi acilmadi';
  END IF;
  gecen := gecen + 1;

  -- d) BASKA kurumdaki goremiyor
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  UPDATE users SET kurum_id = NULL WHERE id = meslektas;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', meslektas)::text, true);
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA d: kurum disindaki gordu'; END IF;
  gecen := gecen + 1;

  -- e) sahibi her halukarda goruyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  SELECT count(*) INTO sayi FROM koc_envanterleri WHERE id = env;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA e: sahibi kendi envanterini goremedi'; END IF;
  gecen := gecen + 1;

  -- f) Yeni acilan banka KAPALI basliyor (goc var olanlari actı,
  --    bundan sonrasi secmeli)
  RESET ROLE;
  INSERT INTO soru_bankalari (sahip_id, ad) VALUES (koc, '__SINAMA_BANKA__')
  RETURNING id INTO yeni;
  IF (SELECT kuruma_acik FROM soru_bankalari WHERE id = yeni) THEN
    RAISE EXCEPTION 'SINAMA f: yeni banka acik baslamamali';
  END IF;
  DELETE FROM soru_bankalari WHERE id = yeni;
  gecen := gecen + 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', yonetici)::text, true);
  DELETE FROM koc_envanterleri WHERE id = env;
  DELETE FROM okuma_kitaplari  WHERE id = kitap;
  UPDATE users SET kurum_id = eski_k WHERE id = koc;
  UPDATE users SET kurum_id = eski_m WHERE id = meslektas;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM kurumlar WHERE id = kurum;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "kurum_icerik" FROM _sinama_sonucu;
