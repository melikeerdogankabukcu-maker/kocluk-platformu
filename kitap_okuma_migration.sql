-- ============================================================
-- Migration: kitap okuma modülü (kitaplar + atamalar + kapak izni)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- public şema + storage.objects politikaları.
-- ============================================================
--
-- Akış OKUMA_VE_ENVANTER.md'de yazılı ve onaylandı.
--
-- ── KİTAP AYRI, ATAMA AYRI ──────────────────────────────────
-- Bir kitap on öğrenciye atanabiliyor. Atama başına kapak yüklenseydi
-- aynı fotoğraf on kez depoya giderdi. Kitap bir kez tanımlanıyor,
-- atamalar ona bağlanıyor.
--
-- ── "GECİKTİ" SAKLANMIYOR, HESAPLANIYOR ─────────────────────
-- Durum yalnız 'devam' | 'bitti'. Gecikme = başlangıç + gün sayısı
-- < bugün, yani her bakışta yeniden çıkıyor. Saklansaydı her gece
-- satırları güncelleyen bir işe ihtiyaç olurdu ve o iş çalışmadığı
-- gün ekran yanlış gösterirdi.
--
-- ── SÜRE BİTİNCE ATAMA KAYBOLMUYOR ──────────────────────────
-- Kendiliğinden "başarısız" olmuyor; listede kalıyor, koç gün
-- ekleyebiliyor. Okuma sürekliliği olan bir iş, bir günlük gecikmeyi
-- başarısızlık saymak öğrenciyi bırakmaya iter.

-- ------------------------------------------------------------
-- 1) Kitap
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS okuma_kitaplari (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sahip_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad           TEXT        NOT NULL,
  yazar        TEXT,
  -- Boş bırakılabiliyor: bilinmiyorsa modül yine çalışıyor, yalnız
  -- sayfa ilerlemesi yerine "bitirdim" işareti kalıyor.
  toplam_sayfa INTEGER,
  -- Depo yolu (`kitaplar/<kitap_id>/...`). Kova kapalı; okuyan taraf
  -- imzalı adrese çeviriyor.
  kapak_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kitap_sayfa_makul CHECK (toplam_sayfa IS NULL OR toplam_sayfa BETWEEN 1 AND 20000)
);

CREATE INDEX IF NOT EXISTS idx_okuma_kitap_sahip ON okuma_kitaplari (sahip_id, created_at DESC);

-- ------------------------------------------------------------
-- 2) Atama
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS okuma_atamalari (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kitap_id     UUID        NOT NULL REFERENCES okuma_kitaplari(id) ON DELETE CASCADE,
  student_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  atayan_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  gun_sayisi   INTEGER     NOT NULL,
  baslangic    DATE        NOT NULL DEFAULT CURRENT_DATE,
  okunan_sayfa INTEGER     NOT NULL DEFAULT 0,
  durum        TEXT        NOT NULL DEFAULT 'devam',
  bitirme_tarihi TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT okuma_durum      CHECK (durum IN ('devam', 'bitti')),
  CONSTRAINT okuma_gun_makul  CHECK (gun_sayisi BETWEEN 1 AND 365),
  CONSTRAINT okuma_sayfa_pozitif CHECK (okunan_sayfa >= 0),
  -- Aynı kitap aynı öğrenciye iki kez atanmasın; tekrar okutulacaksa
  -- süresi uzatılıyor.
  CONSTRAINT okuma_kitap_ogrenci UNIQUE (kitap_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_okuma_atama_ogrenci
  ON okuma_atamalari (student_id, durum, baslangic DESC);

-- ------------------------------------------------------------
-- 3) Yardımcı: bu kitabın bir ataması bana açık mı
-- ------------------------------------------------------------
-- Hem tablo politikaları hem depo politikası aynı soruyu soruyor;
-- tek yerde duruyor ki ikisi ayrışmasın.
CREATE OR REPLACE FUNCTION public.okuma_kitabi_gorebilir_miyim(p_kitap UUID)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM okuma_kitaplari k
     WHERE k.id = p_kitap AND (k.sahip_id = auth.uid() OR admin_mi())
  ) OR EXISTS (
    SELECT 1 FROM okuma_atamalari a
     WHERE a.kitap_id = p_kitap
       AND (a.student_id = auth.uid()
            OR ogrencim_mi(a.student_id)
            OR cocugum_mu(a.student_id))
  );
$fn$;

REVOKE ALL ON FUNCTION public.okuma_kitabi_gorebilir_miyim(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.okuma_kitabi_gorebilir_miyim(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------
ALTER TABLE okuma_kitaplari  ENABLE ROW LEVEL SECURITY;
ALTER TABLE okuma_atamalari  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kitabi sahibi yonetir" ON okuma_kitaplari;
CREATE POLICY "Kitabi sahibi yonetir" ON okuma_kitaplari
  FOR ALL TO authenticated
  USING      (sahip_id = auth.uid() OR admin_mi())
  WITH CHECK (sahip_id = auth.uid() OR admin_mi());

-- Kitabı, ataması olan öğrenci ve velisi OKUYOR (yazmıyor).
DROP POLICY IF EXISTS "Kitabi atanan okur" ON okuma_kitaplari;
CREATE POLICY "Kitabi atanan okur" ON okuma_kitaplari
  FOR SELECT TO authenticated
  USING (okuma_kitabi_gorebilir_miyim(id));

DROP POLICY IF EXISTS "Atamayi kocu yonetir" ON okuma_atamalari;
CREATE POLICY "Atamayi kocu yonetir" ON okuma_atamalari
  FOR ALL TO authenticated
  USING      (ogrencim_mi(student_id) OR admin_mi())
  WITH CHECK (ogrencim_mi(student_id) OR admin_mi());

DROP POLICY IF EXISTS "Atamayi ogrenci okur" ON okuma_atamalari;
CREATE POLICY "Atamayi ogrenci okur" ON okuma_atamalari
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR cocugum_mu(student_id));

-- Öğrenci ilerlemesini kendisi yazıyor. Hangi alanları
-- değiştirebildiğini tetikleyici denetliyor (RLS kolon ayıramıyor).
DROP POLICY IF EXISTS "Ilerlemeyi ogrenci yazar" ON okuma_atamalari;
CREATE POLICY "Ilerlemeyi ogrenci yazar" ON okuma_atamalari
  FOR UPDATE TO authenticated
  USING      (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON okuma_kitaplari TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON okuma_atamalari TO authenticated, service_role;

-- ------------------------------------------------------------
-- 5) Öğrenci YALNIZ ilerlemesini değiştirebiliyor
-- ------------------------------------------------------------
-- Süreyi ya da kitabı değiştirebilseydi "20 günde bitir" bir anlam
-- taşımazdı: öğrenci günü 365 yapıp hep zamanında görünürdü.
CREATE OR REPLACE FUNCTION public.okuma_atamasini_koru()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE kocu_mu BOOLEAN;
BEGIN
  NEW.updated_at := now();
  kocu_mu := ogrencim_mi(NEW.student_id) OR admin_mi();

  IF NOT kocu_mu THEN
    IF NEW.kitap_id   IS DISTINCT FROM OLD.kitap_id
    OR NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.gun_sayisi IS DISTINCT FROM OLD.gun_sayisi
    OR NEW.baslangic  IS DISTINCT FROM OLD.baslangic
    OR NEW.atayan_id  IS DISTINCT FROM OLD.atayan_id THEN
      RAISE EXCEPTION 'Atamanin suresini yalniz koc degistirebilir.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bitirme anı sunucuda damgalanıyor; öğrencinin yazdığı tarihe
  -- güvenilmiyor.
  IF NEW.durum = 'bitti' AND OLD.durum <> 'bitti' THEN
    NEW.bitirme_tarihi := now();
  ELSIF NEW.durum = 'devam' THEN
    NEW.bitirme_tarihi := NULL;
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS okuma_atama_kilidi ON okuma_atamalari;
CREATE TRIGGER okuma_atama_kilidi
  BEFORE UPDATE ON okuma_atamalari
  FOR EACH ROW EXECUTE FUNCTION okuma_atamasini_koru();

NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; ogr UUID; kitap UUID; atama UUID; yabanci UUID;
  sayi INTEGER; red BOOLEAN; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - onayli koc-ogrenci cifti yok');
    RETURN;
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);

  -- a) koc kitap tanimlayip atiyor
  INSERT INTO okuma_kitaplari (sahip_id, ad, yazar, toplam_sayfa)
  VALUES (koc, '__SINAMA_KITAP__', 'Sinama', 200) RETURNING id INTO kitap;
  INSERT INTO okuma_atamalari (kitap_id, student_id, atayan_id, gun_sayisi)
  VALUES (kitap, ogr, koc, 20) RETURNING id INTO atama;
  gecen := gecen + 1;

  -- b) ogrenci kitabi GOREBILIYOR (atamasi var)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  SELECT count(*) INTO sayi FROM okuma_kitaplari WHERE id = kitap;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA b: ogrenci atanan kitabi goremedi'; END IF;
  gecen := gecen + 1;

  -- c) ogrenci ilerlemesini yazabiliyor
  UPDATE okuma_atamalari SET okunan_sayfa = 40 WHERE id = atama;
  gecen := gecen + 1;

  -- d) ogrenci SUREYI degistiremiyor
  red := false;
  BEGIN
    UPDATE okuma_atamalari SET gun_sayisi = 365 WHERE id = atama;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: ogrenci sureyi uzatabildi'; END IF;
  gecen := gecen + 1;

  -- e) bitirme damgasi SUNUCUDA dusuyor
  UPDATE okuma_atamalari SET durum = 'bitti' WHERE id = atama;
  SELECT count(*) INTO sayi FROM okuma_atamalari
   WHERE id = atama AND bitirme_tarihi IS NOT NULL;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA e: bitirme tarihi damgalanmadi'; END IF;
  gecen := gecen + 1;

  -- f) ILGISIZ ogrenci ne kitabi ne atamayi goruyor
  RESET ROLE;
  SELECT u.id INTO yabanci FROM users u
   WHERE u.role = 'student' AND u.id <> ogr LIMIT 1;
  IF yabanci IS NOT NULL THEN
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', yabanci)::text, true);
    SELECT count(*) INTO sayi FROM okuma_kitaplari WHERE id = kitap;
    IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA f: ilgisiz ogrenci kitabi gordu'; END IF;
    SELECT count(*) INTO sayi FROM okuma_atamalari WHERE id = atama;
    IF sayi <> 0 THEN RAISE EXCEPTION 'SINAMA f2: ilgisiz ogrenci atamayi gordu'; END IF;
    gecen := gecen + 1;
  END IF;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM okuma_kitaplari WHERE id = kitap;   -- atama cascade ile gidiyor

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "kitap_okuma" FROM _sinama_sonucu;
