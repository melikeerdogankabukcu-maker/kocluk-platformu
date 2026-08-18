-- ============================================================
-- GÖREVİN KAYNAĞI — öğretmen hangi programı kime atadığını görebilsin
--
-- Öğretmenin kendi yazdığı program artık program_atamalari'na değil
-- doğrudan tasks tablosuna yazılıyor (öğrencide görev olarak görünsün
-- diye). Bunun yan etkisi: "hangi programı kime attım" bilgisi kayboldu,
-- çünkü görevler programla bağlarını taşımıyordu.
--
-- Bu kolon o bağı kuruyor. Elle atanan görevlerde NULL kalır; programdan
-- üretilen görevlerde programın adı yazılır. Ad (id değil) tutuluyor
-- çünkü program sonradan silinse bile öğretmenin geçmişte ne attığını
-- görebilmesi gerekiyor — program_icerik kopyasının saklanmasıyla aynı
-- mantık.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS kaynak_program TEXT;

-- Öğretmen panelinde öğrenci + tarih kırılımıyla listeleniyor
CREATE INDEX IF NOT EXISTS idx_tasks_teacher_student
  ON tasks (teacher_id, student_id, due_date);

-- Doğrulama:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'tasks' AND column_name = 'kaynak_program';
--
--   SELECT kaynak_program, count(*) FROM tasks GROUP BY kaynak_program;
--   -- mevcut görevlerin hepsi NULL olmalı (elle atanmışlar)
