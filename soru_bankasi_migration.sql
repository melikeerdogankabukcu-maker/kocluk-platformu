-- ============================================================
-- SORU BANKASI KİTAPLIĞI
--
-- Koç bir kitabın İÇİNDEKİLER sayfasını sisteme aktarıyor; kitap
-- bölümlere ayrılıyor, her bölüm müfredattaki bir konuya bağlanıyor.
-- Ödev önerisi bu bağdan üretilecek: "zayıf olduğu konu şu, o konu şu
-- kitabın şu sayfalarında".
--
-- ── SAHİPLİK: YENİ FONKSİYON YOK ────────────────────────────────
-- Görünürlük kuralı müfredatınkiyle birebir aynı: sahibi görür, aynı
-- kurumdakiler görür, öğrenci onaylı koçunun kitabını görür (kendi
-- ödevinin kaynağı), veli çocuğunun koçununkini görür, yönetici hepsini.
-- Bu mantık zaten kurumda_gorunur_mu() içinde duruyor ve doğru
-- yetkilendirilmiş durumda. İkinci bir kopyasını yazmak, ileride kural
-- değişince birinin güncellenip diğerinin unutulması demekti.
--
-- ── BÖLÜMLER İÇİN AYRI YARDIMCI ─────────────────────────────────
-- Bölüm politikası kitabın sahibine bakmak zorunda. Politikanın içinden
-- doğrudan soru_bankalari'na SELECT atsaydık o sorgu da kendi RLS'ine
-- takılır, her satır için iç içe bir politika değerlendirmesi olurdu.
-- SECURITY DEFINER bir yardımcı bunu tek adıma indiriyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. Kitaplar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soru_bankalari (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Kitabı ekleyen koç. NULL DEĞİL: müfredattaki gibi "gömülü/ortak"
  -- bir soru bankası kavramı yok, her kitabı bir koç ekliyor.
  sahip_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad          TEXT        NOT NULL,
  yayinevi    TEXT,
  sinav_turu  TEXT,                    -- 'TYT' | 'AYT' | 'LGS' ...
  ders        TEXT,                    -- 'Matematik'
  aciklama    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soru_bankalari_sahip ON soru_bankalari (sahip_id);

-- Aynı koç aynı kitabı iki kez eklemesin. Ders de anahtara giriyor:
-- bir yayınevinin aynı adlı kitabı farklı derslerde olabiliyor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_soru_bankalari_tekil
  ON soru_bankalari (sahip_id, lower(ad), coalesce(lower(ders), ''));


-- ------------------------------------------------------------
-- 2. Bölümler (içindekilerden çıkan satırlar)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS soru_bankasi_bolumleri (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  banka_id    UUID        NOT NULL REFERENCES soru_bankalari(id) ON DELETE CASCADE,
  sira        INTEGER     NOT NULL,
  -- Kitapta yazdığı hâli. Müfredat karşılığıyla aynı olmak zorunda
  -- değil: "Bölme–Bölünebilme" ile "Bölme ve Bölünebilme" aynı konu.
  baslik      TEXT        NOT NULL,
  -- Müfredattaki karşılığı. NULL = eşleşmedi; koç elle bağlayabilir.
  -- Eşleşmeyen bölüm silinmiyor, sayfa bilgisi yine de işe yarıyor.
  konu        TEXT,
  sayfa_bas   INTEGER,
  sayfa_son   INTEGER,
  -- İçindekiler sayfası soru sayısı VERMEZ. Koç girerse dolu, yoksa
  -- NULL kalıyor ve ödev sayfa aralığıyla veriliyor. Sayfadan soru
  -- sayısı tahmin edip kesin sayı gibi göstermek yanlış olurdu.
  soru_sayisi INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bolum_banka ON soru_bankasi_bolumleri (banka_id, sira);
-- Konudan bölüme gitmek öneri motorunun asıl sorgusu
CREATE INDEX IF NOT EXISTS idx_bolum_konu  ON soru_bankasi_bolumleri (konu)
  WHERE konu IS NOT NULL;

ALTER TABLE soru_bankasi_bolumleri
  DROP CONSTRAINT IF EXISTS bolum_sayfa_sirali;
ALTER TABLE soru_bankasi_bolumleri
  ADD CONSTRAINT bolum_sayfa_sirali
  CHECK (sayfa_bas IS NULL OR sayfa_son IS NULL OR sayfa_son >= sayfa_bas);

ALTER TABLE soru_bankasi_bolumleri
  DROP CONSTRAINT IF EXISTS bolum_soru_pozitif;
ALTER TABLE soru_bankasi_bolumleri
  ADD CONSTRAINT bolum_soru_pozitif
  CHECK (soru_sayisi IS NULL OR soru_sayisi > 0);


-- ------------------------------------------------------------
-- 3. Görünürlük yardımcısı (bölümler için)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.banka_gorunur_mu(p_banka UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM soru_bankalari b
    WHERE b.id = p_banka AND kurumda_gorunur_mu(b.sahip_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.bankanin_sahibi_miyim(p_banka UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM soru_bankalari b
    WHERE b.id = p_banka AND (b.sahip_id = auth.uid() OR admin_mi())
  );
$$;

-- Politika içinden çağrılıyorlar. Aşağıdaki politikaların hepsi
-- "TO authenticated" olduğu için yetkiyi authenticated'e vermek yeterli;
-- PUBLIC'ten ayrıca almıyoruz (kurumda_gorunur_mu ile aynı gerekçe:
-- politikası PUBLIC'e açık bir rol için EXECUTE yoksa sorgu boş sonuç
-- yerine HATA döner).
GRANT EXECUTE ON FUNCTION public.banka_gorunur_mu(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.bankanin_sahibi_miyim(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE soru_bankalari          ENABLE ROW LEVEL SECURITY;
ALTER TABLE soru_bankasi_bolumleri  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Soru bankasini kurum icinde okur" ON soru_bankalari;
CREATE POLICY "Soru bankasini kurum icinde okur" ON soru_bankalari
  FOR SELECT TO authenticated
  USING (kurumda_gorunur_mu(sahip_id));

-- Yazma yalnızca sahibinde. Öğrenci ve veli okuyor ama kitaba
-- dokunamıyor: kitaplık koçun ders malzemesi.
DROP POLICY IF EXISTS "Koc kendi soru bankasini yonetir" ON soru_bankalari;
CREATE POLICY "Koc kendi soru bankasini yonetir" ON soru_bankalari
  FOR ALL TO authenticated
  USING      (sahip_id = auth.uid() OR admin_mi())
  WITH CHECK (sahip_id = auth.uid() OR admin_mi());

DROP POLICY IF EXISTS "Bolumleri kurum icinde okur" ON soru_bankasi_bolumleri;
CREATE POLICY "Bolumleri kurum icinde okur" ON soru_bankasi_bolumleri
  FOR SELECT TO authenticated
  USING (banka_gorunur_mu(banka_id));

DROP POLICY IF EXISTS "Koc kendi bolumlerini yonetir" ON soru_bankasi_bolumleri;
CREATE POLICY "Koc kendi bolumlerini yonetir" ON soru_bankasi_bolumleri
  FOR ALL TO authenticated
  USING      (bankanin_sahibi_miyim(banka_id))
  WITH CHECK (bankanin_sahibi_miyim(banka_id));


-- updated_at tetikleyicisi — update_updated_at() student_profiles
-- migration'ında tanımlanmıştı, yeniden yazılmıyor.
DROP TRIGGER IF EXISTS trg_soru_bankalari_updated_at ON soru_bankalari;
CREATE TRIGGER trg_soru_bankalari_updated_at
  BEFORE UPDATE ON soru_bankalari
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ------------------------------------------------------------
-- 5. Kendi kendini sınayan doğrulama
--
-- Supabase SQL Editor her şeyi TEK İŞLEMDE çalıştırıyor: buradaki bir
-- hata tüm migration'ı geri alır. Yarım kurulmuş bir şema bırakmaktan
-- iyi.
-- ------------------------------------------------------------
DO $$
DECLARE
  n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('soru_bankalari', 'soru_bankasi_bolumleri');
  IF n <> 2 THEN RAISE EXCEPTION 'tablolar eksik: % / 2', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('soru_bankalari', 'soru_bankasi_bolumleri');
  IF n <> 4 THEN RAISE EXCEPTION 'politikalar eksik: % / 4', n; END IF;

  -- RLS gerçekten açık mı: kapalı kalırsa tablolar herkese açık olurdu
  SELECT count(*) INTO n FROM pg_class
   WHERE relname IN ('soru_bankalari', 'soru_bankasi_bolumleri')
     AND relrowsecurity;
  IF n <> 2 THEN RAISE EXCEPTION 'RLS acik degil: % / 2', n; END IF;

  RAISE NOTICE 'soru_bankasi: 2 tablo, 4 politika, RLS acik.';
END $$;
