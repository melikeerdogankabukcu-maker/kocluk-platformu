-- ============================================================
-- KAYNAK → ÖĞRENCİ TANIMI
--
-- ── DURUM ───────────────────────────────────────────────────────
-- Koçun eklediği her kaynak, koçun BÜTÜN öğrencilerine görünüyor ve
-- ödev önerisinde hepsi için aday sayılıyordu. Oysa kitap fiziksel bir
-- nesne: öğrencinin elinde olmayan kitaptan ödev vermek anlamsız.
--
-- ── BOŞ LİSTE = TÜM ÖĞRENCİLER ──────────────────────────────────
-- Tanımlama yapılmamış bir kaynak, eskisi gibi koçun tüm öğrencilerine
-- açık kalıyor. Aksi hâlde bu migration çalıştığı anda mevcut dört
-- kaynak hiçbir öğrenciye görünmez olur ve öneri motoru boşa düşerdi.
-- Koç bir kaynağa öğrenci tanımladığı anda kural daralıyor: yalnızca
-- o öğrenciler.
--
-- ── DARALMA YALNIZCA ÖĞRENCİ VE VELİDE ──────────────────────────
-- Koçlar ve yöneticiler kaynakların hepsini görmeye devam ediyor;
-- kısıt "hangi öğrenci hangi kitabı kullanıyor" sorusuyla ilgili,
-- personelin kütüphaneyi görmesiyle değil.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS soru_bankasi_atamalari (
  banka_id   UUID        NOT NULL REFERENCES soru_bankalari(id) ON DELETE CASCADE,
  student_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (banka_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_banka_atama_ogrenci
  ON soru_bankasi_atamalari (student_id);

ALTER TABLE soru_bankasi_atamalari ENABLE ROW LEVEL SECURITY;

-- Kaynağın sahibi tanımlamayı yönetir.
DROP POLICY IF EXISTS "Kaynak sahibi atamayi yonetir" ON soru_bankasi_atamalari;
CREATE POLICY "Kaynak sahibi atamayi yonetir" ON soru_bankasi_atamalari
  FOR ALL TO authenticated
  USING      (public.bankanin_sahibi_miyim(banka_id))
  WITH CHECK (public.bankanin_sahibi_miyim(banka_id));

-- Öğrenci kendi tanımlarını, veli çocuğununkini okur.
DROP POLICY IF EXISTS "Ogrenci ve veli atamayi okur" ON soru_bankasi_atamalari;
CREATE POLICY "Ogrenci ve veli atamayi okur" ON soru_bankasi_atamalari
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.family_links fl
               WHERE fl.parent_id = auth.uid() AND fl.student_id = soru_bankasi_atamalari.student_id)
  );


-- ------------------------------------------------------------
-- Bir kaynak bir öğrenciye açık mı?
-- Tanımlama yoksa herkese, varsa yalnızca tanımlananlara.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.banka_ogrenciye_acik_mi(p_banka UUID, p_ogrenci UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM soru_bankasi_atamalari WHERE banka_id = p_banka)
      OR EXISTS (SELECT 1 FROM soru_bankasi_atamalari
                 WHERE banka_id = p_banka AND student_id = p_ogrenci);
$$;

GRANT EXECUTE ON FUNCTION public.banka_ogrenciye_acik_mi(UUID, UUID) TO authenticated;


-- ------------------------------------------------------------
-- Okuma politikaları daraltılıyor
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Soru bankasini gorenler okur" ON soru_bankalari;
CREATE POLICY "Soru bankasini gorenler okur" ON soru_bankalari
  FOR SELECT TO authenticated
  USING (
    banka_sahibi_gorunur_mu(sahip_id)
    AND (
      -- Sahibi ve yönetici her zaman
      sahip_id = auth.uid()
      OR admin_mi()
      -- Personel (koç) kütüphanenin tamamını görür
      OR EXISTS (SELECT 1 FROM users u
                 WHERE u.id = auth.uid() AND u.role IN ('teacher', 'admin'))
      -- Öğrenci: yalnızca kendine tanımlıysa
      OR banka_ogrenciye_acik_mi(id, auth.uid())
      -- Veli: çocuğuna tanımlıysa
      OR EXISTS (SELECT 1 FROM family_links fl
                 WHERE fl.parent_id = auth.uid()
                   AND banka_ogrenciye_acik_mi(soru_bankalari.id, fl.student_id))
    )
  );

-- Bölümler kitabın görünürlüğünü izliyor; banka_gorunur_mu zaten
-- soru_bankalari'na bakıyor ve o tablonun RLS'i yukarıda daraldı.
-- Ek bir değişiklik gerekmiyor.


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables
                 WHERE schemaname='public' AND tablename='soru_bankasi_atamalari')
  THEN RAISE EXCEPTION 'soru_bankasi_atamalari olusmadi'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='soru_bankasi_atamalari';
  IF n <> 2 THEN RAISE EXCEPTION 'atama politika sayisi: % (2 bekleniyor)', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='soru_bankalari';
  IF n <> 2 THEN RAISE EXCEPTION 'soru_bankalari politika sayisi: % (2 bekleniyor)', n; END IF;

  -- Tanımlama yokken kaynak herkese açık kalmalı; aksi hâlde mevcut
  -- dört kaynak bu migration'la birlikte görünmez olurdu.
  IF EXISTS (SELECT 1 FROM soru_bankalari b
             WHERE NOT banka_ogrenciye_acik_mi(b.id, gen_random_uuid()))
  THEN RAISE EXCEPTION 'tanimlamasiz kaynak herkese acik degil'; END IF;

  RAISE NOTICE 'soru_bankasi_atamalari hazir; tanimlamasiz kaynaklar herkese acik.';
END $$;
