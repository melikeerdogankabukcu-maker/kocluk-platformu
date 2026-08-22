-- ============================================================
-- VELİ → ÖĞRETMEN MESAJLAŞMASI
--
-- ── SORUN ───────────────────────────────────────────────────────
-- Veli panelinde "Henüz mesajlaşabileceğiniz kimse yok" yazıyordu.
-- Veri sağlamdı: veli-çocuk bağı vardı, çocuğun onaylı öğretmeni vardı.
--
-- İki kural birbirinden habersizdi:
--   mesajlasabilir_mi()  veli↔öğretmen durumunu ZATEN biliyor → YAZMA açık
--   teacher_students SELECT politikası:
--       auth.uid() = teacher_id OR auth.uid() = student_id
--   Veli bunların hiçbiri değil → kişi listesi sorgusu HATASIZ ama BOŞ
--       dönüyor → liste boş → "kimse yok".
-- Yani izin vardı, yalnızca karşı taraf LİSTELENEMİYORDU.
--
-- ── SONSUZ DÖNGÜ TUZAĞI ─────────────────────────────────────────
-- Bariz çözüm, teacher_students'a "veli çocuğunun satırlarını görsün"
-- politikası eklemek. DOĞRUDAN yapılırsa:
--     teacher_students politikası → family_links'i sorgular
--     family_links politikası     → teacher_students'ı sorgular
-- PostgreSQL bunu 42P17 (infinite recursion detected in policy) ile
-- reddeder ve İKİ TABLO DA okunamaz hale gelir — öğretmen paneli de
-- çöker, yani düzeltmeye çalıştığımızdan büyük bir arıza çıkar.
--
-- Zincir SECURITY DEFINER yardımcılarla kırılıyor: fonksiyon tablo
-- sahibi olarak çalıştığı için içindeki sorgu RLS'e girmiyor, döngü
-- kapanmadan duruyor. Aynı desen mesajlasabilir_mi'de zaten kullanılıyor.
--
-- Ek olarak family_links'in öğretmen politikası da satır içi sorgudan
-- yardımcıya çevriliyor: çapraz gönderme iki taraftan da kalksın,
-- ileride birinin politikası değişince tuzak yeniden kurulmasın.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- Bu öğrenci benim çocuğum mu? (veli için)
CREATE OR REPLACE FUNCTION public.cocugum_mu(p_ogrenci UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_links
    WHERE student_id = p_ogrenci AND parent_id = auth.uid()
  );
$$;

-- Bu öğrenci benim onaylı öğrencim mi? (öğretmen için)
CREATE OR REPLACE FUNCTION public.ogrencim_mi(p_ogrenci UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM teacher_students
    WHERE student_id = p_ogrenci
      AND teacher_id = auth.uid()
      AND durum = 'onaylandi'
  );
$$;

REVOKE ALL ON FUNCTION public.cocugum_mu(UUID)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ogrencim_mi(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cocugum_mu(UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ogrencim_mi(UUID) TO authenticated;


-- ------------------------------------------------------------
-- Veli, çocuğunun ONAYLI öğretmenlerini görebilsin
--
-- Mevcut politikalara DOKUNULMUYOR; üzerine ekleniyor (politikalar
-- VEYA'lanır). Yalnızca 'onaylandi' satırlar: bekleyen ya da reddedilmiş
-- bağlantı teklifleri velinin işi değil.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Veli cocugunun ogretmenlerini gorur" ON teacher_students;
CREATE POLICY "Veli cocugunun ogretmenlerini gorur" ON teacher_students
  FOR SELECT TO authenticated
  USING (durum = 'onaylandi' AND cocugum_mu(student_id));


-- ------------------------------------------------------------
-- family_links: öğretmen politikası yardımcıya çevriliyor
-- Davranış birebir aynı; yalnızca satır içi teacher_students sorgusu
-- kalkıyor ki karşılıklı gönderme kalmasın.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Ogretmen ogrencisinin velisini gorur" ON family_links;
CREATE POLICY "Ogretmen ogrencisinin velisini gorur" ON family_links
  FOR SELECT TO authenticated
  USING (ogrencim_mi(student_id));


-- Aynı kural artık tek yerde; kopyası kalmasın
CREATE OR REPLACE FUNCTION public.veli_bagi_yetkim_var(p_ogrenci UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT admin_mi() OR ogrencim_mi(p_ogrenci);
$$;

REVOKE ALL ON FUNCTION public.veli_bagi_yetkim_var(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.veli_bagi_yetkim_var(UUID) TO authenticated;


-- ------------------------------------------------------------
-- KENDİ KENDİNİ TEST — döngü kurulduysa BURADA patlasın
--
-- SECURITY DEFINER'ın RLS'i atlaması, fonksiyon sahibinin tablo sahibi
-- olmasına bağlı. Bunu varsaymak yerine ölçüyoruz.
--
-- Testin 'authenticated' rolüne geçmesi şart: SQL Editor superuser
-- olarak çalışır ve superuser RLS'i tamamen atlar, yani buradan yapılan
-- düz bir SELECT hiçbir şey kanıtlamaz — döngü varken bile temiz döner.
--
-- SQL Editor her şeyi TEK transaction'da çalıştırdığı için, burada
-- 42P17 alınırsa yukarıdaki her şey geri alınır ve veritabanı bu
-- migration'dan önceki haline döner. Yani en kötü ihtimalde hiçbir şey
-- değişmez; iki tablonun birden okunamaz kalması mümkün değil.
-- ------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO n FROM teacher_students;
  SELECT count(*) INTO n FROM family_links;

  RESET ROLE;
  RAISE NOTICE 'Dongu testi GECTI: iki tablo da authenticated rolüyle okunabiliyor.';
END $$;


-- ============================================================
-- DOĞRULAMA
--
-- 1) Yukarıdaki DO bloğu "Dongu testi GECTI" yazdıysa döngü yok.
--    Elle de bakmak isterseniz (42P17 gelmemeli):
--      SET LOCAL ROLE authenticated;
--      SELECT count(*) FROM teacher_students;
--      RESET ROLE;
--
-- 2) Politika eklendi:
--      SELECT policyname, cmd, qual FROM pg_policies
--      WHERE tablename = 'teacher_students' ORDER BY policyname;
--
-- 3) Asıl test uygulamadan: veli hesabıyla girip Mesajlar kartında
--    çocuğunun öğretmeninin görünmesi ve mesaj gidebilmesi.
--
-- NOT: mesajlasabilir_mi() DEĞİŞTİRİLMEDİ — veli↔öğretmen iznini zaten
-- doğru veriyordu. Eksik olan tek şey listeleme idi.
-- ============================================================
