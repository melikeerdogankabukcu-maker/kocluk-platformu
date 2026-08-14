-- ============================================================
-- Migration: exam_results — sınav sonuçlarını öğretmen girer
-- Sınav girişi öğrenci panelinden öğretmen paneline taşındı.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE exam_results ENABLE ROW LEVEL SECURITY;

-- Öğretmen tüm öğrencilerin sınav sonuçlarını girebilir / görebilir / düzenleyebilir
DROP POLICY IF EXISTS "Ogretmen sinav sonuclarini yonetir" ON exam_results;
CREATE POLICY "Ogretmen sinav sonuclarini yonetir" ON exam_results
  FOR ALL
  USING      (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'));

-- Öğrenci kendi sonuçlarını yalnızca GÖRÜR (artık kendi giremez)
DROP POLICY IF EXISTS "Ogrenci kendi sinav sonuclari"  ON exam_results;
DROP POLICY IF EXISTS "Ogrenci sinav sonuclarini okur" ON exam_results;
CREATE POLICY "Ogrenci sinav sonuclarini okur" ON exam_results
  FOR SELECT
  USING (auth.uid() = student_id);

-- Veli bağlı çocuğunun sonuçlarını görür
DROP POLICY IF EXISTS "Veli cocuk sinav sonuclarini okur" ON exam_results;
CREATE POLICY "Veli cocuk sinav sonuclarini okur" ON exam_results
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = exam_results.student_id)
  );

-- Doğrulama:
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'exam_results';
