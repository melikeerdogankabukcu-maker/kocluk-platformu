-- ============================================================
-- SONDA: SQL ile satır silmek kullanımı düşürüyor mu?
--
-- ███ SONUÇ (24 Kasım 2026): HAYIR, SİLİNEMİYOR. ███
--
-- Supabase'in `storage.protect_delete()` tetikleyicisi doğrudan
-- silmeyi engelliyor:
--
--   ERROR 42501: Direct deletion from storage tables is not allowed.
--   Use the Storage API instead.
--   HINT: This prevents accidental data loss from orphaned objects.
--
-- Yani depo API'si kapalıyken dosya silmenin SQL yolu yok. Betik
-- kayıt olarak duruyor: bir daha denenmesin.
--
-- Tetikleyici teknik olarak devre dışı bırakılabilir ama ÖNERİLMİYOR:
-- tam da bu durumu (sahipsiz dosya bırakmayı) önlemek için konmuş,
-- kullanım rakamının düşeceği hâlâ belirsiz ve dosyalar diskte
-- erişilemez hâlde kalır — küçültme şansı da yok olur.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================
--
-- Depo API'si 402 döndüğü için ne panelden ne betikten dosya
-- silinebiliyor. Geriye `storage.objects` satırını SQL ile silmek
-- kalıyor ama bunun işe yarayıp yaramayacağı BELİRSİZ:
--
--   • Supabase kullanımı `storage.objects` tablosundan hesaplıyorsa
--     rakam düşer ve kısıt kalkar.
--   • Gerçek disk içeriğinden hesaplıyorsa hiçbir şey değişmez.
--
-- Her iki durumda da dosya diskte erişilemez hâlde kalıyor; yani
-- bu tek yönlü bir kapı. 500 MB gerçek öğrenci fotoğrafını "belki
-- işe yarar" diye silmek kabul edilemez.
--
-- ── BU YÜZDEN ÖNCE TEK DOSYAYLA ÖLÇÜYORUZ ───────────────────
-- Silinen dosya SAHİPSİZ: hiçbir kayıttan gösterilmiyor, kullanıcı
-- için zaten yok. Kaybı sıfır, bilgisi yüksek.
--
-- SIRA:
--   1. Bu betiği çalıştır (en büyük sahipsiz dosyanın satırını siler
--      ve boyutunu yazar).
--   2. Usage sayfasını aç, birkaç dakika bekle, yenile.
--   3. Storage size o dosyanın boyutu kadar DÜŞTÜ MÜ?
--        düştüyse  → yöntem işliyor, kontrollü listeyle devam ederiz
--        düşmediyse → yöntem işlemiyor, hiçbir şey kaybetmedik

DROP TABLE IF EXISTS _sonda_sonucu;
CREATE TEMP TABLE _sonda_sonucu (sonuc TEXT);

DO $sonda$
DECLARE
  hedef RECORD;
  toplam_once BIGINT;
BEGIN
  SELECT SUM((metadata->>'size')::bigint) INTO toplam_once
    FROM storage.objects WHERE bucket_id = 'homework';

  -- Sahipsizlerin en büyüğü. Referans listesi ölçüm sorgusuyla aynı;
  -- bir kaynak unutulursa kullanımda olan dosya silinirdi.
  WITH kullanilan AS (
    SELECT DISTINCT CASE
             WHEN ref LIKE 'http%' THEN split_part(ref, '/object/public/homework/', 2)
             ELSE ref END AS yol
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
  )
  SELECT o.id, o.name, (o.metadata->>'size')::bigint AS boyut
    INTO hedef
    FROM storage.objects o
   WHERE o.bucket_id = 'homework'
     AND NOT EXISTS (SELECT 1 FROM kullanilan k
                      WHERE k.yol = o.name OR k.yol LIKE '%' || o.name)
   ORDER BY (o.metadata->>'size')::bigint DESC
   LIMIT 1;

  IF hedef IS NULL THEN
    INSERT INTO _sonda_sonucu VALUES ('ATLANDI - sahipsiz dosya bulunamadi');
    RETURN;
  END IF;

  DELETE FROM storage.objects WHERE id = hedef.id;

  INSERT INTO _sonda_sonucu VALUES (format(
    'SILINDI: %s  |  boyut: %s  |  silmeden onceki toplam: %s  |  '
    'simdi Usage sayfasinda Storage size bu kadar DUSMELI',
    hedef.name,
    pg_size_pretty(hedef.boyut),
    pg_size_pretty(toplam_once)));
END $sonda$;

SELECT sonuc AS "sonda" FROM _sonda_sonucu;

-- Tablodaki yeni toplam (bu HER ZAMAN düşer; asıl soru Usage
-- sayfasındaki rakamın da düşüp düşmediği).
SELECT count(*) AS "kalan_dosya",
       pg_size_pretty(SUM((metadata->>'size')::bigint)) AS "tablodaki_toplam"
  FROM storage.objects WHERE bucket_id = 'homework';
