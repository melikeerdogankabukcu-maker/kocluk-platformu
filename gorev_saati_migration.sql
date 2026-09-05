-- ============================================================
-- GÖREVE SAAT
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
--
-- ── NEDEN AYRI SÜTUN, due_date TIMESTAMP OLMADI ─────────────────
-- due_date bugün bir DATE ve on küsur yerde "YYYY-MM-DD" metni olarak
-- kullanılıyor: takvim günlere onunla grupluyor (tasksByDay[t.due_date]),
-- haftalık özet haftaya onunla yazıyor, sıralamalar localeCompare ile
-- metin karşılaştırıyor. TIMESTAMPTZ'e çevirseydik bu yerlerin hepsi
-- sessizce bozulurdu — özellikle akşam saatli görevler, UTC'ye çevrilip
-- bir sonraki güne kayardı.
--
-- Ayrı bir TIME sütunu hiçbirini bozmuyor: saat girilmemiş görevler
-- eskisi gibi çalışıyor, girilmiş olanlar aynı güne saatiyle birlikte
-- düşüyor.
--
-- ── NEDEN NULL SERBEST ──────────────────────────────────────────
-- Saat zorunlu değil. "Bu hafta içinde bitir" diye verilen görevin
-- saati yok; varsayılan bir saat uydurmak (ör. 23:59) öğrenciye
-- olmayan bir son teslim anı gösterirdi.
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_time TIME;

COMMENT ON COLUMN tasks.due_time IS
  'Görevin gün içindeki saati. NULL = saat belirtilmemiş. '
  'due_date ile birlikte okunur; saati olup tarihi olmayan görev anlamsız.';

-- Tarihi olmayan bir göreve saat yazmak anlamsız: "saat 19:00'da,
-- ama hangi gün?" Kısıt bunu veritabanı düzeyinde engelliyor.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_due_time_tarihsiz;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_due_time_tarihsiz
  CHECK (due_time IS NULL OR due_date IS NOT NULL);


-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'due_time'
  ) THEN
    RAISE EXCEPTION 'tasks.due_time eklenemedi';
  END IF;
  RAISE NOTICE 'gorev_saati: tasks.due_time hazir.';
END $$;
