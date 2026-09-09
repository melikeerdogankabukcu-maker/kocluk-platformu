-- ============================================================
-- DOSYA DEPOSUNU KAPAT
--
-- ── DURUM ───────────────────────────────────────────────────────
-- 'homework' kovası public=true açılmıştı ve SELECT politikası
-- "bucket_id = 'homework'" idi: yani kimlik doğrulaması olmadan,
-- adresi bilen HERKES dosyayı indirebiliyordu. Doğrulandı — bir
-- öğrencinin profil fotoğrafı anonim istekle çekildi (HTTP 200,
-- 609 KB). Kovada ödev ve test görselleri, mesaj ekleri ve profil
-- fotoğrafları var; kullanıcıların bir bölümü reşit değil.
--
-- ── SONRASI ─────────────────────────────────────────────────────
-- Kova kapanıyor. Dosyalara yalnızca yetkili kullanıcının o an
-- ürettiği, bir saat ömürlü imzalı adresle erişiliyor. İmza üretmek
-- SELECT yetkisi istiyor; yetki kuralı aşağıdaki politika.
--
-- ── ÖNCE KOD, SONRA BU DOSYA ────────────────────────────────────
-- Arayüz imzalı adrese geçirildi ve yayına alındı. Bu SQL'i ondan
-- ÖNCE çalıştırmak, dağıtım inene kadar bütün dosyaları kırık
-- gösterirdi. createSignedUrl açık kovada da çalıştığı için bu sıra
-- kesintisiz.
--
-- ── VERİ GÖÇÜ YOK ───────────────────────────────────────────────
-- Tablolardaki eski public adresler olduğu gibi bırakıldı; artık
-- açılabilir bağlantı değil, yolun kaydı olarak okunuyorlar. Dört
-- tabloyu ve içlerindeki JSON dizilerini yeniden yazan bir göç,
-- yarısı dönmüş hâlde kalırsa dosyaları büsbütün erişilemez yapardı.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1. Yol sahibi
--
-- Yollar `{yukleyenId}/...` biçiminde. İlk parça UUID değilse (elle
-- atılmış ya da eski bir dosya) NULL dönüyor: doğrudan ::uuid
-- çevirisi böyle bir satırda HATA fırlatır ve politika
-- değerlendirilemediği için o kullanıcının TÜM depo sorgusu patlardı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.yol_sahibi(p_name text)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE ilk text;
BEGIN
  ilk := split_part(coalesce(p_name, ''), '/', 1);
  IF ilk ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RETURN ilk::uuid; END IF;
  RETURN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.yol_sahibi(text) TO authenticated;


-- ------------------------------------------------------------
-- 2. Okuma politikası
--
-- Kim hangi dosyayı görebilir:
--   · kendi yüklediğini herkes
--   · koç, onaylı öğrencisinin dosyalarını
--   · veli, çocuğunun dosyalarını
--   · yönetici hepsini
--   · mesaj eklerini, o yazışmanın iki tarafı
--
-- Son madde şart: mesaj eki gönderenin klasöründe duruyor ama alıcı
-- koç–koç ya da veli–öğretmen olabiliyor; bu ikili yukarıdaki
-- öğrenci bağlarının hiçbirine girmiyor. O madde olmadan gönderilen
-- ek karşı tarafta açılmazdı.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Ödev dosyaları okunabilir"          ON storage.objects;
DROP POLICY IF EXISTS "Odev dosyalarini yetkili okur"      ON storage.objects;

CREATE POLICY "Odev dosyalarini yetkili okur" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'homework'
    AND (
      public.yol_sahibi(name) = auth.uid()
      OR public.admin_mi()
      OR public.ogrencim_mi(public.yol_sahibi(name))
      OR EXISTS (
        SELECT 1 FROM public.family_links fl
        WHERE fl.parent_id = auth.uid()
          AND fl.student_id = public.yol_sahibi(name)
      )
      -- LIKE değil strpos: dosya adındaki _ ve % karakterleri LIKE'ta
      -- joker sayılıp başka dosyaları da eşleştirebilirdi.
      OR EXISTS (
        SELECT 1 FROM public.messages m
        WHERE (m.sender_id = auth.uid() OR m.receiver_id = auth.uid())
          AND m.dosyalar IS NOT NULL
          AND strpos(m.dosyalar::text, name) > 0
      )
    )
  );


-- ------------------------------------------------------------
-- 3. Kovayı kapat
-- ------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'homework';


-- ------------------------------------------------------------
-- 4. Doğrulama
--
-- SQL Editor her şeyi tek işlemde çalıştırıyor: buradaki hata tüm
-- migration'ı geri alır ve kova açık kalır — yarım kapatılmış bir
-- durumdan iyi.
-- ------------------------------------------------------------
DO $$
DECLARE n INTEGER; acik BOOLEAN;
BEGIN
  SELECT public INTO acik FROM storage.buckets WHERE id = 'homework';
  IF acik IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'kova hala acik (public=%)', acik;
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Odev dosyalarini yetkili okur';
  IF n <> 1 THEN RAISE EXCEPTION 'okuma politikasi kurulmadi'; END IF;

  -- Eski herkese açık politika gerçekten gitti mi
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname = 'Ödev dosyaları okunabilir';
  IF n <> 0 THEN RAISE EXCEPTION 'eski acik politika duruyor'; END IF;

  -- Yükleme yolu kapanmamalı: öğrenci dosya gönderemezse akış durur
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd = 'INSERT';
  IF n = 0 THEN RAISE EXCEPTION 'INSERT politikasi kalmamis'; END IF;

  RAISE NOTICE 'depo kapatildi, yetkili okuma politikasi kuruldu.';
END $$;
