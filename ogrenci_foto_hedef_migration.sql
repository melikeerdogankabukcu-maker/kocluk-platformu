-- ============================================================
-- ÖĞRENCİ PROFİL FOTOĞRAFI + SINAV HEDEFİ
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
--
-- ── YENİ POLİTİKA GEREKMİYOR ────────────────────────────────────
-- student_profiles üzerindeki üç politika zaten satır bazında çalışıyor:
-- öğrenci kendi satırını yazar, koç ve bağlı veli okur. Sütun eklemek
-- bunları değiştirmiyor; yeni alanlar aynı erişimi devralıyor.
--
-- ── FOTOĞRAF NEREDE DURUYOR ─────────────────────────────────────
-- Dosyanın kendisi mevcut 'homework' bucket'ında, `{userId}/profil/...`
-- yolunda. Yeni bir bucket açmadık çünkü oradaki INSERT politikası
-- "yolun ilk parçası auth.uid() olacak" diyor; profil fotoğrafı bu
-- kurala olduğu gibi uyuyor ve öğrenci başkasının klasörüne yazamıyor.
-- Bucket public: ödev görselleri de öyle. Yani fotoğraf, adresi bilen
-- birine açık. Gizli olması gerekiyorsa ayrı ve private bir bucket +
-- imzalı URL gerekir; bugünkü kullanım için (koç ve veli görecek)
-- mevcut düzen yeterli.
--
-- ── HEDEF NEDEN "PUAN + SIRALAMA" ───────────────────────────────
-- exam_results tablosunda puan ve sıralama TUTULMUYOR, yalnızca net
-- var. Bu yüzden hedef, girilen sınav sonuçlarıyla otomatik
-- karşılaştırılmıyor — bilerek: olmayan veriden "hedefe %62 kaldı" gibi
-- bir sayı uydurmak, öğrenciye yanlış bir ilerleme duygusu verirdi.
-- Hedef bir niyet beyanı olarak duruyor ve yanında o günkü en iyi net
-- gösteriliyor.
-- ============================================================

ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS photo_url      TEXT,
  -- 'TYT' | 'AYT' | 'YKS' | 'LGS' | 'KPSS' | 'DGS' — müfredat listesiyle aynı
  ADD COLUMN IF NOT EXISTS hedef_sinav    TEXT,
  ADD COLUMN IF NOT EXISTS hedef_siralama INTEGER,
  ADD COLUMN IF NOT EXISTS hedef_puan     NUMERIC(6,3),
  -- Hedef üniversite / bölüm — serbest metin
  ADD COLUMN IF NOT EXISTS hedef_aciklama TEXT;

COMMENT ON COLUMN student_profiles.photo_url IS
  'Profil fotoğrafının public URL''i. Dosya homework bucket''ında '
  '{userId}/profil/ altında durur.';
COMMENT ON COLUMN student_profiles.hedef_siralama IS
  'Öğrencinin hedeflediği sıralama. Sınav sonuçlarıyla otomatik '
  'karşılaştırılmaz; exam_results''ta sıralama tutulmuyor.';

-- Saçma değerler veritabanında dursun istemiyoruz: sıfır ya da negatif
-- sıralama, eksi puan. İstemci de kontrol ediyor ama tek kapı burası.
ALTER TABLE student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_hedef_siralama_pozitif;
ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_hedef_siralama_pozitif
  CHECK (hedef_siralama IS NULL OR hedef_siralama > 0);

ALTER TABLE student_profiles
  DROP CONSTRAINT IF EXISTS student_profiles_hedef_puan_araligi;
ALTER TABLE student_profiles
  ADD CONSTRAINT student_profiles_hedef_puan_araligi
  CHECK (hedef_puan IS NULL OR (hedef_puan >= 0 AND hedef_puan <= 600));


-- ------------------------------------------------------------
-- Doğrulama — beşi de eklenmiş olmalı, yoksa migration geri alınır
-- ------------------------------------------------------------
DO $$
DECLARE eksik INTEGER;
BEGIN
  SELECT 5 - count(*) INTO eksik
  FROM information_schema.columns
  WHERE table_name = 'student_profiles'
    AND column_name IN ('photo_url', 'hedef_sinav', 'hedef_siralama',
                        'hedef_puan', 'hedef_aciklama');
  IF eksik <> 0 THEN
    RAISE EXCEPTION 'student_profiles sutunlari eksik: % adet eklenmedi', eksik;
  END IF;
  RAISE NOTICE 'ogrenci_foto_hedef: 5 sutun hazir.';
END $$;
