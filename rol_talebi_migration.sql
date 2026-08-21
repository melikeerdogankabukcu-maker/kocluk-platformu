-- ============================================================
-- ROL TALEBİ VE ADMİN ONAYI
--
-- ── SORUN ───────────────────────────────────────────────────────
-- Kayıt ekranı "Öğretmen" seçeneği sunuyor ama sistem onu SESSİZCE
-- 'student' yapıyor (rol_guvenligi_migration + kayit_akisi_migration).
-- Güvenlik kuralı doğru — kendine öğretmen yetkisi verebilmek tüm
-- öğrencilerin kişisel verisini açıyordu — ama arayüz güncellenmediği
-- için kullanıcı öğretmen seçip öğrenci oluyor ve neden olduğunu
-- anlamıyor. Nitekim iki koç böyle kaydoldu.
--
-- Ayrıca ADMİN BİLE uygulamadan rol veremiyor: users_rol_kilidi her
-- değişikliği engelliyor, promosyon SQL Editor'den yapılıyor. Bu hem
-- zahmetli hem de denetim kaydında "sistem" olarak görünüyor (SQL
-- Editor'de auth.uid() boş).
--
-- ── ÇÖZÜM ───────────────────────────────────────────────────────
-- 1) Kayıtta ne istendiği saklanıyor (talep_rol)
-- 2) Rol kilidi ADMİNE izin veriyor; başkasına hâlâ kapalı
-- 3) Admin başka kullanıcının rolünü güncelleyebiliyor (RLS)
-- Böylece promosyon uygulamadan yapılıyor ve denetim kaydına gerçek
-- kişi yazılıyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS talep_rol TEXT;

COMMENT ON COLUMN users.talep_rol IS
  'Kayıt sırasında seçilen rol. Güvenlik gereği doğrudan uygulanmaz; '
  'öğretmen talebi admin onayı bekler.';


-- ------------------------------------------------------------
-- 1) Kayıt tetikleyicisi talebi de yazsın
--    Rol belirleme mantığı AYNEN korunuyor (teacher dahil tanımsız her
--    değer student'a düşüyor); yalnızca ne istendiği kayda geçiyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.yeni_kullanici_olustur()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_istenen TEXT;
  v_rol     TEXT;
BEGIN
  v_istenen := COALESCE(NEW.raw_user_meta_data ->> 'role', 'student');
  v_rol := v_istenen;
  IF v_rol NOT IN ('student', 'parent') THEN
    v_rol := 'student';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, talep_rol)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email),
    v_rol,
    -- Talep yalnızca uygulanmayan bir şey istendiyse anlamlı
    CASE WHEN v_istenen <> v_rol THEN v_istenen END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.yeni_kullanici_olustur() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 2) Rol kilidi admine izin versin
--
-- Kilit yerinde kalıyor: kimse kendine ya da başkasına rol veremez.
-- Tek istisna admin. Admin'in kendisi de 'admin' rolü DAĞITAMIYOR —
-- ikinci bir yönetici açmak bilinçli bir karar olmalı ve SQL'den
-- yapılmalı, tek tıkla değil.
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
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.users_rol_koru() FROM PUBLIC, anon, authenticated;

-- Tetikleyici zaten kurulu; fonksiyon değişti, yeniden bağlamaya gerek yok.


-- ------------------------------------------------------------
-- 3) Admin başka kullanıcının satırını güncelleyebilsin
--    Mevcut politikalara DOKUNULMUYOR; üzerine ek bir izin politikası
--    geliyor (politikalar VEYA'lanır).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Admin kullanici gunceller" ON users;
CREATE POLICY "Admin kullanici gunceller" ON users
  FOR UPDATE TO authenticated
  USING (admin_mi()) WITH CHECK (admin_mi());

-- Admin bekleyen talepleri görebilsin diye okuma da gerekiyor.
-- users zaten giriş yapmış herkese okunabilir (davet akışı buna bağlı),
-- ek politika gerekmiyor — kontrol edildi.


-- ============================================================
-- DOĞRULAMA
--   SELECT email, role, talep_rol FROM users ORDER BY created_at;
--
--   Not: talep_rol yalnızca BU MIGRATION'DAN SONRAKİ kayıtlarda dolar.
--   Hâlihazırda öğrenci görünen koçlar için aşağıdaki tek satırla
--   talep işaretlenebilir, sonra uygulamadan onaylanır:
--
--     UPDATE users SET talep_rol = 'teacher'
--     WHERE email IN ('ornek@koc.com');
--
--   Ardından admin hesabıyla panelden "Öğretmen yap" denebilir ve
--   işlem denetim kaydına GERÇEK KİŞİ ADIYLA düşer (SQL Editor'den
--   yapılsaydı "sistem" görünürdü).
-- ============================================================
