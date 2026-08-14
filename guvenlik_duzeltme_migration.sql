-- ============================================================
-- YAYIN ÖNCESİ GÜVENLİK DÜZELTMESİ
--
-- BULGU: progress tablosunda RLS açık ama HERKESE okuma izni veren bir
-- politika var. anon anahtar frontend paketinde herkese açık olduğu için
-- kimliksiz biri tüm öğrencilerin konu ilerlemesini okuyabiliyordu.
-- (Yazma zaten engelliydi.)
--
-- progress tablosu artık uygulamada KULLANILMIYOR — konu ilerlemesi
-- görevlerden türetiliyor. Yine de içinde geçmiş öğrenci verisi olduğu için
-- silmek yerine diğer tablolarla aynı erişim kurallarına bağlanıyor.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE progress ENABLE ROW LEVEL SECURITY;

-- Adı ne olursa olsun progress üzerindeki TÜM mevcut politikaları kaldır
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'progress' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.progress', r.policyname);
  END LOOP;
END $$;

-- Öğrenci kendi ilerlemesini görür
CREATE POLICY "Ogrenci kendi ilerlemesi" ON progress
  FOR SELECT USING (auth.uid() = student_id);

-- Öğretmen yalnızca onaylı öğrencisininkini görür
CREATE POLICY "Ogretmen ogrenci ilerlemesi" ON progress
  FOR SELECT USING (ogrencim_mi(student_id));

-- Veli bağlı çocuğununkini görür
CREATE POLICY "Veli cocuk ilerlemesi" ON progress
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = progress.student_id)
  );

-- Yazma politikası bilerek YOK: tablo artık uygulama tarafından yazılmıyor.

-- Doğrulama (anon anahtarla çağrıldığında boş dönmeli):
--   SELECT tablename, policyname, cmd FROM pg_policies
--   WHERE tablename = 'progress';
