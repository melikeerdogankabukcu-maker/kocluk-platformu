-- ============================================================
-- SORU BANKASINA ÖĞRENCİ DE KAYNAK EKLEYEBİLSİN
--
-- ── YAZMA TARAFI ZATEN AÇIKTI ───────────────────────────────────
-- "sahip_id = auth.uid()" politikası rolü sormuyor; öğrenci de kendi
-- kitabını ekleyebiliyordu. Eksik olan yalnızca politikanın ADI (koç
-- diyordu) ve arayüzdü.
--
-- ── ASIL EKSİK: KOÇ ÖĞRENCİSİNİN KİTABINI GÖREMİYORDU ───────────
-- Okuma kuralı kurumda_gorunur_mu() idi. O fonksiyonun öğrenci–koç
-- dalı tek yönlü: "koçum yazdıysa görürüm". Ters yön ("öğrencim
-- yazdıysa görürüm") yok — olması da gerekmiyordu, müfredatı öğrenci
-- yazmıyor. Öğrenci kitap ekleyince bu boşluk anlam kazandı: koç,
-- öğrencisinin elindeki kaynağı görmeden ondan ödev veremez.
--
-- ── kurumda_gorunur_mu DEĞİŞTİRİLMİYOR ──────────────────────────
-- O fonksiyon exam_topics ve study_programs politikalarında da
-- kullanılıyor. İçine "öğrencim yazdıysa" dalı eklemek, müfredat ve
-- program görünürlüğünü de sessizce değiştirirdi — istenmeyen bir yan
-- etki. Soru bankasına özel bir sarmalayıcı yazılıyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.banka_sahibi_gorunur_mu(p_sahip UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    -- Müfredattaki kural: sahibi, aynı kurum, onaylı koçum, yönetici
    kurumda_gorunur_mu(p_sahip)
    -- Koç: onaylı öğrencimin eklediği kaynak
    OR ogrencim_mi(p_sahip)
    -- Veli: çocuğumun eklediği kaynak
    OR EXISTS (
      SELECT 1 FROM family_links
      WHERE parent_id = auth.uid() AND student_id = p_sahip
    );
$$;

GRANT EXECUTE ON FUNCTION public.banka_sahibi_gorunur_mu(UUID) TO authenticated;

-- Bölüm görünürlüğü de aynı kurala bağlanıyor
CREATE OR REPLACE FUNCTION public.banka_gorunur_mu(p_banka UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM soru_bankalari b
    WHERE b.id = p_banka AND banka_sahibi_gorunur_mu(b.sahip_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.banka_gorunur_mu(UUID) TO authenticated;


-- ------------------------------------------------------------
-- Politikalar
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Soru bankasini kurum icinde okur" ON soru_bankalari;
CREATE POLICY "Soru bankasini gorenler okur" ON soru_bankalari
  FOR SELECT TO authenticated
  USING (banka_sahibi_gorunur_mu(sahip_id));

-- Yazma kuralı DEĞİŞMİYOR, yalnızca adı gerçeği söylüyor: herkes kendi
-- eklediği kaynağı yönetir. Öğrenci koçunun kitabına dokunamaz,
-- koç da öğrencinin eklediğini silemez — ekleyen kimse o yönetir.
DROP POLICY IF EXISTS "Koc kendi soru bankasini yonetir" ON soru_bankalari;
DROP POLICY IF EXISTS "Herkes kendi kaynagini yonetir" ON soru_bankalari;
CREATE POLICY "Herkes kendi kaynagini yonetir" ON soru_bankalari
  FOR ALL TO authenticated
  USING      (sahip_id = auth.uid() OR admin_mi())
  WITH CHECK (sahip_id = auth.uid() OR admin_mi());


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'soru_bankalari';
  IF n <> 2 THEN RAISE EXCEPTION 'soru_bankalari politika sayisi: % (2 bekleniyor)', n; END IF;

  SELECT count(*) INTO n FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('banka_sahibi_gorunur_mu', 'banka_gorunur_mu');
  IF n <> 2 THEN RAISE EXCEPTION 'fonksiyonlar eksik: % / 2', n; END IF;

  RAISE NOTICE 'soru_bankasi_ogrenci: gorunurluk genisletildi.';
END $$;
