-- ============================================================
-- Migration: notifications — bildirim sistemi
--
-- TASARIM: Bildirimler VERİTABANI TETİKLEYİCİLERİ ile üretilir, frontend'den
-- değil. Böylece (1) mevcut çalışan akışlara dokunulmaz, (2) hangi istemciden
-- gelirse gelsin bildirim atlanamaz, (3) tek yerden yönetilir.
--
-- Kimse kendi eyleminden bildirim almaz; bildirim her zaman KARŞI tarafa gider.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- alıcı
  tur        TEXT        NOT NULL,   -- gorev | odev | ders | sinav | odeme | baglanti | test
  baslik     TEXT        NOT NULL,
  mesaj      TEXT,
  ilgili_id  UUID,                   -- ilgili kaydın id'si (opsiyonel)
  okundu     BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications (user_id, okundu, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kendi bildirimlerini okur"     ON notifications;
DROP POLICY IF EXISTS "Kendi bildirimlerini guncelle" ON notifications;
DROP POLICY IF EXISTS "Kendi bildirimlerini siler"    ON notifications;

CREATE POLICY "Kendi bildirimlerini okur" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Kendi bildirimlerini guncelle" ON notifications
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Kendi bildirimlerini siler" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

-- Canlı bildirim için Realtime yayınına ekle
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Yardımcılar
-- ============================================================

-- Tek bildirim yazar. SECURITY DEFINER: tetikleyiciden çağrıldığında
-- notifications RLS'ine takılmasın.
CREATE OR REPLACE FUNCTION bildirim_ekle(
  p_user UUID, p_tur TEXT, p_baslik TEXT, p_mesaj TEXT DEFAULT NULL, p_ilgili UUID DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  INSERT INTO notifications (user_id, tur, baslik, mesaj, ilgili_id)
  VALUES (p_user, p_tur, p_baslik, p_mesaj, p_ilgili);
END; $$;

CREATE OR REPLACE FUNCTION kisi_adi(p_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(full_name, 'Kullanıcı') FROM users WHERE id = p_id;
$$;

-- ============================================================
-- Tetikleyiciler
-- ============================================================

-- 1) Görev atandı → öğrenciye
CREATE OR REPLACE FUNCTION trg_bildirim_gorev()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM bildirim_ekle(
    NEW.student_id, 'gorev', 'Yeni görev atandı',
    COALESCE(NEW.title, 'Görev')
      || CASE WHEN NEW.due_date IS NOT NULL
              THEN ' · teslim: ' || to_char(NEW.due_date, 'DD.MM.YYYY') ELSE '' END,
    NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bildirim_gorev ON tasks;
CREATE TRIGGER bildirim_gorev AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_gorev();

-- 2) Ödev yüklendi → öğretmen(ler)e / 3) İncelendi → öğrenciye
CREATE OR REPLACE FUNCTION trg_bildirim_odev()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD; v_baslik TEXT;
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status = 'beklemede' AND OLD.status <> 'beklemede') THEN
    FOR r IN SELECT teacher_id FROM teacher_students
             WHERE student_id = NEW.student_id AND durum = 'onaylandi' LOOP
      PERFORM bildirim_ekle(r.teacher_id, 'odev', 'Ödev yüklendi',
        kisi_adi(NEW.student_id) || ' bir ödev yükledi', NEW.id);
    END LOOP;

  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    v_baslik := CASE NEW.status
      WHEN 'onaylandi'   THEN 'Ödevin onaylandı ✓'
      WHEN 'iade_edildi' THEN 'Ödevin iade edildi'
      ELSE 'Ödev durumu güncellendi' END;
    PERFORM bildirim_ekle(NEW.student_id, 'odev', v_baslik, NEW.teacher_note, NEW.id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bildirim_odev ON homework_submissions;
CREATE TRIGGER bildirim_odev AFTER INSERT OR UPDATE ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_odev();

-- 4) Ders teklifi / onay / iptal / ödeme → karşı tarafa
CREATE OR REPLACE FUNCTION trg_bildirim_ders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_karsi UUID; v_tarih TEXT;
BEGIN
  v_tarih := to_char(NEW.lesson_date, 'DD.MM.YYYY') || ' ' || COALESCE(to_char(NEW.start_time, 'HH24:MI'), '');

  IF TG_OP = 'INSERT' THEN
    -- Teklifi oluşturmayan taraf bilgilendirilir
    v_karsi := CASE WHEN NEW.created_by = NEW.teacher_id THEN NEW.student_id ELSE NEW.teacher_id END;
    PERFORM bildirim_ekle(v_karsi, 'ders', 'Yeni ders teklifi',
      kisi_adi(NEW.created_by) || ' · ' || v_tarih, NEW.id);

  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    -- Durum değişikliğini teklifi açan taraf öğrenmeli
    v_karsi := COALESCE(NEW.created_by, NEW.teacher_id);
    PERFORM bildirim_ekle(v_karsi, 'ders',
      CASE NEW.status
        WHEN 'onaylandi'  THEN 'Ders onaylandı ✓'
        WHEN 'reddedildi' THEN 'Ders teklifi reddedildi'
        WHEN 'iptal'      THEN 'Ders iptal edildi'
        ELSE 'Ders durumu güncellendi' END,
      v_tarih, NEW.id);

  ELSIF TG_OP = 'UPDATE' AND NEW.payment_status <> OLD.payment_status THEN
    IF NEW.payment_status = 'bildirildi' THEN
      PERFORM bildirim_ekle(NEW.teacher_id, 'odeme', 'Ödeme bildirimi',
        v_tarih || ' dersi için ödeme bildirildi', NEW.id);
    ELSIF NEW.payment_status = 'odendi' THEN
      PERFORM bildirim_ekle(NEW.student_id, 'odeme', 'Ödeme onaylandı ✓', v_tarih, NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bildirim_ders ON lessons;
CREATE TRIGGER bildirim_ders AFTER INSERT OR UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_ders();

-- 5) Sınav sonucu girildi → öğrenciye
CREATE OR REPLACE FUNCTION trg_bildirim_sinav()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM bildirim_ekle(NEW.student_id, 'sinav', 'Sınav sonucun girildi',
    COALESCE(NEW.exam_name, 'Deneme')
      || CASE WHEN NEW.total_net IS NOT NULL THEN ' · ' || NEW.total_net || ' net' ELSE '' END,
    NEW.id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bildirim_sinav ON exam_results;
CREATE TRIGGER bildirim_sinav AFTER INSERT ON exam_results
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_sinav();

-- 6) Test çözüldü → öğretmen(ler)e
CREATE OR REPLACE FUNCTION trg_bildirim_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT teacher_id FROM teacher_students
           WHERE student_id = NEW.student_id AND durum = 'onaylandi' LOOP
    PERFORM bildirim_ekle(r.teacher_id, 'test', 'Test çözüldü',
      kisi_adi(NEW.student_id) || ' · ' || COALESCE(NEW.subject, '')
        || COALESCE(' — ' || NEW.topic, '')
        || ' · ' || COALESCE(NEW.correct_count, 0) || '/' || COALESCE(NEW.question_count, 0),
      NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bildirim_test ON test_sessions;
CREATE TRIGGER bildirim_test AFTER INSERT ON test_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_test();

-- 7) Bağlantı teklifi / yanıtı → karşı tarafa
CREATE OR REPLACE FUNCTION trg_bildirim_baglanti()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_karsi UUID;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.durum = 'beklemede' THEN
    v_karsi := CASE WHEN NEW.created_by = NEW.teacher_id THEN NEW.student_id ELSE NEW.teacher_id END;
    PERFORM bildirim_ekle(v_karsi, 'baglanti', 'Bağlantı isteği',
      kisi_adi(NEW.created_by) || ' sizinle bağlantı kurmak istiyor', NULL);

  ELSIF TG_OP = 'UPDATE' AND NEW.durum <> OLD.durum AND NEW.created_by IS NOT NULL THEN
    PERFORM bildirim_ekle(NEW.created_by, 'baglanti',
      CASE NEW.durum
        WHEN 'onaylandi'  THEN 'Bağlantı isteğin onaylandı ✓'
        WHEN 'reddedildi' THEN 'Bağlantı isteğin reddedildi'
        ELSE 'Bağlantı durumu güncellendi' END,
      NULL, NULL);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bildirim_baglanti ON teacher_students;
CREATE TRIGGER bildirim_baglanti AFTER INSERT OR UPDATE ON teacher_students
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_baglanti();

-- Doğrulama:
--   SELECT tur, baslik, mesaj, okundu, created_at FROM notifications
--   ORDER BY created_at DESC LIMIT 20;
