-- ============================================================
-- ÖNERİ KARARLARI
--
-- ── EKSİK OLAN ──────────────────────────────────────────────────
-- Ödev önerisi her seferinde sıfırdan üretiliyordu. Koçun KABUL
-- ettiği öneri görev olarak açıldığı için bir daha çıkmıyor (motor
-- açık görevi görüyor). Ama REDDETTİĞİ öneri hiçbir yere yazılmıyor
-- ve bir sonraki üretimde aynı sırayla yeniden geliyordu. Koç aynı
-- şeyi her hafta yeniden elemek zorunda kalıyordu.
--
-- ── RED SONSUZA KADAR DEĞİL ─────────────────────────────────────
-- Reddedilen öneri kalıcı olarak silinmiyor, BEKLEMEYE alınıyor.
-- "Bu konuyu şimdi vermeyeceğim" ile "bu konuyu asla vermeyeceğim"
-- aynı şey değil; öğrencinin durumu iki ay sonra değişmiş olabilir.
-- Bekleme süresi istemcide (odevOnerisi.js) tanımlı.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS oneri_kararlari (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bolum_id    UUID        NOT NULL REFERENCES soru_bankasi_bolumleri(id) ON DELETE CASCADE,
  -- 'kabul' = görev olarak atandı, 'red' = koç bu öneriyi eledi
  karar       TEXT        NOT NULL CHECK (karar IN ('kabul', 'red')),
  karar_veren UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Aynı öğrenci + bölüm için tek karar: sonuncusu geçerli (upsert).
  -- Tarihçe tutulsaydı "en son ne dedim" sorgusu her üretimde
  -- pencereleme gerektirirdi; karar bir durum, günlük değil.
  UNIQUE (student_id, bolum_id)
);

CREATE INDEX IF NOT EXISTS idx_oneri_karari_ogrenci
  ON oneri_kararlari (student_id, karar);

ALTER TABLE oneri_kararlari ENABLE ROW LEVEL SECURITY;

-- Koç yalnızca KENDİ onaylı öğrencisinin kararlarını görür ve yazar.
-- ogrencim_mi() zaten SECURITY DEFINER ve authenticated'e yetkili.
DROP POLICY IF EXISTS "Koc kendi ogrencisinin kararlarini yonetir" ON oneri_kararlari;
CREATE POLICY "Koc kendi ogrencisinin kararlarini yonetir" ON oneri_kararlari
  FOR ALL TO authenticated
  USING      (public.ogrencim_mi(student_id) OR public.admin_mi())
  WITH CHECK (public.ogrencim_mi(student_id) OR public.admin_mi());

-- Öğrenci kendi kararlarını OKUYABİLİR ama yazamaz: neyin neden
-- önerilmediğini görmesinde sakınca yok, kararı koç veriyor.
DROP POLICY IF EXISTS "Ogrenci kendi kararlarini okur" ON oneri_kararlari;
CREATE POLICY "Ogrenci kendi kararlarini okur" ON oneri_kararlari
  FOR SELECT TO authenticated
  USING (student_id = auth.uid());


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $$
DECLARE n INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='oneri_kararlari')
  THEN RAISE EXCEPTION 'oneri_kararlari olusmadi'; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='public' AND tablename='oneri_kararlari';
  IF n <> 2 THEN RAISE EXCEPTION 'politika sayisi: % (2 bekleniyor)', n; END IF;

  SELECT count(*) INTO n FROM pg_class
   WHERE relname='oneri_kararlari' AND relrowsecurity;
  IF n <> 1 THEN RAISE EXCEPTION 'RLS acik degil'; END IF;

  RAISE NOTICE 'oneri_kararlari hazir.';
END $$;
