-- ============================================================
-- HAFTALIK ÇALIŞMA PLANI
--
-- Görev sisteminin YANINDA, ondan ayrı bir yapı. Görev tek seferlik,
-- tarihi olan bir iş; plan ise haftanın gün × zaman dilimi ızgarasına
-- yerleştirilmiş çalışma blokları. Koç her hafta sürükle-bırakla
-- düzenliyor, öğrenci blokları "yaptım" diye işaretliyor.
--
-- Mevcut study_programs / program_atamalari ile KARIŞTIRILMAMALI:
-- onlar hazır, haftası numaralı sabit şablonlar. Bu tablo her hafta
-- elle şekillenen, öğrenciye özel plan.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. Plan: öğrenci başına hafta başına bir satır
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calisma_planlari (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- Haftanın PAZARTESİ'si. Kısıt aşağıda: başka bir gün yazılabilseydi
  -- aynı hafta için iki ayrı plan oluşabilirdi (biri pazartesiye, biri
  -- çarşambaya bağlı) ve öğrenci hangisinin geçerli olduğunu bilemezdi.
  hafta_basi  DATE        NOT NULL,
  notlar      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, hafta_basi)
);

ALTER TABLE calisma_planlari DROP CONSTRAINT IF EXISTS calisma_plani_pazartesi;
ALTER TABLE calisma_planlari ADD CONSTRAINT calisma_plani_pazartesi
  CHECK (extract(isodow FROM hafta_basi) = 1);


-- ------------------------------------------------------------
-- 2. Bloklar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS calisma_bloklari (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID        NOT NULL REFERENCES calisma_planlari(id) ON DELETE CASCADE,

  gun         SMALLINT    NOT NULL CHECK (gun BETWEEN 0 AND 6),     -- 0 = Pazartesi
  dilim       TEXT        NOT NULL CHECK (dilim IN ('sabah', 'ogle', 'aksam')),
  -- Ondalık sıra: bir bloğu iki bloğun ARASINA taşımak tek satırlık
  -- güncelleme (orta nokta). Tamsayı olsaydı her taşımada aynı hücredeki
  -- bütün kardeşlerin sırası yeniden yazılırdı.
  sira        DOUBLE PRECISION NOT NULL DEFAULT 0,

  tur         TEXT        NOT NULL CHECK (tur IN ('konu', 'kaynak', 'video', 'serbest')),
  baslik      TEXT        NOT NULL,
  ders        TEXT,
  konu        TEXT,
  sure_dk     INTEGER     CHECK (sure_dk IS NULL OR sure_dk > 0),

  -- Kaynak bloğu. Kitap ya da bölüm silinirse blok KAYBOLMUYOR: başlık
  -- ve sayfalar blokta da duruyor, yalnızca bağ kopuyor.
  banka_id    UUID        REFERENCES soru_bankalari(id) ON DELETE SET NULL,
  bolum_id    UUID        REFERENCES soru_bankasi_bolumleri(id) ON DELETE SET NULL,
  sayfa_bas   INTEGER,
  sayfa_son   INTEGER,

  video_url   TEXT,
  aciklama    TEXT,

  yapildi         BOOLEAN     NOT NULL DEFAULT false,
  yapildi_tarihi  TIMESTAMPTZ,
  -- Geçen haftadan kopyalanırken YAPILMAMIŞ olan blok. Koç yeni haftayı
  -- hazırlarken sürüklenip unutulan işi ayrıca görsün.
  devreden        BOOLEAN     NOT NULL DEFAULT false,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Video adresi YALNIZCA http(s). Adres arayüzde bağlantı olarak
-- basılıyor; "javascript:" ile başlayan bir değer tıklayanın oturumunda
-- kod çalıştırırdı. İstemci de denetliyor ama tek kapı burası.
ALTER TABLE calisma_bloklari DROP CONSTRAINT IF EXISTS calisma_blogu_video_url;
ALTER TABLE calisma_bloklari ADD CONSTRAINT calisma_blogu_video_url
  CHECK (video_url IS NULL OR video_url ~* '^https?://');

ALTER TABLE calisma_bloklari DROP CONSTRAINT IF EXISTS calisma_blogu_sayfa;
ALTER TABLE calisma_bloklari ADD CONSTRAINT calisma_blogu_sayfa
  CHECK (sayfa_bas IS NULL OR sayfa_son IS NULL OR sayfa_son >= sayfa_bas);

CREATE INDEX IF NOT EXISTS idx_calisma_blok_plan ON calisma_bloklari (plan_id, gun, dilim, sira);


-- ------------------------------------------------------------
-- 3. Yardımcı: bloğun ait olduğu öğrenci
--
-- Blok politikası planın öğrencisine bakmak zorunda. Politikanın içinden
-- doğrudan calisma_planlari'na SELECT atsaydık o sorgu da kendi RLS'ine
-- takılırdı; SECURITY DEFINER bunu tek adıma indiriyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.plan_ogrencisi(p_plan UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM calisma_planlari WHERE id = p_plan;
$$;

-- Politikalar "TO authenticated"; yetki de yalnız ona. PUBLIC'ten ayrıca
-- almıyoruz (ogrencim_mi ile aynı gerekçe: politikası açık bir rol için
-- EXECUTE yoksa sorgu boş sonuç yerine HATA döner).
GRANT EXECUTE ON FUNCTION public.plan_ogrencisi(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 4. RLS
-- ------------------------------------------------------------
ALTER TABLE calisma_planlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE calisma_bloklari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plani gorenler okur"      ON calisma_planlari;
DROP POLICY IF EXISTS "Koc plan yonetir"         ON calisma_planlari;
DROP POLICY IF EXISTS "Bloklari gorenler okur"   ON calisma_bloklari;
DROP POLICY IF EXISTS "Koc blok yonetir"         ON calisma_bloklari;
DROP POLICY IF EXISTS "Ogrenci blok isaretler"   ON calisma_bloklari;

-- Okuma: öğrencinin kendisi, onaylı koçu, velisi, yönetici
CREATE POLICY "Plani gorenler okur" ON calisma_planlari
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR public.ogrencim_mi(student_id)
    OR public.admin_mi()
    OR EXISTS (SELECT 1 FROM family_links fl
               WHERE fl.parent_id = auth.uid() AND fl.student_id = calisma_planlari.student_id)
  );

-- Yazma: yalnız koç ve yönetici. Öğrenci planı oluşturamaz, silemez.
CREATE POLICY "Koc plan yonetir" ON calisma_planlari
  FOR ALL TO authenticated
  USING      (public.ogrencim_mi(student_id) OR public.admin_mi())
  WITH CHECK (public.ogrencim_mi(student_id) OR public.admin_mi());

CREATE POLICY "Bloklari gorenler okur" ON calisma_bloklari
  FOR SELECT TO authenticated
  USING (
    public.plan_ogrencisi(plan_id) = auth.uid()
    OR public.ogrencim_mi(public.plan_ogrencisi(plan_id))
    OR public.admin_mi()
    OR EXISTS (SELECT 1 FROM family_links fl
               WHERE fl.parent_id = auth.uid() AND fl.student_id = public.plan_ogrencisi(plan_id))
  );

CREATE POLICY "Koc blok yonetir" ON calisma_bloklari
  FOR ALL TO authenticated
  USING      (public.ogrencim_mi(public.plan_ogrencisi(plan_id)) OR public.admin_mi())
  WITH CHECK (public.ogrencim_mi(public.plan_ogrencisi(plan_id)) OR public.admin_mi());

-- Öğrenci KENDİ planındaki bloğu güncelleyebilir — ama yalnızca
-- "yapıldı" alanını. Satır düzeyindeki RLS sütun seçemiyor; sütun
-- kısıtı aşağıdaki tetikleyicide.
CREATE POLICY "Ogrenci blok isaretler" ON calisma_bloklari
  FOR UPDATE TO authenticated
  USING      (public.plan_ogrencisi(plan_id) = auth.uid())
  WITH CHECK (public.plan_ogrencisi(plan_id) = auth.uid());


-- ------------------------------------------------------------
-- 5. Tetikleyici: sütun koruması + yapıldı tarihi
--
-- Düz "BEFORE UPDATE", sütun listeli değil: "BEFORE UPDATE OF a, b"
-- yalnızca listedeki sütunlar değişince tetikleniyor. Listeye girmeyen
-- bir sütunu değiştiren öğrenci korumayı hiç tetiklemezdi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_blogu_koru()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  ogrenci UUID;
BEGIN
  -- Yapıldı tarihini istemci değil tetikleyici yönetiyor: koç da
  -- işaretleyebiliyor, öğrenci de; her yolda tarihi elle yazmayı
  -- hatırlamak gerekseydi biri unutulurdu.
  IF NEW.yapildi IS DISTINCT FROM OLD.yapildi THEN
    NEW.yapildi_tarihi := CASE WHEN NEW.yapildi THEN now() ELSE NULL END;
  ELSE
    NEW.yapildi_tarihi := OLD.yapildi_tarihi;
  END IF;

  -- Sunucu tarafı bağlam (SQL Editor, servis anahtarı): kimlik yok,
  -- kısıt uygulanmıyor. Uygulama kullanıcıları hep kimlikli geliyor;
  -- anon rolünün bu tabloya hiçbir politikası yok.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = OLD.plan_id;

  IF NOT (public.ogrencim_mi(ogrenci) OR public.admin_mi()) THEN
    IF (NEW.plan_id, NEW.gun, NEW.dilim, NEW.sira, NEW.tur, NEW.baslik, NEW.ders,
        NEW.konu, NEW.sure_dk, NEW.banka_id, NEW.bolum_id, NEW.sayfa_bas,
        NEW.sayfa_son, NEW.video_url, NEW.aciklama, NEW.devreden)
       IS DISTINCT FROM
       (OLD.plan_id, OLD.gun, OLD.dilim, OLD.sira, OLD.tur, OLD.baslik, OLD.ders,
        OLD.konu, OLD.sure_dk, OLD.banka_id, OLD.bolum_id, OLD.sayfa_bas,
        OLD.sayfa_son, OLD.video_url, OLD.aciklama, OLD.devreden)
    THEN
      RAISE EXCEPTION 'Öğrenci bloğu yalnızca yapıldı olarak işaretleyebilir'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_calisma_blogu_koru ON calisma_bloklari;
CREATE TRIGGER trg_calisma_blogu_koru
  BEFORE UPDATE ON calisma_bloklari
  FOR EACH ROW EXECUTE FUNCTION public.calisma_blogu_koru();

DROP TRIGGER IF EXISTS trg_calisma_planlari_updated_at ON calisma_planlari;
CREATE TRIGGER trg_calisma_planlari_updated_at
  BEFORE UPDATE ON calisma_planlari
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ------------------------------------------------------------
-- 6. Yeni hafta: son planı kopyala (ya da boş başla)
--
-- TEK İŞLEMDE. İstemciden "önce plan, sonra bloklar" diye iki istek
-- atsaydık, ikincisi düştüğünde boş bir plan kalırdı; plan tekil olduğu
-- için koç "kopyala"yı bir daha göremez, elle doldurmak zorunda kalırdı.
--
-- Plan zaten varsa DOKUNULMUYOR ve mevcut id dönüyor: iki sekmede aynı
-- anda "yeni hafta" diyen koç, hazırladığı planın üzerine yazmasın.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_plani_olustur(
  p_student UUID, p_hafta DATE, p_kopyala BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  yeni   UUID;
  kaynak UUID;
BEGIN
  IF NOT (public.ogrencim_mi(p_student) OR public.admin_mi()) THEN
    RAISE EXCEPTION 'Bu öğrenci için plan oluşturma yetkiniz yok' USING ERRCODE = '42501';
  END IF;
  IF extract(isodow FROM p_hafta) <> 1 THEN
    RAISE EXCEPTION 'Hafta başı pazartesi olmalı: %', p_hafta;
  END IF;

  SELECT id INTO yeni FROM calisma_planlari
   WHERE student_id = p_student AND hafta_basi = p_hafta;
  IF yeni IS NOT NULL THEN
    RETURN yeni;
  END IF;

  INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
  VALUES (p_student, auth.uid(), p_hafta)
  RETURNING id INTO yeni;

  IF p_kopyala THEN
    -- "Geçen hafta" değil "en son plan": koç bir hafta atladıysa iki
    -- hafta önceki plan kaynak oluyor, boş başlamak zorunda kalmıyor.
    SELECT id INTO kaynak FROM calisma_planlari
     WHERE student_id = p_student AND hafta_basi < p_hafta
     ORDER BY hafta_basi DESC LIMIT 1;

    IF kaynak IS NOT NULL THEN
      INSERT INTO calisma_bloklari
        (plan_id, gun, dilim, sira, tur, baslik, ders, konu, sure_dk,
         banka_id, bolum_id, sayfa_bas, sayfa_son, video_url, aciklama, devreden)
      SELECT yeni, gun, dilim, sira, tur, baslik, ders, konu, sure_dk,
             banka_id, bolum_id, sayfa_bas, sayfa_son, video_url, aciklama,
             NOT yapildi
        FROM calisma_bloklari
       WHERE plan_id = kaynak;
    END IF;
  END IF;

  RETURN yeni;
END $$;

-- Politika içinden çağrılmıyor; PUBLIC ve anon'dan alınabilir.
REVOKE ALL ON FUNCTION public.calisma_plani_olustur(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_plani_olustur(UUID, DATE, BOOLEAN) TO authenticated;


-- ------------------------------------------------------------
-- 7. Kendi kendini sınayan doğrulama
--
-- SQL Editor her şeyi tek işlemde çalıştırıyor: buradaki bir hata tüm
-- migration'ı geri alır. Yapısal kontrollerin yanında TETİKLEYİCİNİN
-- DAVRANIŞI gerçek bir koç–öğrenci çiftiyle sınanıyor: kimlik bilgisi
-- öğrenciye çevrilip başlık değiştirilmeye çalışılıyor (reddedilmeli),
-- "yapıldı" işaretleniyor (geçmeli), sonra koça çevrilip başlık
-- değiştiriliyor (geçmeli). Sınama satırları 2099'daki bir haftaya
-- yazılıp sonunda siliniyor.
-- ------------------------------------------------------------
DO $$
DECLARE
  n          INTEGER;
  ogr        UUID;
  koc        UUID;
  plan_id_   UUID;
  blok_id_   UUID;
  reddedildi BOOLEAN := false;
  tarih_     TIMESTAMPTZ;
BEGIN
  SELECT count(*) INTO n FROM pg_class
   WHERE relname IN ('calisma_planlari', 'calisma_bloklari') AND relrowsecurity;
  IF n <> 2 THEN RAISE EXCEPTION 'RLS acik degil: % / 2', n; END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('calisma_planlari', 'calisma_bloklari');
  IF n <> 5 THEN RAISE EXCEPTION 'politika sayisi: % (5 bekleniyor)', n; END IF;

  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;

  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
  ELSE
    INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
    VALUES (ogr, koc, date_trunc('week', date '2099-06-17')::date)
    RETURNING id INTO plan_id_;

    INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik)
    VALUES (plan_id_, 0, 'sabah', 'serbest', 'sinama')
    RETURNING id INTO blok_id_;

    -- Öğrenci olarak başlık değiştir: REDDEDİLMELİ
    PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
    BEGIN
      UPDATE calisma_bloklari SET baslik = 'kurcalandi' WHERE id = blok_id_;
    EXCEPTION WHEN insufficient_privilege THEN
      reddedildi := true;
    END;
    IF NOT reddedildi THEN
      RAISE EXCEPTION 'SINAMA: ogrenci blok basligini degistirebildi';
    END IF;

    -- Öğrenci olarak yapıldı işaretle: GEÇMELİ ve tarih dolmalı
    UPDATE calisma_bloklari SET yapildi = true WHERE id = blok_id_;
    SELECT yapildi_tarihi INTO tarih_ FROM calisma_bloklari WHERE id = blok_id_;
    IF tarih_ IS NULL THEN
      RAISE EXCEPTION 'SINAMA: yapildi_tarihi dolmadi';
    END IF;

    -- Koç olarak başlık değiştir: GEÇMELİ
    PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
    UPDATE calisma_bloklari SET baslik = 'koc duzenledi' WHERE id = blok_id_;

    -- Temizlik (blok CASCADE ile gidiyor) ve kimliği sıfırla
    PERFORM set_config('request.jwt.claims', '', true);
    DELETE FROM calisma_planlari WHERE id = plan_id_;

    RAISE NOTICE 'davranis sinamasi gecti (ogrenci %, koc %).', ogr, koc;
  END IF;

  RAISE NOTICE 'calisma_plani: 2 tablo, 5 politika, tetikleyici ve olusturma fonksiyonu hazir.';
END $$;
