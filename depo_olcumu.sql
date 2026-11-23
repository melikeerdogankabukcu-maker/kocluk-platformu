-- ============================================================
-- ÖLÇÜM: depoda yer kaplayan ne? (TEK TABLO)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- HİÇBİR ŞEY SİLMİYOR, yalnız okuyor.
-- ============================================================
--
-- Supabase SQL Editor yalnız SON sorgunun sonucunu gösteriyor; bu
-- yüzden bütün ölçümler tek sonuç tablosunda birleştirildi.
--
-- Dosya adresleri iki biçimde duruyor: eski kayıtlarda tam public
-- adres, 5 Kasım'dan sonrakilerde yalın yol. Sorgu ikisini de
-- normalleştiriyor, yoksa eski kayıtların dosyaları "sahipsiz"
-- görünür ve yanlışlıkla silinebilirdi.

WITH d AS (
  SELECT name, created_at, (metadata->>'size')::bigint AS boyut
    FROM storage.objects
   WHERE bucket_id = 'homework'
),
kullanilan AS (
  SELECT DISTINCT CASE
           WHEN ref LIKE 'http%' THEN split_part(ref, '/object/public/homework/', 2)
           ELSE ref
         END AS yol
  FROM (
    SELECT x->>'url' AS ref FROM homework_submissions, jsonb_array_elements(COALESCE(dosyalar,'[]'::jsonb)) x
    UNION ALL SELECT file_url FROM homework_submissions
    UNION ALL SELECT x->>'url' FROM test_sessions, jsonb_array_elements(COALESCE(dosyalar,'[]'::jsonb)) x
    UNION ALL SELECT file_url FROM test_sessions
    UNION ALL SELECT x->>'url' FROM messages, jsonb_array_elements(COALESCE(dosyalar,'[]'::jsonb)) x
    UNION ALL SELECT photo_url  FROM student_profiles
    UNION ALL SELECT gorsel_url FROM sorular
    UNION ALL SELECT kapak_url  FROM okuma_kitaplari
    UNION ALL SELECT logo_url   FROM kurumlar
  ) t(ref)
  WHERE ref IS NOT NULL AND ref <> ''
),
sahipsiz AS (
  SELECT d.* FROM d
   WHERE NOT EXISTS (
     SELECT 1 FROM kullanilan k
      WHERE k.yol = d.name OR k.yol LIKE '%' || d.name)
),
enbuyuk AS (
  SELECT name, created_at, boyut,
         row_number() OVER (ORDER BY boyut DESC) AS sira
    FROM d ORDER BY boyut DESC LIMIT 10
)
SELECT bolum, kalem, adet, toplam, ek
FROM (
  -- 1) Toplam
  SELECT 1 AS s, 0 AS sira, '1. TOPLAM' AS bolum, 'hepsi' AS kalem,
         count(*) AS adet, pg_size_pretty(SUM(boyut)) AS toplam,
         'ortalama ' || pg_size_pretty(AVG(boyut)::bigint) AS ek
    FROM d

  -- 2) Türüne göre
  UNION ALL
  SELECT 2, 0, '2. TUR',
    CASE
      WHEN name LIKE 'sorular/%'  THEN 'soru sayfasi'
      WHEN name LIKE 'kitaplar/%' THEN 'kitap kapagi'
      WHEN name LIKE 'kurum/%'    THEN 'kurum logosu'
      WHEN name LIKE '%/profil/%' THEN 'profil fotografi'
      WHEN name LIKE '%mesaj-%'   THEN 'mesaj eki'
      WHEN name LIKE '%/test-%'   THEN 'test gorseli'
      WHEN name LIKE '%/plan-%'   THEN 'plan blogu gorseli'
      ELSE 'odev / diger'
    END,
    count(*), pg_size_pretty(SUM(boyut)),
    'ortalama ' || pg_size_pretty(AVG(boyut)::bigint)
  FROM d GROUP BY 4

  -- 3) 5 Kasım öncesi / sonrası (küçültme o gün eklendi)
  UNION ALL
  SELECT 3, 0, '3. DONEM',
    CASE WHEN created_at < '2026-11-05' THEN 'once (kucultmesiz)'
         ELSE 'sonra (kucultulmus)' END,
    count(*), pg_size_pretty(SUM(boyut)),
    'ortalama ' || pg_size_pretty(AVG(boyut)::bigint)
  FROM d GROUP BY 4

  -- 4) Sahipsiz
  UNION ALL
  SELECT 4, 0, '4. SAHIPSIZ', 'hicbir kayittan gorunmuyor',
         count(*), pg_size_pretty(COALESCE(SUM(boyut), 0)), ''
  FROM sahipsiz

  -- 5) Boyut aralıkları: kazanç nerede yoğunlaşıyor
  UNION ALL
  SELECT 5, 0, '5. BOYUT ARALIGI',
    CASE WHEN boyut >= 4000000 THEN 'd) 4 MB ustu'
         WHEN boyut >= 2000000 THEN 'c) 2-4 MB'
         WHEN boyut >= 1000000 THEN 'b) 1-2 MB'
         WHEN boyut >=  400000 THEN 'a) 0.4-1 MB'
         ELSE                       '0) 0.4 MB alti' END,
    count(*), pg_size_pretty(SUM(boyut)),
    'ortalama ' || pg_size_pretty(AVG(boyut)::bigint)
  FROM d GROUP BY 4

  -- 6) En büyük 10 dosya
  UNION ALL
  SELECT 6, sira::int, '6. EN BUYUK', left(name, 55),
         1, pg_size_pretty(boyut), to_char(created_at, 'YYYY-MM-DD')
  FROM enbuyuk
) x
ORDER BY s, sira, kalem;
