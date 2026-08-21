-- ============================================================
-- HESAP ONAYI
--
-- Yeni kayıtlar artık doğrudan içeri girmiyor: yönetici onaylayana kadar
-- bekliyor. Kayıt olunca yöneticiye bildirim düşüyor.
--
-- ── MEVCUT KULLANICILAR ─────────────────────────────────────────
-- Kolon 'beklemede' varsayılanıyla ekleniyor; ALTER anında MEVCUT TÜM
-- SATIRLAR da bu değeri alır. Hemen ardından hepsi 'onaylandi' yapılıyor
-- — yoksa yönetici dahil herkes kendi uygulamasından kilitlenirdi.
--
-- ── KENDİ KENDİNİ ONAYLAMA KAPALI ───────────────────────────────
-- users üzerinde kullanıcının kendi satırını güncelleyebildiği bir
-- politika var (profil düzenleme). Onay kolonu korunmasaydı kişi kendi
-- satırında onay_durumu = 'onaylandi' yazıp kapıyı kendi açardı.
-- Rol kilidi tetikleyicisi genişletildi: rol gibi onay da yalnızca
-- yönetici tarafından değiştirilebiliyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onay_durumu TEXT NOT NULL DEFAULT 'beklemede';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'users_onay_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_onay_check
      CHECK (onay_durumu IN ('beklemede', 'onaylandi', 'reddedildi'));
  END IF;
END $$;

-- Mevcut herkes onaylı sayılıyor (kilitlenmesinler)
UPDATE users SET onay_durumu = 'onaylandi' WHERE onay_durumu = 'beklemede';

CREATE INDEX IF NOT EXISTS idx_users_onay ON users (onay_durumu)
  WHERE onay_durumu <> 'onaylandi';


-- ------------------------------------------------------------
-- Ayrıcalıklı kolonlar: rol VE onay yalnızca yöneticide
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION users_rol_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT admin_mi() THEN
      RAISE EXCEPTION 'Rol degistirilemez. Ogretmen yetkisi yalnizca yonetici tarafindan verilir.';
    END IF;
    IF NEW.role NOT IN ('student', 'parent', 'teacher') THEN
      RAISE EXCEPTION 'Bu rol uygulamadan atanamaz: %', NEW.role;
    END IF;
  END IF;

  -- Kişi kendi hesabını onaylayamaz
  IF NEW.onay_durumu IS DISTINCT FROM OLD.onay_durumu AND NOT admin_mi() THEN
    RAISE EXCEPTION 'Hesap onayi yalnizca yonetici tarafindan degistirilebilir.';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.users_rol_koru() FROM PUBLIC, anon, authenticated;

-- Tetikleyici yalnızca role kolonunu dinliyordu; onay değişimini de
-- yakalaması için yeniden kuruluyor.
DROP TRIGGER IF EXISTS users_rol_kilidi ON users;
CREATE TRIGGER users_rol_kilidi
  BEFORE UPDATE OF role, onay_durumu ON users
  FOR EACH ROW EXECUTE FUNCTION users_rol_koru();


-- ------------------------------------------------------------
-- Kayıt olunca yöneticiye bildirim
--
-- Rol belirleme mantığı AYNEN duruyor; üzerine bildirim ekleniyor.
-- Birden fazla yönetici olabileceği için hepsine gönderiliyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.yeni_kullanici_olustur()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_istenen TEXT;
  v_rol     TEXT;
  v_ad      TEXT;
  v_talep   TEXT;
BEGIN
  v_istenen := COALESCE(NEW.raw_user_meta_data ->> 'role', 'student');
  v_rol := v_istenen;
  IF v_rol NOT IN ('student', 'parent') THEN
    v_rol := 'student';
  END IF;
  v_talep := CASE WHEN v_istenen <> v_rol THEN v_istenen END;
  v_ad := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email);

  INSERT INTO public.users (id, email, full_name, role, talep_rol)
  VALUES (NEW.id, NEW.email, v_ad, v_rol, v_talep)
  ON CONFLICT (id) DO NOTHING;
  -- onay_durumu kolonun varsayılanından 'beklemede' geliyor

  -- Yöneticilere haber ver
  PERFORM bildirim_ekle(
    u.id,
    'kayit',
    'Yeni kayıt: ' || v_ad,
    CASE WHEN v_talep = 'teacher'
         THEN 'Öğretmen olarak kaydolmak istiyor. Onayınızı bekliyor.'
         ELSE 'Yeni hesap onayınızı bekliyor.' END,
    NEW.id
  )
  FROM public.users u WHERE u.role = 'admin';

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.yeni_kullanici_olustur() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- DOĞRULAMA
--   SELECT email, role, onay_durumu, talep_rol FROM users ORDER BY created_at;
--   -- mevcut 7 kullanıcının hepsi 'onaylandi' olmalı
--
--   Yeni bir kayıt açıldıktan sonra:
--     SELECT email, onay_durumu FROM users ORDER BY created_at DESC LIMIT 1;  -- beklemede
--     SELECT tur, baslik FROM notifications
--     WHERE tur = 'kayit' ORDER BY created_at DESC LIMIT 3;
--
-- ── KAPSAM SINIRI (bilerek) ─────────────────────────────────────
-- Onay kapısı ARAYÜZDE: onaylanmamış kullanıcı panel yerine bekleme
-- ekranı görüyor ve bağlantı aday listelerinde çıkmıyor. Veri katmanında
-- her politikaya onay koşulu EKLENMEDİ — onaylanmamış kişi zaten hiçbir
-- öğrenciye bağlı olmadığı için RLS ona kimsenin verisini vermiyor.
-- Bağlantı kurulabilmesi onaydan sonra mümkün olduğu için pratikte kapı
-- kapalı; ~20 politikaya koşul eklemenin getireceği risk buna değmezdi.
-- ============================================================
