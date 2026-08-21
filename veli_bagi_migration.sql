-- ============================================================
-- VELİ ↔ ÖĞRENCİ BAĞI
--
-- ── SORUN ───────────────────────────────────────────────────────
-- family_links tablosu var ve iki panelde OKUNUYOR, ama uygulamada bu
-- tabloya YAZAN hiçbir yer yok. Veli paneli "Öğretmeninizden hesabınızı
-- bağlamasını isteyin" diyor; öğretmende ise böyle bir düğme hiç yok.
-- Çıkmaz sokak: tablo bugüne kadar boş kaldı.
--
-- ── ÇÖZÜM ───────────────────────────────────────────────────────
-- Veli kayıt olurken çocuğunun e-postasını yazıyor. Yönetici onay
-- ekranında bunun hangi öğrenciye denk geldiğini AD olarak görüyor;
-- yanlış e-posta anında belli oluyor. Onayla'ya bastığında hesap onayı
-- ve veli-öğrenci bağı AYNI İŞLEMDE kuruluyor.
--
-- Öğrenciyi yöneticinin AÇIKÇA seçmesi bilinçli: velinin yazdığı
-- e-posta yalnızca ön-doldurma. Sunucu o an users tablosundan okusaydı,
-- veli yöneticinin ekranı görmesiyle tıklaması arasında değeri
-- değiştirip başka bir öğrenciye bağlanabilirdi.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS talep_ogrenci_email TEXT;

COMMENT ON COLUMN users.talep_ogrenci_email IS
  'Veli kaydında bildirilen çocuk e-postası. Yalnızca yöneticiye öneri '
  'olarak gösterilir; bağı kuran şey yöneticinin seçimidir.';


-- Aynı çift iki kez yazılmasın. Yönetici çift tıklarsa ya da elle bağlama
-- kartından tekrar denenirse ikinci satır oluşmamalı: ParentDashboard
-- links[0] alıyor, kopya satırlar sessiz karışıklık yaratırdı.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.family_links'::regclass
      AND conname  = 'family_links_benzersiz'
  ) THEN
    ALTER TABLE family_links
      ADD CONSTRAINT family_links_benzersiz UNIQUE (parent_id, student_id);
  END IF;
END $$;


-- ------------------------------------------------------------
-- 1) Kayıt tetikleyicisi çocuk e-postasını da saklasın
--    Rol belirleme ve yönetici bildirimi AYNEN duruyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.yeni_kullanici_olustur()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_istenen TEXT;
  v_rol     TEXT;
  v_ad      TEXT;
  v_talep   TEXT;
  v_cocuk   TEXT;
BEGIN
  v_istenen := COALESCE(NEW.raw_user_meta_data ->> 'role', 'student');
  v_rol := v_istenen;
  IF v_rol NOT IN ('student', 'parent') THEN
    v_rol := 'student';
  END IF;
  v_talep := CASE WHEN v_istenen <> v_rol THEN v_istenen END;
  v_ad := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email);

  -- Yalnızca veli kaydında anlamlı. Karşılaştırma küçük harfle yapılacağı
  -- için burada normalleştiriliyor.
  v_cocuk := CASE WHEN v_rol = 'parent'
    THEN NULLIF(LOWER(TRIM(NEW.raw_user_meta_data ->> 'ogrenci_email')), '') END;

  INSERT INTO public.users (id, email, full_name, role, talep_rol, talep_ogrenci_email)
  VALUES (NEW.id, NEW.email, v_ad, v_rol, v_talep, v_cocuk)
  ON CONFLICT (id) DO NOTHING;

  PERFORM bildirim_ekle(
    u.id,
    'kayit',
    'Yeni kayıt: ' || v_ad,
    CASE
      WHEN v_talep = 'teacher' THEN 'Öğretmen olarak kaydolmak istiyor. Onayınızı bekliyor.'
      WHEN v_cocuk IS NOT NULL THEN 'Veli kaydı — çocuk: ' || v_cocuk || '. Onayınızı bekliyor.'
      ELSE 'Yeni hesap onayınızı bekliyor.'
    END,
    NEW.id
  )
  FROM public.users u WHERE u.role = 'admin';

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.yeni_kullanici_olustur() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 2) family_links okuma politikaları
--
-- Tablo panelden oluşturulmuş, politikaları hiçbir migration dosyasında
-- yok. Adlarını bilmediğimiz için hepsi dökülüp yeniden yazılıyor.
--
-- YAZMA POLİTİKASI BİLİNÇLİ OLARAK YOK: bütün ekleme/silme aşağıdaki
-- SECURITY DEFINER fonksiyonlarından geçiyor. Böylece "kim kimi
-- bağlayabilir" kuralı tek yerde duruyor; istemciden doğrudan insert
-- edilemiyor.
-- ------------------------------------------------------------
ALTER TABLE family_links ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'family_links'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.family_links', p.policyname);
  END LOOP;
END $$;

-- Veli kendi bağını görür (ParentDashboard bununla çocuğu buluyor)
CREATE POLICY "Veli kendi bagini gorur" ON family_links
  FOR SELECT TO authenticated USING (parent_id = auth.uid());

-- Öğrenci kendi velisini görür: verisini kimin görebildiğini bilmeli
CREATE POLICY "Ogrenci kendi velisini gorur" ON family_links
  FOR SELECT TO authenticated USING (student_id = auth.uid());

-- Öğretmen yalnızca ONAYLI öğrencisinin velisini görür (mesajlaşma listesi)
CREATE POLICY "Ogretmen ogrencisinin velisini gorur" ON family_links
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM teacher_students ts
      WHERE ts.student_id = family_links.student_id
        AND ts.teacher_id = auth.uid()
        AND ts.durum = 'onaylandi'
    )
  );

CREATE POLICY "Yonetici tum baglari gorur" ON family_links
  FOR SELECT TO authenticated USING (admin_mi());


-- ------------------------------------------------------------
-- 3) Bağı kuran/kaldıran fonksiyonlar
--
-- Yetki: yönetici herkesi; öğretmen YALNIZCA kendi onaylı öğrencisini.
-- Öğretmenin de bağlayabilmesi gerekli — yanlış e-posta yazılmış ya da
-- ikinci çocuk eklenecekse yöneticiyi beklemek zorunda kalmasın.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.veli_bagi_yetkim_var(p_ogrenci UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT admin_mi() OR EXISTS (
    SELECT 1 FROM teacher_students ts
    WHERE ts.student_id = p_ogrenci
      AND ts.teacher_id = auth.uid()
      AND ts.durum = 'onaylandi'
  );
$$;

CREATE OR REPLACE FUNCTION public.veli_bagi_kur(p_veli UUID, p_ogrenci UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_veli_adi    TEXT;
  v_ogrenci_adi TEXT;
BEGIN
  IF p_veli IS NULL OR p_ogrenci IS NULL THEN
    RAISE EXCEPTION 'Veli ve ogrenci secilmeli.';
  END IF;
  IF NOT veli_bagi_yetkim_var(p_ogrenci) THEN
    RAISE EXCEPTION 'Bu ogrenci icin veli baglama yetkiniz yok.';
  END IF;

  -- Rolleri doğrula: yanlış tarafa bağlamak veriyi sessizce açardı
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_veli AND role = 'parent') THEN
    RAISE EXCEPTION 'Secilen kisi veli degil.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_ogrenci AND role = 'student') THEN
    RAISE EXCEPTION 'Secilen kisi ogrenci degil.';
  END IF;

  INSERT INTO family_links (parent_id, student_id)
  VALUES (p_veli, p_ogrenci)
  ON CONFLICT (parent_id, student_id) DO NOTHING;

  SELECT kisi_adi(p_veli), kisi_adi(p_ogrenci) INTO v_veli_adi, v_ogrenci_adi;

  -- İki tarafa da haber ver. Öğrencinin, verisini kimin görebildiğini
  -- öğrenmesi bir nezaket değil; bilmesi gereken bir şey.
  PERFORM bildirim_ekle(p_veli, 'baglanti', 'Öğrenci bağlantısı kuruldu',
    v_ogrenci_adi || ' hesabınıza bağlandı.', p_ogrenci);
  PERFORM bildirim_ekle(p_ogrenci, 'baglanti', 'Veli hesabı bağlandı',
    v_veli_adi || ' artık gelişim bilgilerinizi görebilir.', p_veli);
END $$;

CREATE OR REPLACE FUNCTION public.veli_bagi_kaldir(p_veli UUID, p_ogrenci UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT veli_bagi_yetkim_var(p_ogrenci) THEN
    RAISE EXCEPTION 'Bu ogrenci icin veli baglantisi kaldirma yetkiniz yok.';
  END IF;
  DELETE FROM family_links WHERE parent_id = p_veli AND student_id = p_ogrenci;
END $$;


-- ------------------------------------------------------------
-- 4) Hesap onayı — veli ise bağı aynı işlemde kur
--
-- Tek fonksiyon: onay ve bağ AYRI iki istek olsaydı biri tutup diğeri
-- başarısız olabilir, veli onaylı ama çocuksuz kalırdı. Tam da
-- kaçınmak istediğimiz durum.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hesap_onayla(p_kisi UUID, p_ogrenci UUID DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT admin_mi() THEN
    RAISE EXCEPTION 'Hesap onayi yalnizca yonetici tarafindan yapilabilir.';
  END IF;

  UPDATE users SET onay_durumu = 'onaylandi' WHERE id = p_kisi;

  IF p_ogrenci IS NOT NULL THEN
    PERFORM veli_bagi_kur(p_kisi, p_ogrenci);
  END IF;
END $$;


-- PostgreSQL yeni fonksiyonlara EXECUTE'u otomatik olarak PUBLIC'e verir.
-- GRANT ... TO authenticated tek başına YETMEZ; önce PUBLIC'ten alınmalı,
-- yoksa anon anahtarla dışarıdan çağrılabilir kalır.
REVOKE ALL ON FUNCTION public.veli_bagi_yetkim_var(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.veli_bagi_kur(UUID, UUID)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.veli_bagi_kaldir(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hesap_onayla(UUID, UUID)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.veli_bagi_yetkim_var(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.veli_bagi_kur(UUID, UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.veli_bagi_kaldir(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hesap_onayla(UUID, UUID)   TO authenticated;


-- ============================================================
-- DOĞRULAMA
--
-- 1) Politikalar (5 satır SELECT beklenir, yazma politikası OLMAMALI):
--      SELECT policyname, cmd FROM pg_policies
--      WHERE tablename = 'family_links' ORDER BY policyname;
--
-- 2) anon çağıramamalı — anon anahtarla şunu denerseniz 401/403 gelmeli:
--      POST /rest/v1/rpc/veli_bagi_kur
--
-- 3) Yeni bir veli kaydından sonra:
--      SELECT email, role, onay_durumu, talep_ogrenci_email
--      FROM users WHERE role = 'parent';
--
-- 4) Onaydan sonra bağ:
--      SELECT v.email AS veli, o.email AS ogrenci
--      FROM family_links f
--      JOIN users v ON v.id = f.parent_id
--      JOIN users o ON o.id = f.student_id;
--
-- NOT: Hâlihazırda kayıtlı veli (melikeerdogankabukcu@gmail.com) kayıt
-- akışından geçmediği için çocuk e-postası boş. Onun bağı öğretmen
-- panelindeki "Veli Bağlantıları" kartından elle kurulacak.
-- ============================================================
