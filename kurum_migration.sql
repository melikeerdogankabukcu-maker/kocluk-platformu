-- ============================================================
-- KURUM KATMANI
--
-- ── TASARIM ─────────────────────────────────────────────────────
-- Varsayılan: HER KOÇ KENDİ KURUMU. Tek koç = tek üyeli kurum.
-- Çok üyeli kurum (okul) mekanizması modelde hazır duruyor ama
-- kendiliğinden devreye girmiyor; bir okula satıldığında o kuruma
-- birden fazla öğretmen bağlanarak kullanılıyor.
--
-- Kullanıcı TEK kuruma ait (users.kurum_id). Üyelik tablosu yerine tek
-- kolon: her sorgu doğrudan süzülüyor, "şu an hangi kurum adına
-- çalışıyorum" sorusu hiç doğmuyor. İleride üyelik tablosuna geçmek
-- mümkün, tersi zor değil.
--
-- users.role (student/teacher/parent/admin) PLATFORM rolü olarak
-- duruyor; kurum_rolu ise kurum içi (yonetici/uye). İkisi ayrı:
-- platform yöneticisi tüm kurumları, kurum yöneticisi yalnızca kendi
-- kurumunu yönetir.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS kurumlar (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad         TEXT NOT NULL,
  tur        TEXT NOT NULL DEFAULT 'bireysel',
  sahip_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.kurumlar'::regclass AND conname = 'kurumlar_tur_check') THEN
    ALTER TABLE kurumlar ADD CONSTRAINT kurumlar_tur_check
      CHECK (tur IN ('bireysel', 'okul'));
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS kurum_id   UUID REFERENCES kurumlar(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kurum_rolu TEXT NOT NULL DEFAULT 'uye';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.users'::regclass AND conname = 'users_kurum_rolu_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_kurum_rolu_check
      CHECK (kurum_rolu IN ('yonetici', 'uye'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_kurum ON users (kurum_id);


-- ------------------------------------------------------------
-- 1) Mevcut koçlar için birer kurum
--    Her teacher/admin kendi kurumunun yöneticisi oluyor.
--    Zaten kurumu olan atlanıyor (migration tekrar çalıştırılabilsin).
-- ------------------------------------------------------------
DO $$
DECLARE k RECORD; yeni UUID;
BEGIN
  FOR k IN SELECT id, full_name FROM users
           WHERE role IN ('teacher', 'admin') AND kurum_id IS NULL
  LOOP
    INSERT INTO kurumlar (ad, tur, sahip_id)
    VALUES (COALESCE(NULLIF(TRIM(k.full_name), ''), 'Kurum'), 'bireysel', k.id)
    RETURNING id INTO yeni;

    UPDATE users SET kurum_id = yeni, kurum_rolu = 'yonetici' WHERE id = k.id;
  END LOOP;
END $$;


-- ------------------------------------------------------------
-- 2) Öğrenciler koçlarının kurumuna
--    Birden fazla koçu olan öğrenci ilk onaylı koçunun kurumuna
--    giriyor. Bu bir tercih: öğrenci tek kuruma ait olmak zorunda,
--    ve verisine erişim zaten teacher_students ile belirleniyor —
--    kurum onu daraltıyor, genişletmiyor.
-- ------------------------------------------------------------
UPDATE users u
SET kurum_id = k.kurum_id
FROM (
  SELECT DISTINCT ON (ts.student_id) ts.student_id, o.kurum_id
  FROM teacher_students ts
  JOIN users o ON o.id = ts.teacher_id
  WHERE ts.durum = 'onaylandi' AND o.kurum_id IS NOT NULL
  ORDER BY ts.student_id, ts.created_at
) k
WHERE u.id = k.student_id AND u.kurum_id IS NULL;


-- ------------------------------------------------------------
-- 3) Veliler çocuklarının kurumuna
-- ------------------------------------------------------------
UPDATE users u
SET kurum_id = c.kurum_id
FROM (
  SELECT DISTINCT ON (fl.parent_id) fl.parent_id, o.kurum_id
  FROM family_links fl
  JOIN users o ON o.id = fl.student_id
  WHERE o.kurum_id IS NOT NULL
  ORDER BY fl.parent_id
) c
WHERE u.id = c.parent_id AND u.kurum_id IS NULL;


-- ------------------------------------------------------------
-- 4) Kimsesiz kalanlar platform sahibinin kurumuna
--    Hiçbir koça bağlı olmayan öğrenci kurumsuz kalırsa hiçbir
--    müfredat göremez. Bir kuruma koymak, dışarıda bırakmaktan iyi.
-- ------------------------------------------------------------
UPDATE users
SET kurum_id = (
  SELECT kurum_id FROM users
  WHERE role = 'admin' AND kurum_id IS NOT NULL
  ORDER BY created_at LIMIT 1
)
WHERE kurum_id IS NULL;


-- ------------------------------------------------------------
-- 5) Standart müfredat gömülü hale getiriliyor
--
-- ŞU AN sahip_id'si NULL olan TEK BİR KONU YOK: 535 konunun tamamı
-- yönetici hesabına bağlı (müfredatlar o hesaba bağlanarak yüklenmişti).
-- Bu haliyle "gömülü olan herkese açık" kuralı uygulanırsa diğer koçlar
-- HİÇ müfredat göremez.
--
-- Ayrım tarihten çıkıyor ve birebir doğrulandı:
--   2026-08-04 -> 312  ilk TYT/AYT yüklemesi
--   2026-08-18 ->   1  ELLE eklenmiş ("TYT/Matematik/Problem")
--   2026-08-19 -> 170  mufredat_kpss_lgs_dgs_migration.sql (tam 170 satır)
--   2026-08-21 ->  52  ayt_sosyal2_migration.sql (tam 52 satır)
--
-- 18 Ağustos'takiler hariç hepsi platformun ortak müfredatı oluyor.
-- Aşağıdaki sayı denetimi bilinçli: veri bu analizden sonra değiştiyse
-- migration SESSİZCE birinin kendi yazdığı konuları herkese açmasın,
-- gürültüyle dursun.
-- ------------------------------------------------------------
DO $$
DECLARE n INTEGER;
BEGIN
  SELECT count(*) INTO n FROM exam_topics
  WHERE sahip_id IS NOT NULL
    AND NOT (created_at >= DATE '2026-08-18' AND created_at < DATE '2026-08-19');

  IF n <> 534 THEN
    RAISE EXCEPTION
      'Beklenen 534 standart konu, bulunan %. Veri degismis olabilir; '
      'elle eklenen konular yanlislikla herkese acilmasin diye durduruldu.', n;
  END IF;

  UPDATE exam_topics SET sahip_id = NULL
  WHERE sahip_id IS NOT NULL
    AND NOT (created_at >= DATE '2026-08-18' AND created_at < DATE '2026-08-19');

  RAISE NOTICE '% standart konu gomulu yapildi (herkese acik).', n;
END $$;


-- ------------------------------------------------------------
-- 6) Yardımcılar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kurumum()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kurum_id FROM users WHERE id = auth.uid();
$$;

-- Politika içinden çağrılacağı için PUBLIC'ten alınmıyor: sorguyu yapan
-- rolün EXECUTE yetkisi olmazsa politika değerlendirilemez ve sorgu boş
-- sonuç yerine HATA döner (ogrencim_mi'de aynı sebeple böyle bırakılmış).
-- Sızıntı yolu değil: auth.uid()'e bakıp tek bir uuid dönüyor.
GRANT EXECUTE ON FUNCTION public.kurumum() TO authenticated;

CREATE OR REPLACE FUNCTION public.kurum_yoneticisi_mi()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND kurum_rolu = 'yonetici' AND kurum_id IS NOT NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.kurum_yoneticisi_mi() TO authenticated;


-- ------------------------------------------------------------
-- 7) kurumlar RLS
--    Kişi kendi kurumunu görür; platform yöneticisi hepsini yönetir.
--    Kurum adı gizli bir bilgi değil ama başka kurumların listesini
--    görmenin de bir gereği yok.
-- ------------------------------------------------------------
ALTER TABLE kurumlar ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'kurumlar'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.kurumlar', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "Kisi kendi kurumunu gorur" ON kurumlar
  FOR SELECT TO authenticated USING (id = kurumum());

CREATE POLICY "Kurum yoneticisi kurumunu duzenler" ON kurumlar
  FOR UPDATE TO authenticated
  USING (id = kurumum() AND kurum_yoneticisi_mi())
  WITH CHECK (id = kurumum() AND kurum_yoneticisi_mi());

CREATE POLICY "Platform yoneticisi kurumlari yonetir" ON kurumlar
  FOR ALL TO authenticated
  USING (admin_mi()) WITH CHECK (admin_mi());


-- ------------------------------------------------------------
-- 8) kurum_id ve kurum_rolu ayrıcalıklı kolonlar
--    Kişi kendi satırını güncelleyebiliyor (profil düzenleme); kurumunu
--    kendi değiştirebilseydi başka bir kurumun müfredatına ve öğrenci
--    havuzuna kendini taşırdı. Rol kilidi tetikleyicisi genişletiliyor.
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

  IF NEW.onay_durumu IS DISTINCT FROM OLD.onay_durumu AND NOT admin_mi() THEN
    RAISE EXCEPTION 'Hesap onayi yalnizca yonetici tarafindan degistirilebilir.';
  END IF;

  -- Kurum değişimi: platform yöneticisi serbest; kurum yöneticisi yalnızca
  -- KENDİ kurumuna taşıyabilir (üye alma). Kimse kendini taşıyamaz.
  IF NEW.kurum_id IS DISTINCT FROM OLD.kurum_id THEN
    IF NOT (admin_mi() OR (kurum_yoneticisi_mi() AND NEW.kurum_id = kurumum())) THEN
      RAISE EXCEPTION 'Kurum degisikligi yalnizca yonetici tarafindan yapilabilir.';
    END IF;
  END IF;

  IF NEW.kurum_rolu IS DISTINCT FROM OLD.kurum_rolu THEN
    IF NOT (admin_mi() OR (kurum_yoneticisi_mi() AND OLD.kurum_id = kurumum())) THEN
      RAISE EXCEPTION 'Kurum rolu yalnizca yonetici tarafindan degistirilebilir.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.users_rol_koru() FROM PUBLIC, anon, authenticated;

-- Tetikleyici yeni kolonları da dinlemeli; listede olmayan kolon
-- degisince tetikleyici HIC calismaz ve koruma yazilmis ama
-- isletilmemis olur.
DROP TRIGGER IF EXISTS users_rol_kilidi ON users;
CREATE TRIGGER users_rol_kilidi
  BEFORE UPDATE OF role, onay_durumu, kurum_id, kurum_rolu ON users
  FOR EACH ROW EXECUTE FUNCTION users_rol_koru();


-- ============================================================
-- DOĞRULAMA
--
-- 1) Kurumlar ve üyeleri:
--      SELECT k.ad, k.tur, count(u.id) AS uye
--      FROM kurumlar k LEFT JOIN users u ON u.kurum_id = k.id
--      GROUP BY k.id, k.ad, k.tur ORDER BY k.ad;
--
-- 2) Kurumsuz kimse kalmamalı (0 dönmeli):
--      SELECT count(*) FROM users WHERE kurum_id IS NULL;
--
-- 3) Müfredat:
--      SELECT sahip_id IS NULL AS gomulu, count(*)
--      FROM exam_topics GROUP BY 1;
--      -- gomulu=true 534, gomulu=false 1 olmalı
--
-- 4) Her koç kendi kurumunun yöneticisi:
--      SELECT full_name, role, kurum_rolu FROM users
--      WHERE role IN ('teacher','admin');
-- ============================================================
