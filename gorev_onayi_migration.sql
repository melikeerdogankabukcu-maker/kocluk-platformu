-- ============================================================
-- GÖREV DOĞRULAMA (öğretmen "yapıldığını gördüm" diyebiliyor)
--
-- ── İHTİYAÇ ─────────────────────────────────────────────────────
-- Bugün bir görevin yapılıp yapılmadığını YALNIZCA öğrenci işaretliyor
-- (tasks.is_done). Öğretmenin, defteri fiziksel olarak görüp "evet
-- gerçekten yapılmış" demesinin bir yolu yok; işaretlenmemiş ama
-- yapılmış bir görevi de kapatamıyor.
--
-- Ödev akışı (homework_submissions) bunu dosya yüklenerek çözüyor ama
-- her görev dosyayla teslim edilmiyor — ders sırasında elde görülen bir
-- çalışma için ayrı bir doğrulama gerekiyor.
--
-- ── ÖĞRENCİ KENDİNİ ONAYLAYAMAZ ─────────────────────────────────
-- tasks üzerinde öğrencinin KENDİ satırını güncellediği bir politika
-- var ("Ogrenci gorevini tamamlar"): korunmasaydı öğrenci kendi görevine
-- ogretmen_onayi = 'onaylandi' yazıp koçun doğrulamasını kendi
-- uydururdu. Kolonlar tetikleyiciyle korunuyor — users.role ve
-- onay_durumu'nda kullandığımız desenin aynısı.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS ogretmen_onayi TEXT,
  ADD COLUMN IF NOT EXISTS onay_notu      TEXT,
  ADD COLUMN IF NOT EXISTS onaylayan_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onay_tarihi    TIMESTAMPTZ;

COMMENT ON COLUMN tasks.ogretmen_onayi IS
  'NULL = koç henüz bakmadı, onaylandi = koç yapıldığını gördü, '
  'iade_edildi = tekrar yapılmalı. Yalnızca öğrencinin koçu yazabilir.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tasks'::regclass AND conname = 'tasks_ogretmen_onayi_check'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT tasks_ogretmen_onayi_check
      CHECK (ogretmen_onayi IS NULL OR ogretmen_onayi IN ('onaylandi', 'iade_edildi'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_onay ON tasks (student_id, ogretmen_onayi)
  WHERE ogretmen_onayi IS NOT NULL;


-- ------------------------------------------------------------
-- Onay kolonlarını yalnızca öğrencinin koçu yazabilir
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION gorev_onayi_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.ogretmen_onayi IS DISTINCT FROM OLD.ogretmen_onayi
   OR NEW.onay_notu      IS DISTINCT FROM OLD.onay_notu
   OR NEW.onaylayan_id   IS DISTINCT FROM OLD.onaylayan_id
   OR NEW.onay_tarihi    IS DISTINCT FROM OLD.onay_tarihi)
  THEN
    IF NOT (admin_mi() OR ogrencim_mi(NEW.student_id)) THEN
      RAISE EXCEPTION 'Gorev dogrulamasini yalnizca ogrencinin kocu degistirebilir.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.gorev_onayi_koru() FROM PUBLIC, anon, authenticated;

-- Tetikleyici bu kolonları AÇIKÇA dinlemeli. Listede olmayan bir kolon
-- değiştiğinde tetikleyici hiç çalışmaz; koruma yazılmış ama
-- işletilmemiş olur. Bu tuzağa daha önce onay_durumu'nda denk gelindi.
DROP TRIGGER IF EXISTS gorev_onay_kilidi ON tasks;
CREATE TRIGGER gorev_onay_kilidi
  BEFORE UPDATE OF ogretmen_onayi, onay_notu, onaylayan_id, onay_tarihi ON tasks
  FOR EACH ROW EXECUTE FUNCTION gorev_onayi_koru();


-- ------------------------------------------------------------
-- Öğrenciye bildirim
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bildirim_gorev_onayi()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.ogretmen_onayi IS DISTINCT FROM OLD.ogretmen_onayi
     AND NEW.ogretmen_onayi IS NOT NULL THEN
    PERFORM bildirim_ekle(
      NEW.student_id,
      'gorev',
      CASE WHEN NEW.ogretmen_onayi = 'onaylandi'
           THEN 'Koçun görevini onayladı ✓'
           ELSE 'Görevin iade edildi' END,
      COALESCE(NEW.title, 'Görev')
        || CASE WHEN NEW.onay_notu IS NOT NULL THEN ' — ' || NEW.onay_notu ELSE '' END,
      NEW.id
    );
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_bildirim_gorev_onayi() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gorev_onay_bildirimi ON tasks;
CREATE TRIGGER gorev_onay_bildirimi
  AFTER UPDATE OF ogretmen_onayi ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_gorev_onayi();


-- ============================================================
-- DOĞRULAMA
--
-- 1) Kolonlar ve kısıt:
--      SELECT ogretmen_onayi, count(*) FROM tasks GROUP BY 1;
--      -- hepsi NULL olmalı (henüz kimse doğrulamadı)
--
-- 2) Tetikleyiciler yerinde (2 satır):
--      SELECT tgname FROM pg_trigger
--      WHERE tgrelid = 'public.tasks'::regclass AND NOT tgisinternal;
--
-- 3) ASIL TEST — öğrenci kendini onaylayamamalı:
--    Öğrenci hesabıyla girip tarayıcı konsolundan denerseniz hata
--    dönmeli ("Gorev dogrulamasini yalnizca ogrencinin kocu...").
--    Arayüzde böyle bir düğme yok; koruma doğrudan yazmaya karşı.
-- ============================================================
