-- ============================================================
-- FİZİKSEL KONTROL: HAFTANIN BLOKLARINI TOPLU ONAYLAMA
--
-- Koç defteri elde kontrol edip birden çok bloğu birlikte onaylıyor.
-- Bu işi istemciden tek tek UPDATE ile yapmak iki şeyi bozuyordu:
--   1) Öğrenciye her blok için ayrı bildirim gidiyordu (12 blok = 12
--      bildirim). Artık öğrenci başına TEK özet bildirim.
--   2) Yarısı yazılıp yarısı kalabiliyordu. Tek işlem: hepsi ya da hiçbiri.
--
-- Önkoşul: plan_onay_migration.sql.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================


-- ------------------------------------------------------------
-- 1. Tek tek bildirim, toplu onayda susuyor
--
-- Blok tetikleyicisi her satır için çalışıyor. Toplu onayda bildirimi
-- fonksiyon kendisi, tek satır olarak gönderiyor; tetikleyici işlem-yerel
-- bayrağı görünce onay bildirimini atlıyor. Öğrencinin tamamlama
-- bildirimi bundan etkilenmiyor (o zaten ayrı dal).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_bildirim_plan_blogu()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ogrenci UUID;
  t       RECORD;
  mesaj   TEXT;
  r       RECORD;
  toplu   BOOLEAN := COALESCE(current_setting('app.toplu_onay', true), '') = 'evet';
BEGIN
  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = NEW.plan_id;
  IF ogrenci IS NULL THEN RETURN NEW; END IF;

  IF NEW.yapildi AND NOT OLD.yapildi AND auth.uid() IS NOT DISTINCT FROM ogrenci THEN
    SELECT question_count, correct_count, jsonb_array_length(COALESCE(dosyalar, '[]'::jsonb)) AS gorsel
      INTO t FROM test_sessions WHERE blok_id = NEW.id;

    mesaj := NEW.baslik
      || COALESCE(' — ' || NEW.ders, '')
      || CASE WHEN t.question_count IS NOT NULL
              THEN ' · ' || t.correct_count || '/' || t.question_count ELSE '' END
      || CASE WHEN COALESCE(t.gorsel, 0) > 0
              THEN ' · ' || t.gorsel || ' görsel' ELSE '' END
      || ' · onay bekliyor';

    FOR r IN SELECT teacher_id FROM teacher_students
             WHERE student_id = ogrenci AND durum = 'onaylandi' LOOP
      PERFORM bildirim_ekle(r.teacher_id, 'plan',
        kisi_adi(ogrenci) || ' plan bloğunu tamamladı', mesaj, NEW.id);
    END LOOP;
  END IF;

  IF NOT toplu
     AND NEW.koc_onayi IS DISTINCT FROM OLD.koc_onayi AND NEW.koc_onayi IS NOT NULL THEN
    PERFORM bildirim_ekle(ogrenci, 'plan',
      CASE WHEN NEW.koc_onayi = 'onaylandi'
           THEN 'Koçun plan bloğunu onayladı ✓'
           ELSE 'Plan bloğun iade edildi' END,
      NEW.baslik || COALESCE(' — ' || NEW.onay_notu, ''),
      NEW.id);
  END IF;

  RETURN NEW;
END $$;


-- ------------------------------------------------------------
-- 2. Toplu onay
--
-- Yetki denetimi TEK TEK her bloğun öğrencisi için yapılıyor: listeye
-- başka bir koçun öğrencisinin bloğu karıştırılırsa işlemin tamamı
-- reddediliyor. Satır politikası da aynı kuralı uygular ama sessizce
-- atlardı — koç 12 blok onayladığını sanıp 9'u yazılmış olurdu.
--
-- Onay damgasını (kim, ne zaman) blok tetikleyicisi yazıyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_bloklari_onayla(p_idler UUID[])
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n INTEGER := 0;
  r RECORD;
BEGIN
  IF p_idler IS NULL OR array_length(p_idler, 1) IS NULL THEN
    RETURN jsonb_build_object('onaylanan', 0);
  END IF;
  IF array_length(p_idler, 1) > 300 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 300 blok onaylanabilir';
  END IF;

  IF EXISTS (
    SELECT 1 FROM calisma_bloklari k
    JOIN calisma_planlari p ON p.id = k.plan_id
    WHERE k.id = ANY(p_idler)
      AND NOT (public.ogrencim_mi(p.student_id) OR public.admin_mi())
  ) THEN
    RAISE EXCEPTION 'Bu blokları onaylama yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.toplu_onay', 'evet', true);
  UPDATE calisma_bloklari
     SET koc_onayi = 'onaylandi', onay_notu = NULL, yapildi = true
   WHERE id = ANY(p_idler);
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.toplu_onay', '', true);

  -- Öğrenci başına tek bildirim. Aynı listede birden çok öğrencinin bloğu
  -- olabilir (koç haftayı toplu gözden geçiriyorsa).
  FOR r IN
    SELECT p.student_id, count(*) AS adet, min(p.hafta_basi) AS hafta
      FROM calisma_bloklari k
      JOIN calisma_planlari p ON p.id = k.plan_id
     WHERE k.id = ANY(p_idler)
     GROUP BY p.student_id
  LOOP
    PERFORM bildirim_ekle(r.student_id, 'plan',
      'Koçun planını onayladı ✓',
      r.adet || ' blok onaylandı · ' || to_char(r.hafta, 'DD.MM.YYYY') || ' haftası',
      NULL);
  END LOOP;

  RETURN jsonb_build_object('onaylanan', n);
END $$;

REVOKE ALL ON FUNCTION public.calisma_bloklari_onayla(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_bloklari_onayla(UUID[]) TO authenticated;


-- ------------------------------------------------------------
-- 3. Kendi kendini sınayan doğrulama
--
-- Gerçek bir koç–öğrenci çiftiyle, 2099'daki bir haftada:
--   a) koç iki bloğu birlikte onaylar; ikisi de yapıldı + onaylı olur,
--      öğrenci işaretlememiş olan da (fiziksel kontrol)
--   b) onay damgası sunucudan (koç, şimdi)
--   c) ÖĞRENCİYE TEK bildirim gider, blok başına değil
--   d) öğrenci aynı fonksiyonu çağıramaz
-- Sınamanın açtığı bildirim satırı sonunda siliniyor.
-- ------------------------------------------------------------
DO $$
DECLARE
  ogr UUID; koc UUID; h_ DATE := date_trunc('week', date '2099-07-15')::date;
  plan_ UUID; b1 UUID; b2 UUID; sonuc JSONB; say INTEGER; satir RECORD; red BOOLEAN;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
    RETURN;
  END IF;

  INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
  VALUES (ogr, koc, h_) RETURNING id INTO plan_;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, ders, konu, sure_dk)
  VALUES (plan_, 0, 'sabah', 'konu', 'sinama 1', 'Matematik', 'Sınama', 30) RETURNING id INTO b1;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, ders, konu, sure_dk)
  VALUES (plan_, 1, 'aksam', 'serbest', 'sinama 2', NULL, NULL, 45) RETURNING id INTO b2;

  -- d) öğrenci çağıramaz
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  red := false;
  BEGIN
    PERFORM calisma_bloklari_onayla(ARRAY[b1, b2]);
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA d: ogrenci toplu onay yapabildi'; END IF;

  -- a) + b) koç onaylar
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  sonuc := calisma_bloklari_onayla(ARRAY[b1, b2]);
  IF (sonuc->>'onaylanan')::int <> 2 THEN
    RAISE EXCEPTION 'SINAMA a: % blok onaylandi (2 bekleniyor)', sonuc->>'onaylanan';
  END IF;
  SELECT count(*) INTO say FROM calisma_bloklari
   WHERE id = ANY(ARRAY[b1, b2]) AND yapildi AND koc_onayi = 'onaylandi';
  IF say <> 2 THEN RAISE EXCEPTION 'SINAMA a: bloklar yapildi+onayli degil (%)', say; END IF;

  SELECT onaylayan_id, onay_tarihi INTO satir FROM calisma_bloklari WHERE id = b1;
  IF satir.onaylayan_id IS DISTINCT FROM koc OR satir.onay_tarihi IS NULL THEN
    RAISE EXCEPTION 'SINAMA b: onay damgasi yazilmadi';
  END IF;

  -- c) tek bildirim
  SELECT count(*) INTO say FROM notifications
   WHERE user_id = ogr AND tur = 'plan' AND baslik = 'Koçun planını onayladı ✓'
     AND created_at > now() - interval '5 minutes';
  IF say <> 1 THEN RAISE EXCEPTION 'SINAMA c: % bildirim olustu (1 bekleniyor)', say; END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM notifications
   WHERE user_id = ogr AND tur = 'plan' AND baslik = 'Koçun planını onayladı ✓'
     AND created_at > now() - interval '5 minutes';
  DELETE FROM calisma_planlari WHERE id = plan_;
  DELETE FROM ogrenci_haftalik o WHERE o.student_id = ogr AND o.hafta = h_;

  RAISE NOTICE 'plan_toplu_onay: 4 davranis sinamasi gecti.';
END $$;
