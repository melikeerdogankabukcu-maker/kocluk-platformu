-- ============================================================
-- "SON PLANDAN KOPYALA" ARTIK YALNIZCA YAPILMAYANLARI TAŞIYOR
--
-- Önce: yeni hafta kurulurken son planın BÜTÜN blokları kopyalanıyor,
-- işaretleri sıfırlanıyor, yapılmamış olanlar ayrıca "devreden" diye
-- imleniyordu. Sonuç: koç her hafta, öğrencinin bitirdiği işi yeniden
-- plana koyup tek tek silmek zorunda kalıyordu.
--
-- Şimdi: yalnızca YAPILMAYAN bloklar sonraki haftaya geçiyor ve hepsi
-- "devreden" olarak geliyor. Yapılan iş geride kalıyor — geçmiş haftanın
-- planında olduğu gibi duruyor, silinmiyor.
--
-- Geçen haftanın tamamı yapılmışsa yeni hafta BOŞ açılıyor; bu bilinçli:
-- koç o haftayı sıfırdan kurar ya da program kütüphanesinden aktarır.
--
-- İmza (p_student, p_hafta, p_kopyala) ve dönüş tipi BİREBİR aynı
-- kalıyor: değişseydi CREATE OR REPLACE 42P13 verir, DROP gerekirdi ve
-- yayındaki arayüz bir an fonksiyonsuz kalırdı.
--
-- Önkoşul: plan_takip_migration.sql.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

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
      -- Yalnızca yapılmayanlar. Süre, sayaç ve onay sütunları
      -- KOPYALANMIYOR: yeni haftanın çalışması sıfırdan başlıyor.
      INSERT INTO calisma_bloklari
        (plan_id, gun, dilim, sira, tur, baslik, ders, konu, sure_dk,
         banka_id, bolum_id, sayfa_bas, sayfa_son, video_url, aciklama, devreden,
         baslangic_saati, bitis_saati)
      SELECT yeni, gun, dilim, sira, tur, baslik, ders, konu, sure_dk,
             banka_id, bolum_id, sayfa_bas, sayfa_son, video_url, aciklama,
             true, baslangic_saati, bitis_saati
        FROM calisma_bloklari
       WHERE plan_id = kaynak
         AND NOT yapildi;
    END IF;
  END IF;

  RETURN yeni;
END $$;

REVOKE ALL ON FUNCTION public.calisma_plani_olustur(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_plani_olustur(UUID, DATE, BOOLEAN) TO authenticated;


-- ------------------------------------------------------------
-- Kendi kendini sınayan doğrulama
--
-- Gerçek bir koç–öğrenci çiftiyle, 2099'daki iki ardışık haftada:
--   a) yapılan blok sonraki haftaya GEÇMİYOR
--   b) yapılmayan blok geçiyor ve "devreden" işaretli geliyor
--   c) geçen bloğun işareti, süresi ve onayı sıfırlanmış geliyor
--   d) kaynak haftanın kendisi değişmiyor (blok orada duruyor)
--   e) her şeyi yapılmış bir haftadan sonra yeni hafta boş açılıyor
-- Tutmazsa her şey geri alınır.
-- ------------------------------------------------------------
DO $$
DECLARE
  ogr UUID; koc UUID;
  h1 DATE := date_trunc('week', date '2099-08-17')::date;
  h2 DATE := h1 + 7;
  h3 DATE := h1 + 14;
  p1 UUID; p2 UUID; p3 UUID; say INTEGER; satir RECORD;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
    RETURN;
  END IF;

  INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
  VALUES (ogr, koc, h1) RETURNING id INTO p1;

  -- yapılan blok (süresi, onayı ve saati ile)
  INSERT INTO calisma_bloklari
    (plan_id, gun, dilim, tur, baslik, ders, konu, sure_dk, baslangic_saati, bitis_saati,
     yapildi, calisilan_dk, koc_onayi)
  VALUES (p1, 0, 'sabah', 'konu', 'biten is', 'Matematik', 'Sınama A', 40, '09:00', '09:40',
          true, 35, 'onaylandi');

  -- yapılmayan blok
  INSERT INTO calisma_bloklari
    (plan_id, gun, dilim, tur, baslik, ders, konu, sure_dk, baslangic_saati, bitis_saati)
  VALUES (p1, 2, 'aksam', 'kaynak', 'kalan is', 'Fizik', 'Sınama B', 50, '19:00', '19:50');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  p2 := calisma_plani_olustur(ogr, h2, true);

  -- a) + b) yalnızca yapılmayan geçti
  SELECT count(*) INTO say FROM calisma_bloklari WHERE plan_id = p2;
  IF say <> 1 THEN
    RAISE EXCEPTION 'SINAMA a/b: yeni haftaya % blok gecti (1 bekleniyor)', say;
  END IF;

  SELECT baslik, devreden, yapildi, calisilan_dk, koc_onayi, sure_dk, baslangic_saati
    INTO satir FROM calisma_bloklari WHERE plan_id = p2;
  IF satir.baslik <> 'kalan is' THEN
    RAISE EXCEPTION 'SINAMA b: gecen blok yanlis (%)', satir.baslik;
  END IF;
  IF NOT satir.devreden THEN
    RAISE EXCEPTION 'SINAMA b: gecen blok devreden isaretli degil';
  END IF;

  -- c) işaret / süre / onay sıfır, plan bilgisi (süre, saat) duruyor
  IF satir.yapildi OR satir.calisilan_dk IS NOT NULL OR satir.koc_onayi IS NOT NULL THEN
    RAISE EXCEPTION 'SINAMA c: gecen blok temiz gelmedi';
  END IF;
  IF satir.sure_dk <> 50 OR satir.baslangic_saati <> TIME '19:00' THEN
    RAISE EXCEPTION 'SINAMA c: plan bilgisi (sure/saat) tasinmadi';
  END IF;

  -- d) kaynak hafta değişmedi
  SELECT count(*) INTO say FROM calisma_bloklari WHERE plan_id = p1;
  IF say <> 2 THEN
    RAISE EXCEPTION 'SINAMA d: kaynak haftada % blok kaldi (2 bekleniyor)', say;
  END IF;

  -- e) her şeyi biten haftadan sonra boş hafta
  UPDATE calisma_bloklari SET yapildi = true WHERE plan_id = p2;
  p3 := calisma_plani_olustur(ogr, h3, true);
  SELECT count(*) INTO say FROM calisma_bloklari WHERE plan_id = p3;
  IF say <> 0 THEN
    RAISE EXCEPTION 'SINAMA e: tamami biten haftadan % blok kopyalandi', say;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM calisma_planlari WHERE id IN (p1, p2, p3);
  DELETE FROM ogrenci_haftalik o WHERE o.student_id = ogr AND o.hafta IN (h1, h2, h3);

  RAISE NOTICE 'plan_kopya_yapilmayan: 5 davranis sinamasi gecti.';
END $$;
