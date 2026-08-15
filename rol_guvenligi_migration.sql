-- ============================================================
-- ROL GÜVENLİĞİ — kendine öğretmen yetkisi verilmesini engelle
--
-- BULGU: Kayıt ekranında rol istemciden seçiliyor ve doğrudan users
-- tablosuna yazılıyor (src/Auth.jsx). E-posta onayı da kapalı olduğu için
-- siteye giren herkes "Öğretmen"i seçip anında öğretmen yetkisi alabiliyor.
--
-- Öğretmen yetkisi şunları açıyor ve bu politikaların HİÇBİRİ "kendi
-- öğrencisi mi" diye sormuyor:
--   student_profiles      -> tüm öğrencilerin telefonu, doğum tarihi,
--                            okulu, veli adı/telefonu/e-postası
--   exam_results          -> FOR ALL (okuma + değiştirme + SİLME)
--   homework_submissions  -> FOR ALL
--   test_sessions         -> okuma
--   exam_topics           -> FOR ALL
--   study_programs        -> FOR ALL
--
-- Bu migration rolü kilitliyor. Politikaların kendisi ayrı bir iş olarak
-- daraltılmalı (aşağıdaki nota bakın) ama asıl kapıyı bu kapatıyor.
--
-- YAKLAŞIM: Mevcut politikalara dokunulmuyor. Bunun yerine RESTRICTIVE
-- politika ekleniyor — normal politikalar VEYA'lanırken restrictive olan
-- VE'lenir, yani var olan erişimi bozmadan üzerine şart koyar.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Kayıt sırasında kendine öğretmen rolü verilemesin
--    Öğrenci ve veli kendi kaydını açmaya devam eder.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Kendine ogretmen rolu verilemez" ON users;
CREATE POLICY "Kendine ogretmen rolu verilemez" ON users
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (role IN ('student', 'parent'));

-- ------------------------------------------------------------
-- 2) Rol sonradan değiştirilemesin
--    Politika yerine tetikleyici kullanılıyor: UPDATE politikasında eski
--    satırla yeniyi karşılaştırmak zahmetli, tetikleyicide OLD/NEW hazır.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION users_rol_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Rol degistirilemez. Ogretmen yetkisi yalnizca veritabani yoneticisi tarafindan verilir.';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.users_rol_koru() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS users_rol_kilidi ON users;
CREATE TRIGGER users_rol_kilidi
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION users_rol_koru();


-- ============================================================
-- ÖĞRETMEN EKLEMEK GEREKİRSE
-- Artık arayüzden yapılamıyor; buradan, elle:
--
--   ALTER TABLE users DISABLE TRIGGER users_rol_kilidi;
--   UPDATE users SET role = 'teacher' WHERE email = 'yeni@ogretmen.com';
--   ALTER TABLE users ENABLE TRIGGER users_rol_kilidi;
--
-- Mevcut öğretmen hesabı (melike erdoğan kabukcu) etkilenmez; bu migration
-- yalnızca yeni kayıtları ve rol değişikliklerini kısıtlar.
-- ============================================================

-- Doğrulama:
--   SELECT role, count(*) FROM users GROUP BY role;
--   -- Yeni kayıtta "Öğretmen" seçilirse insert 403 ile reddedilmeli.


-- ============================================================
-- SONRAKİ ADIM (bu dosyada YAPILMADI — ayrı ele alınmalı)
--
-- Yukarıdaki politikalar hâlâ "öğretmen olan herkes tüm öğrencileri
-- görür" diyor. Platformda tek öğretmen olduğu sürece pratik bir sorun
-- değil, ama ikinci bir koç eklendiği anda o koç diğerinin öğrencilerini
-- görmeye başlar. Kalıcı çözüm politikaları ogrencim_mi(student_id) ile
-- daraltmak; student_profiles için ogrencim_mi(id).
--
-- Bu değişiklik öğretmen panelini bozabileceği için her sorgu tek tek
-- kontrol edilerek yapılmalı.
-- ============================================================
