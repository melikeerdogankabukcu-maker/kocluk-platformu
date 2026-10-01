-- ============================================================
-- Migration: ders onayı sunucuda da korunuyor + bildirim metni
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN ───────────────────────────────────────────────────
-- Ders akışı 2026-09-21'de değişti: KOÇ planlarsa ders doğrudan
-- onaylı, ÖĞRENCİ talep ederse koç onaylıyor. Öğrencinin onay
-- düğmesi arayüzden kaldırıldı — ama YALNIZCA arayüzden.
--
-- lessons üzerindeki RLS politikası "Ders taraflari" FOR ALL ve
-- USING/WITH CHECK (auth.uid() = teacher_id OR auth.uid() = student_id)
-- diyor. Yani öğrenci kendi dersinin HER alanını yazabiliyor:
-- status'ü onaylandi yapmak, katılımı işaretlemek, ödemeyi odendi
-- göstermek doğrudan API üzerinden mümkün.
--
-- Bu yalnız bir yetki açığı değil: katılım ve ödeme kayıtları veli
-- raporundaki DOĞRULANMIŞ ÇALIŞMA KAYDI bölümüne giriyor. Öğrencinin
-- kendi dersini tamamlanmış işaretleyebildiği bir sistemde o belgenin
-- "doğrulanmış" demeye hakkı olmaz.
--
-- Politikayı daraltmak yetmiyor: RLS satır bazlı, hangi KOLONUN kim
-- tarafından değiştirildiğini ayırt edemiyor. Bu yüzden tetikleyici —
-- aynı desen gorev_onayi_koru ve calisma_blogu_koru'da da kullanılıyor.

-- ------------------------------------------------------------
-- 1) Alan bazlı koruma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ders_yetkisi_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  -- Dersin KENDİ koçu ölçüt alınıyor (ogrencim_mi değil): bir
  -- öğrencinin birden çok koçu olabiliyor, ama dersi planlayan tek bir
  -- koç var ve satır onu yazıyor.
  koc BOOLEAN := (auth.uid() = NEW.teacher_id) OR admin_mi();
BEGIN
  -- Onay ve ret koçun kararı. İPTAL serbest: öğrenci de dersi iptal
  -- edebilmeli, akış bunu gerektiriyor.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('onaylandi', 'reddedildi')
     AND NOT koc THEN
    RAISE EXCEPTION 'Dersi yalnizca kocu onaylayabilir veya reddedebilir.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.teacher_approved IS DISTINCT FROM OLD.teacher_approved AND NOT koc THEN
    RAISE EXCEPTION 'Koc onayi alanini yalnizca koc degistirebilir.'
      USING ERRCODE = '42501';
  END IF;

  -- Katılım ve tamamlanma koçun kaydı; rapordaki "tamamlanan ders"
  -- sayısı buradan geliyor.
  IF (NEW.completed IS DISTINCT FROM OLD.completed
   OR NEW.katilim   IS DISTINCT FROM OLD.katilim)
     AND NOT koc THEN
    RAISE EXCEPTION 'Ders katilimini yalnizca koc isaretleyebilir.'
      USING ERRCODE = '42501';
  END IF;

  -- Ödeme: bildirildi öğrencinin/velinin beyanı, serbest.
  -- odendi/odenmedi koçun onayı.
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status IN ('odendi', 'odenmedi')
     AND NOT koc THEN
    RAISE EXCEPTION 'Odeme onayini yalnizca koc verebilir.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.ders_yetkisi_koru() FROM PUBLIC, anon, authenticated;

-- Tetikleyici korunan kolonları AÇIKÇA dinliyor. Listede olmayan bir
-- kolon değişince tetikleyici hiç çalışmaz; koruma yazılmış ama
-- işletilmemiş olurdu (aynı tuzağa gorev_onayi'nda denk gelinmişti).
DROP TRIGGER IF EXISTS ders_yetki_kilidi ON lessons;
CREATE TRIGGER ders_yetki_kilidi
  BEFORE UPDATE OF status, teacher_approved, completed, katilim, payment_status ON lessons
  FOR EACH ROW EXECUTE FUNCTION public.ders_yetkisi_koru();

-- ------------------------------------------------------------
-- 2) Bildirim metni: koç planladığında "teklif" denmiyor
-- ------------------------------------------------------------
-- Koç ders planladığında öğrenciye "Yeni ders teklifi" gidiyordu.
-- Oysa o ders zaten onaylı; öğrenciden bir şey beklenmiyor. Teklif
-- yalnızca öğrenci talep ettiğinde var ve o zaman koça gider.
CREATE OR REPLACE FUNCTION trg_bildirim_ders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_karsi UUID; v_tarih TEXT;
BEGIN
  v_tarih := to_char(NEW.lesson_date, 'DD.MM.YYYY') || ' ' || COALESCE(to_char(NEW.start_time, 'HH24:MI'), '');

  IF TG_OP = 'INSERT' THEN
    IF NEW.created_by = NEW.teacher_id THEN
      -- Koç planladı: ders onaylı, öğrenci yalnızca haberdar ediliyor
      PERFORM bildirim_ekle(NEW.student_id, 'ders', 'Yeni ders planlandı',
        kisi_adi(NEW.created_by) || ' · ' || v_tarih, NEW.id);
    ELSE
      -- Öğrenci talep etti: koçun onayı bekleniyor
      PERFORM bildirim_ekle(NEW.teacher_id, 'ders', 'Yeni ders teklifi',
        kisi_adi(NEW.created_by) || ' · ' || v_tarih, NEW.id);
    END IF;

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
END; $fn$;

-- ------------------------------------------------------------
-- 3) DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- Korumanın gerçekten işlediği burada kanıtlanıyor: gerçek bir
-- koç-öğrenci çiftiyle, öğrencinin kimliğine bürünüp reddedilmesi
-- gerekenler deneniyor. Sonunda sınama satırı siliniyor.
DO $test$
DECLARE
  koc UUID; ogr UUID; ders UUID; red BOOLEAN; gecen INTEGER := 0;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
    RETURN;
  END IF;

  ALTER TABLE public.lessons DISABLE TRIGGER bildirim_ders;

  INSERT INTO lessons (teacher_id, student_id, created_by, lesson_date, start_time,
                       status, teacher_approved, student_approved)
  VALUES (koc, ogr, ogr, date '2099-06-17', time '10:00', 'beklemede', false, true)
  RETURNING id INTO ders;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);

  -- a) ogrenci kendi dersini onaylayamaz
  red := false;
  BEGIN UPDATE lessons SET status = 'onaylandi' WHERE id = ders;
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA a: ogrenci dersi onaylayabildi'; END IF;
  gecen := gecen + 1;

  -- b) ogrenci katilimi isaretleyemez
  red := false;
  BEGIN UPDATE lessons SET completed = true, katilim = 'geldi' WHERE id = ders;
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: ogrenci katilimi isaretleyebildi'; END IF;
  gecen := gecen + 1;

  -- c) ogrenci odemeyi odendi yapamaz
  red := false;
  BEGIN UPDATE lessons SET payment_status = 'odendi' WHERE id = ders;
  EXCEPTION WHEN insufficient_privilege THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: ogrenci odemeyi onaylayabildi'; END IF;
  gecen := gecen + 1;

  -- d) ogrenci odeme BILDIREBILIR (serbest kalmasi gereken yol)
  UPDATE lessons SET payment_status = 'bildirildi' WHERE id = ders;
  gecen := gecen + 1;

  -- e) ogrenci dersi iptal edebilir
  UPDATE lessons SET status = 'iptal' WHERE id = ders;
  gecen := gecen + 1;

  -- f) koc onaylayabilir ve katilimi isaretleyebilir
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  UPDATE lessons SET status = 'onaylandi', teacher_approved = true, completed = true WHERE id = ders;
  gecen := gecen + 1;

  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM lessons WHERE id = ders;
  ALTER TABLE public.lessons ENABLE TRIGGER bildirim_ders;

  RAISE NOTICE 'ders_yetki: % davranis sinamasi gecti.', gecen;
END $test$;
