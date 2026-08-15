-- ============================================================
-- KAYIT AKIŞI — profil satırını istemci değil tetikleyici oluştursun
--
-- BULGU: E-posta onayı açılınca kayıt tamamen bozuldu.
--
-- Onay kapalıyken supabase.auth.signUp() hem kullanıcıyı hem OTURUMU
-- döndürüyordu, bu yüzden hemen ardından gelen users insert'i giriş
-- yapmış kullanıcı olarak çalışıyordu. Onay açıkken signUp artık
-- session: null döndürüyor — kullanıcı bağlantıya tıklayana kadar
-- kimliksiz. Sonuç:
--
--   src/Auth.jsx:32  users insert'i ANON olarak çalışır, RLS reddeder
--                    (dönüş değeri kontrol edilmiyordu, hata yutuluyordu)
--   src/Auth.jsx:38  onLogin() yine de çağrılır, uygulama giriş yapılmış
--                    sanır ama oturum yoktur
--
-- Yani auth hesabı oluşur, profil satırı oluşmaz. Kişi e-postasını
-- onaylayıp giriş yapınca uygulamada karşılığı olmayan bir hesapla kalır.
--
-- ÇÖZÜM: profil satırını auth.users üzerindeki tetikleyici oluştursun.
-- Bu Supabase'in standart yaklaşımı ve iki ek faydası var:
--   1) Oturum olsun olmasın satır her zaman oluşur.
--   2) Rol SUNUCUDA belirlenir. İstemci ne gönderirse göndersin
--      teacher olamaz — rol_guvenligi_migration.sql'deki kilidi
--      tamamlar, orada RLS ile engellenen şey burada kaynağında biter.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.yeni_kullanici_olustur()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol TEXT;
BEGIN
  -- Rol istemciden metadata olarak gelir ama BURADA doğrulanır.
  -- teacher dahil tanımsız her değer student'a düşer; öğretmen yetkisi
  -- yalnızca veritabanı yöneticisi tarafından verilir.
  v_rol := COALESCE(NEW.raw_user_meta_data ->> 'role', 'student');
  IF v_rol NOT IN ('student', 'parent') THEN
    v_rol := 'student';
  END IF;

  INSERT INTO public.users (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email),
    v_rol
  )
  ON CONFLICT (id) DO NOTHING;   -- tekrar tetiklenirse çakışmasın

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.yeni_kullanici_olustur() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.yeni_kullanici_olustur();


-- ------------------------------------------------------------
-- Profili olmayan mevcut hesaplar varsa tamamla
-- (onay açıldıktan sonra kaydolup profili oluşmamış olabilecekler)
-- ------------------------------------------------------------
INSERT INTO public.users (id, email, full_name, role)
SELECT
  a.id,
  a.email,
  COALESCE(NULLIF(TRIM(a.raw_user_meta_data ->> 'full_name'), ''), a.email),
  CASE WHEN COALESCE(a.raw_user_meta_data ->> 'role', 'student') IN ('student','parent')
       THEN a.raw_user_meta_data ->> 'role' ELSE 'student' END
FROM auth.users a
LEFT JOIN public.users u ON u.id = a.id
WHERE u.id IS NULL;


-- ============================================================
-- Doğrulama:
--   SELECT count(*) FROM auth.users;      -- iki sayı eşit olmalı
--   SELECT count(*) FROM public.users;
--
--   SELECT a.email, u.role
--   FROM auth.users a LEFT JOIN public.users u ON u.id = a.id
--   ORDER BY a.created_at DESC LIMIT 5;
--
-- Bundan sonra src/Auth.jsx artık users tablosuna insert YAPMAMALI;
-- rolü ve adı signUp metadata'sıyla göndermeli. Kod tarafı ayrıca
-- güncellendi.
-- ============================================================
