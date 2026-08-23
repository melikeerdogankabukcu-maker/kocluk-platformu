-- ============================================================
-- ÖĞRETMEN PROFİLİ (branş, unvan, tanıtım)
--
-- Öğrencinin koçunun hangi branştan olduğunu görmesi gerekiyor.
-- Bugün öğrenci yalnızca adı görüyor; birden fazla koçu olduğunda
-- hangisine ne soracağını bilmiyor.
--
-- student_profiles ile aynı desen: id doğrudan users.id'ye bağlı,
-- ayrı bir kimlik yok. Kullanıcı silinince profili de gidiyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS ogretmen_profilleri (
  id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  brans         TEXT,
  unvan         TEXT,
  hakkinda      TEXT,
  deneyim_yili  INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE ogretmen_profilleri IS
  'Öğretmenin mesleki bilgileri. Kişisel değil mesleki veri: '
  'öğrenciler koçlarının branşını görebilmeli.';

-- Deneyim yılı negatif ya da saçma olamaz. Arayüz de sınırlıyor ama
-- veritabanı doğrudan yazılmaya karşı da korunmalı.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ogretmen_profilleri'::regclass
      AND conname  = 'ogretmen_deneyim_araligi'
  ) THEN
    ALTER TABLE ogretmen_profilleri ADD CONSTRAINT ogretmen_deneyim_araligi
      CHECK (deneyim_yili IS NULL OR (deneyim_yili >= 0 AND deneyim_yili <= 70));
  END IF;
END $$;


ALTER TABLE ogretmen_profilleri ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'ogretmen_profilleri'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.ogretmen_profilleri', p.policyname);
  END LOOP;
END $$;

-- Okuma giriş yapmış herkese açık. Burada MESLEKİ bilgi var (branş,
-- unvan, tanıtım), kişisel bilgi değil; users tablosundaki ad da zaten
-- aynı şekilde okunabiliyor. Öğrencinin koçunu tanıması gereken bilgi
-- saklanacak bir sır değil.
CREATE POLICY "Ogretmen profillerini herkes okur" ON ogretmen_profilleri
  FOR SELECT TO authenticated USING (true);

-- Yazma yalnızca kişinin kendi satırı. Öğretmen olmayan biri satır
-- açsa bile hiçbir yerde gösterilmiyor; rol kontrolünü buraya koymak
-- rol değişimlerinde sessiz kilitlenmelere yol açardı.
CREATE POLICY "Ogretmen kendi profilini olusturur" ON ogretmen_profilleri
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "Ogretmen kendi profilini gunceller" ON ogretmen_profilleri
  FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Yonetici profilleri yonetir" ON ogretmen_profilleri
  FOR ALL TO authenticated
  USING (admin_mi()) WITH CHECK (admin_mi());


-- updated_at elle güncellenmesin
CREATE OR REPLACE FUNCTION ogretmen_profili_zaman()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ogretmen_profili_zaman_trg ON ogretmen_profilleri;
CREATE TRIGGER ogretmen_profili_zaman_trg
  BEFORE UPDATE ON ogretmen_profilleri
  FOR EACH ROW EXECUTE FUNCTION ogretmen_profili_zaman();


-- ============================================================
-- DOĞRULAMA
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'ogretmen_profilleri' ORDER BY policyname;
--   -- 4 politika: 1 SELECT, 1 INSERT, 1 UPDATE, 1 ALL (yönetici)
--
--   anon anahtarla okunmaya çalışılırsa boş dönmeli (TO authenticated).
-- ============================================================
