-- ============================================================
-- ARAÇ (migration DEĞİL): eksik tabloların tanımını çıkarır
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Hiçbir şey değiştirmez, yalnız okur.
-- ============================================================
--
-- users, test_sessions, exam_results, messages, family_links
-- hiçbir migration dosyasında yok; ilk kurulumda panelden açılmışlar.
-- Bu yüzden depodan sıfırdan şema kurulamıyor.
--
-- Bu sorgu o beş tablonun kolonlarını, kısıtlarını, indekslerini,
-- RLS politikalarını ve tetikleyicilerini TEK bir sonuç olarak
-- döndürüyor (SQL Editor birden çok sorguda yalnız sonuncusunu
-- gösteriyor, o yüzden hepsi tek SELECT'te birleştirildi).
--
-- Çıkan sonucun TAMAMINI kopyalayıp bana gönderin; migration
-- dosyalarını ondan yazacağım. Tahminle yazılmış bir şema, felaket
-- anında işe yaramadığını orada öğrenmek demek olurdu.

WITH hedef AS (
  SELECT unnest(ARRAY[
    'tasks'
  ])::text AS ad
),
var_olan AS (
  SELECT ad, ('public.' || quote_ident(ad))::regclass AS oid
    FROM hedef
   WHERE to_regclass('public.' || quote_ident(ad)) IS NOT NULL
),
baslik AS (
  SELECT ad, 0 AS bolum, 0 AS sira,
         format('===== TABLO: %s (RLS: %s) =====', ad,
                CASE WHEN c.relrowsecurity THEN 'acik' ELSE 'KAPALI' END) AS satir
    FROM var_olan v JOIN pg_class c ON c.oid = v.oid
),
kolonlar AS (
  SELECT v.ad, 1 AS bolum, a.attnum::int AS sira,
         format('  KOLON %s %s%s%s',
           a.attname,
           format_type(a.atttypid, a.atttypmod),
           CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
           COALESCE(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), '')) AS satir
    FROM var_olan v
    JOIN pg_attribute a ON a.attrelid = v.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
),
kisitlar AS (
  SELECT v.ad, 2 AS bolum,
         row_number() OVER (PARTITION BY v.ad ORDER BY con.conname)::int AS sira,
         format('  KISIT %s: %s', con.conname, pg_get_constraintdef(con.oid)) AS satir
    FROM var_olan v JOIN pg_constraint con ON con.conrelid = v.oid
),
indeksler AS (
  SELECT v.ad, 3 AS bolum,
         row_number() OVER (PARTITION BY v.ad ORDER BY i.indexname)::int AS sira,
         format('  INDEKS %s', i.indexdef) AS satir
    FROM var_olan v JOIN pg_indexes i
      ON i.schemaname = 'public' AND i.tablename = v.ad
   -- Birincil anahtar ve benzersizlik kısıt olarak zaten yukarıda
   WHERE i.indexname NOT IN (SELECT conname FROM pg_constraint WHERE conrelid = v.oid)
),
politikalar AS (
  SELECT v.ad, 4 AS bolum,
         row_number() OVER (PARTITION BY v.ad ORDER BY p.policyname)::int AS sira,
         format('  POLITIKA %s | %s | roller=%s | USING=%s | CHECK=%s',
                p.policyname, p.cmd, p.roles,
                COALESCE(p.qual, '-'), COALESCE(p.with_check, '-')) AS satir
    FROM var_olan v JOIN pg_policies p
      ON p.schemaname = 'public' AND p.tablename = v.ad
),
tetikleyiciler AS (
  SELECT v.ad, 5 AS bolum,
         row_number() OVER (PARTITION BY v.ad ORDER BY t.tgname)::int AS sira,
         format('  TETIK %s: %s', t.tgname, pg_get_triggerdef(t.oid)) AS satir
    FROM var_olan v JOIN pg_trigger t ON t.tgrelid = v.oid AND NOT t.tgisinternal
),
izinler AS (
  SELECT v.ad, 6 AS bolum,
         row_number() OVER (PARTITION BY v.ad ORDER BY g.grantee, g.privilege_type)::int AS sira,
         format('  IZIN %s -> %s', g.grantee, g.privilege_type) AS satir
    FROM var_olan v JOIN information_schema.role_table_grants g
      ON g.table_schema = 'public' AND g.table_name = v.ad
   WHERE g.grantee IN ('anon', 'authenticated', 'service_role')
)
SELECT satir AS "sema"
  FROM (
    SELECT * FROM baslik
    UNION ALL SELECT * FROM kolonlar
    UNION ALL SELECT * FROM kisitlar
    UNION ALL SELECT * FROM indeksler
    UNION ALL SELECT * FROM politikalar
    UNION ALL SELECT * FROM tetikleyiciler
    UNION ALL SELECT * FROM izinler
  ) t
 ORDER BY ad, bolum, sira;
