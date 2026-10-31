-- ============================================================
-- Migration: users tablosunda e-posta artık herkese açık değil
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema.
-- ============================================================
--
-- ── RİSK ────────────────────────────────────────────────────
-- `users` tablosu giriş yapmış HERKESE tamamen açıktı: her öğrenci
-- bütün kullanıcıların adını, rolünü ve **e-posta adresini**
-- okuyabiliyordu. Kullanıcıların çoğu 18 yaş altı.
--
-- ── NEDEN SATIR DEĞİL SÜTUN KISITLANIYOR ────────────────────
-- Satır güvenliği (RLS) KOLON GİZLEMEZ. Ayrıca satırları daraltmak
-- uygulamayı kırardı: bağlantı kurmak için dizin gerekiyor — öğrenci
-- koçunu, koç öğrencisini, veli çocuğunu listeden seçiyor. Dizinin
-- kendisi işin gereği; e-postanın dizinde olması değil.
--
-- Kodda e-posta hiçbir EŞLEŞTİRMEDE kullanılmıyordu; yalnızca aynı
-- adlı kişileri ayırmak için ekrana yazılıyordu. O iş için maskeli
-- adres yetiyor (`a***@gmail.com`).
--
-- Çözüm üç parça:
--   1. Sütun düzeyinde izin: authenticated artık `email` ve
--      `talep_ogrenci_email` sütunlarını SEÇEMİYOR.
--   2. `kisi_dizini` görünümü: ad + rol + MASKELİ e-posta.
--   3. `yonetim_kullanicilari()`: gerçek e-postayı yalnız admin'e.
--
-- Kendi e-postasını kullanıcı zaten oturumdan okuyor
-- (`session.user.email`), tabloya bakmasına gerek yok.

-- ------------------------------------------------------------
-- 1) Maskeleme — SUNUCUDA
-- ------------------------------------------------------------
-- Maskeleme tarayıcıda yapılsaydı tam adres yine de tele inerdi ve
-- gizlemek sadece gösterimde kalırdı. Burada yapılınca tam adres
-- istemciye hiç ulaşmıyor.
CREATE OR REPLACE FUNCTION public.eposta_maskele(p_eposta TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN p_eposta IS NULL OR position('@' in p_eposta) < 2 THEN NULL
    ELSE left(p_eposta, 1) || '***@' || split_part(p_eposta, '@', 2)
  END;
$fn$;

GRANT EXECUTE ON FUNCTION public.eposta_maskele(TEXT) TO authenticated;

-- ------------------------------------------------------------
-- 2) Dizin görünümü
-- ------------------------------------------------------------
-- Görünüm SAHİBİ olarak çalışıyor (security_invoker verilmedi):
-- bilerek, çünkü maskeli sütunu üretmek için `email`'i okuması
-- gerekiyor ve çağıranın o sütunda izni YOK. Görünümün verdiği şey
-- maskeli adresten ibaret, tam adres dışarı çıkmıyor.
--
-- Satırlar bilerek dar değil: dizin zaten herkese görünür olmak
-- zorunda. Giriş yapmamış istek engelleniyor.
DROP VIEW IF EXISTS public.kisi_dizini;
CREATE VIEW public.kisi_dizini AS
  SELECT u.id, u.full_name, u.role, u.onay_durumu, u.kurum_id,
         public.eposta_maskele(u.email) AS eposta_maskeli
    FROM public.users u
   WHERE auth.uid() IS NOT NULL;

REVOKE ALL ON public.kisi_dizini FROM PUBLIC, anon;
GRANT SELECT ON public.kisi_dizini TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) Gerçek e-posta: yalnız admin
-- ------------------------------------------------------------
-- Rol yönetimi ekranı gerçek adrese muhtaç: velinin bildirdiği
-- `talep_ogrenci_email` ile öğrencinin adresini eşleştiriyor.
-- Maskeli adresle bu eşleştirme yapılamaz.
CREATE OR REPLACE FUNCTION public.yonetim_kullanicilari()
RETURNS TABLE (
  id UUID, full_name TEXT, email TEXT, role TEXT, talep_rol TEXT,
  onay_durumu TEXT, talep_ogrenci_email TEXT,
  kurum_id UUID, kurum_rolu TEXT, created_at TIMESTAMP
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT admin_mi() THEN
    RAISE EXCEPTION 'Yetkiniz yok.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT u.id, u.full_name, u.email, u.role, u.talep_rol,
           u.onay_durumu, u.talep_ogrenci_email,
           u.kurum_id, u.kurum_rolu, u.created_at
      FROM users u
     ORDER BY u.created_at DESC;
END $fn$;

REVOKE ALL ON FUNCTION public.yonetim_kullanicilari() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.yonetim_kullanicilari() TO authenticated;

-- ------------------------------------------------------------
-- 4) Sütun izinleri
-- ------------------------------------------------------------
-- Önce tablo geneli SELECT alınıyor, sonra izin verilen sütunlar
-- TEK TEK geri veriliyor. Listede OLMAYAN bir sütunu seçen sorgu
-- "permission denied" alıyor — sessizce boş dönmüyor, yani bir yer
-- atlanmışsa gürültüyle ortaya çıkıyor.
--
-- DIŞARIDA BIRAKILANLAR:
--   email               → dizinde maskeli, admin'de RPC ile
--   talep_ogrenci_email → BAŞKASININ adresi; en hassas alan
REVOKE SELECT ON public.users FROM authenticated;
GRANT  SELECT (id, full_name, role, onay_durumu, created_at,
               talep_rol, kurum_id, kurum_rolu, sifre_degistirmeli)
  ON public.users TO authenticated;

-- INSERT/UPDATE dokunulmadı: kayıt olurken kendi e-postasını yazmak
-- gerekiyor ve rol değişimini zaten `users_rol_koru` tetikleyicisi
-- denetliyor. service_role (sunucu) tam yetkisini koruyor.
GRANT SELECT ON public.users TO service_role;

-- PostgREST şema önbelleği yenilensin, yeni görünüm hemen görünsün.
NOTIFY pgrst, 'reload schema';

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  kisi UUID; maskeli TEXT; sayi INTEGER; gecen INTEGER := 0; red BOOLEAN;
BEGIN
  SELECT id INTO kisi FROM users WHERE role = 'student' LIMIT 1;
  IF kisi IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - ogrenci kaydi yok');
    RETURN;
  END IF;

  -- a) maskeleme bicimi
  IF eposta_maskele('ahmet.yilmaz@gmail.com') <> 'a***@gmail.com' THEN
    RAISE EXCEPTION 'SINAMA a: maskeleme bicimi yanlis (%)',
      eposta_maskele('ahmet.yilmaz@gmail.com');
  END IF;
  gecen := gecen + 1;

  -- b) bozuk girdide adres SIZMIYOR
  IF eposta_maskele('adressiz') IS NOT NULL
     OR eposta_maskele('@x.com') IS NOT NULL
     OR eposta_maskele(NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'SINAMA b: bozuk girdide maskeleme bos donmedi';
  END IF;
  gecen := gecen + 1;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', kisi)::text, true);

  -- c) ogrenci users.email'i SECEMIYOR
  red := false;
  BEGIN
    PERFORM email FROM users WHERE id = kisi;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: ogrenci e-postayi okuyabildi'; END IF;
  gecen := gecen + 1;

  -- d) baskasinin bildirdigi adres de kapali
  red := false;
  BEGIN
    PERFORM talep_ogrenci_email FROM users WHERE id = kisi;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: talep_ogrenci_email okunabildi'; END IF;
  gecen := gecen + 1;

  -- e) ad ve rol OKUNABILIYOR (dizin kirilmamali)
  SELECT count(*) INTO sayi FROM users WHERE id = kisi;
  IF sayi <> 1 THEN RAISE EXCEPTION 'SINAMA e: ad/rol okumasi kirildi'; END IF;
  gecen := gecen + 1;

  -- f) dizin maskeli adres veriyor
  SELECT eposta_maskeli INTO maskeli FROM kisi_dizini WHERE id = kisi;
  IF maskeli IS NULL OR position('***@' in maskeli) = 0 THEN
    RAISE EXCEPTION 'SINAMA f: dizinde maskeli adres yok (%)', maskeli;
  END IF;
  gecen := gecen + 1;

  -- g) ogrenci admin RPC'sini CAGIRAMIYOR
  red := false;
  BEGIN PERFORM count(*) FROM yonetim_kullanicilari();
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA g: ogrenci yonetim listesini aldi'; END IF;
  gecen := gecen + 1;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "users_sutun_izni" FROM _sinama_sonucu;
