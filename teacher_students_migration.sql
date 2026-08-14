-- ============================================================
-- Migration: teacher_students — öğretmen ↔ öğrenci bağı (ÇİFT ONAYLI)
--
-- SORUN: Öğretmen paneli role='student' olan HERKESİ çekiyordu; ikinci bir
-- öğretmen eklendiğinde tüm öğrencilerin verisi ona da açık olurdu.
-- ÇÖZÜM: Açık bir ilişki tablosu + RLS'in bu ilişkiye bakması.
--
-- Bağı iki taraf da teklif edebilir, KARŞI TARAF ONAYLAR (ders planlamadaki
-- mantığın aynısı). Onaylanmadan öğrencinin verisine erişim açılmaz.
--
-- Bu dosya hem sıfırdan kurulumda hem de önceki (onaysız) sürümün üzerine
-- güvenle çalışır.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS teacher_students (
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, student_id)
);

-- Çift onay alanları (önceki sürümde yoksa eklenir)
ALTER TABLE teacher_students
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS durum      TEXT NOT NULL DEFAULT 'onaylandi';
  -- durum: 'beklemede' | 'onaylandi' | 'reddedildi'
  -- Varsayılan 'onaylandi': mevcut satırlar gerçek ilişkilerdir, geçişte kopmasın.

CREATE INDEX IF NOT EXISTS idx_teacher_students_student ON teacher_students (student_id);

-- --- Mevcut ilişkileri geçmiş kayıtlardan doldur (onaylı olarak) ---
INSERT INTO teacher_students (teacher_id, student_id, created_by, durum)
SELECT DISTINCT teacher_id, student_id, teacher_id, 'onaylandi' FROM tasks
  WHERE teacher_id IS NOT NULL AND student_id IS NOT NULL
UNION
SELECT DISTINCT teacher_id, student_id, teacher_id, 'onaylandi' FROM lessons
  WHERE teacher_id IS NOT NULL AND student_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- --- Yardımcı: "bu öğrenci benim ONAYLI öğrencim mi?" ---
-- SECURITY DEFINER: politika içinden çağrıldığında teacher_students'ın kendi
-- RLS'ine takılıp sonsuz döngüye girmesin.
CREATE OR REPLACE FUNCTION ogrencim_mi(p_student UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_students
    WHERE teacher_id = auth.uid()
      AND student_id = p_student
      AND durum = 'onaylandi'
  );
$$;

GRANT EXECUTE ON FUNCTION ogrencim_mi(UUID) TO authenticated;

-- --- teacher_students RLS ---
ALTER TABLE teacher_students ENABLE ROW LEVEL SECURITY;

-- Eski (tek taraflı) politikayı kaldır
DROP POLICY IF EXISTS "Ogretmen kendi baglarini yonetir"   ON teacher_students;
DROP POLICY IF EXISTS "Ogrenci kendi ogretmenlerini gorur" ON teacher_students;
DROP POLICY IF EXISTS "Baglari taraflar gorur"             ON teacher_students;
DROP POLICY IF EXISTS "Baglanti teklifi olustur"           ON teacher_students;
DROP POLICY IF EXISTS "Karsi taraf onaylar"                ON teacher_students;
DROP POLICY IF EXISTS "Taraflar bagi kaldirir"             ON teacher_students;

-- Her iki taraf kendi bağlarını (bekleyen dahil) görür
CREATE POLICY "Baglari taraflar gorur" ON teacher_students
  FOR SELECT
  USING (auth.uid() = teacher_id OR auth.uid() = student_id);

-- Teklifi yalnızca taraflardan biri oluşturabilir ve kendini created_by yazar
CREATE POLICY "Baglanti teklifi olustur" ON teacher_students
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND (auth.uid() = teacher_id OR auth.uid() = student_id)
  );

-- Onay/ret KARŞI tarafa aittir; kimse kendi teklifini onaylayamaz
CREATE POLICY "Karsi taraf onaylar" ON teacher_students
  FOR UPDATE
  USING (
    (auth.uid() = teacher_id OR auth.uid() = student_id)
    AND auth.uid() IS DISTINCT FROM created_by
  )
  WITH CHECK (auth.uid() = teacher_id OR auth.uid() = student_id);

-- Bağı her iki taraf da kaldırabilir
CREATE POLICY "Taraflar bagi kaldirir" ON teacher_students
  FOR DELETE
  USING (auth.uid() = teacher_id OR auth.uid() = student_id);

-- ============================================================
-- Öğretmen yetkilerini "tüm öğrenciler"den "onaylı öğrencilerim"e daralt
-- ============================================================

-- student_profiles
DROP POLICY IF EXISTS "Öğretmen profilleri okur" ON student_profiles;
DROP POLICY IF EXISTS "Ogretmen kendi ogrencilerinin profilini okur" ON student_profiles;
CREATE POLICY "Ogretmen kendi ogrencilerinin profilini okur" ON student_profiles
  FOR SELECT USING (ogrencim_mi(id));

-- homework_submissions
DROP POLICY IF EXISTS "Öğretmen gönderimleri yönetir" ON homework_submissions;
DROP POLICY IF EXISTS "Ogretmen kendi ogrencilerinin odevlerini yonetir" ON homework_submissions;
CREATE POLICY "Ogretmen kendi ogrencilerinin odevlerini yonetir" ON homework_submissions
  FOR ALL
  USING      (ogrencim_mi(student_id))
  WITH CHECK (ogrencim_mi(student_id));

-- exam_results
DROP POLICY IF EXISTS "Ogretmen sinav sonuclarini yonetir" ON exam_results;
DROP POLICY IF EXISTS "Ogretmen kendi ogrencilerinin sinavlarini yonetir" ON exam_results;
CREATE POLICY "Ogretmen kendi ogrencilerinin sinavlarini yonetir" ON exam_results
  FOR ALL
  USING      (ogrencim_mi(student_id))
  WITH CHECK (ogrencim_mi(student_id));

-- test_sessions
DROP POLICY IF EXISTS "Ogretmen testleri okur" ON test_sessions;
DROP POLICY IF EXISTS "Ogretmen kendi ogrencilerinin testlerini okur" ON test_sessions;
CREATE POLICY "Ogretmen kendi ogrencilerinin testlerini okur" ON test_sessions
  FOR SELECT USING (ogrencim_mi(student_id));

-- NOT: exam_topics (müfredat) tüm öğretmenlerde ortak kalır — kasıtlı.

-- Doğrulama:
--   SELECT t.full_name AS ogretmen, s.full_name AS ogrenci, ts.durum
--   FROM teacher_students ts
--   JOIN users t ON t.id = ts.teacher_id
--   JOIN users s ON s.id = ts.student_id;
