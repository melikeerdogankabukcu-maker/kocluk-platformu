-- ============================================================
-- ÇALIŞMA PLANI: TEST GÖRSELİ, KOÇ ONAYI, TEK BİLDİRİM
--
-- 1. Göreve ya da plan bloğuna bağlı testte koça İKİ bildirim gidiyordu
--    ("Test çözüldü" + "... test yükledi"). Artık tek bildirim.
-- 2. Öğrenci plan bloğunu tamamlarken testin görsellerini de yüklüyor.
-- 3. Koç tamamlanan bloğu onaylıyor ya da iade ediyor (görevlerdeki
--    doğrulamanın aynısı). Onaylanan blok ve testi öğrencide kilitleniyor.
--
-- Önkoşul: calisma_plani_migration.sql ve plan_takip_migration.sql.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================


-- ------------------------------------------------------------
-- 1. Çift bildirim
--
-- test_sessions'a her INSERT'te iki tetikleyici çalışıyor:
--   bildirim_test          → her teste "Test çözüldü"
--   gorev_testi_bildirimi  → göreve bağlı teste "... test yükledi"
-- Göreve bağlı testte ikisi birden koça düşüyordu. Genel bildirim artık
-- bağlı testleri ATLIYOR: göreve bağlı testi görev bildirimi, plan
-- bloğuna bağlı testi aşağıdaki blok tamamlama bildirimi anlatıyor —
-- ikisi de testin hangi işe ait olduğunu söylediği için daha bilgili.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bildirim_test()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF NEW.task_id IS NOT NULL OR NEW.blok_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  FOR r IN SELECT teacher_id FROM teacher_students
           WHERE student_id = NEW.student_id AND durum = 'onaylandi' LOOP
    PERFORM bildirim_ekle(r.teacher_id, 'test', 'Test çözüldü',
      kisi_adi(NEW.student_id) || ' · ' || COALESCE(NEW.subject, '')
        || COALESCE(' — ' || NEW.topic, '')
        || ' · ' || COALESCE(NEW.correct_count, 0) || '/' || COALESCE(NEW.question_count, 0),
      NEW.id);
  END LOOP;
  RETURN NEW;
END; $$;


-- ------------------------------------------------------------
-- 2. Onay sütunları
-- ------------------------------------------------------------
ALTER TABLE calisma_bloklari
  ADD COLUMN IF NOT EXISTS koc_onayi    TEXT,
  ADD COLUMN IF NOT EXISTS onay_notu    TEXT,
  ADD COLUMN IF NOT EXISTS onaylayan_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS onay_tarihi  TIMESTAMPTZ;

ALTER TABLE calisma_bloklari DROP CONSTRAINT IF EXISTS calisma_blogu_onay;
ALTER TABLE calisma_bloklari ADD CONSTRAINT calisma_blogu_onay
  CHECK (koc_onayi IS NULL OR koc_onayi IN ('onaylandi', 'iade_edildi'));

COMMENT ON COLUMN calisma_bloklari.koc_onayi IS
  'NULL = koç bakmadı, onaylandi = koç doğruladı, iade_edildi = yeniden yapılmalı. '
  'Yalnızca koç yazar; öğrenci yeniden tamamlayınca tamamlama fonksiyonu NULL''a çeker.';


-- ------------------------------------------------------------
-- 3. Sütun koruması (yenilenmiş)
--
--   koç / yönetici     : her şey. onay_tarihi ve onaylayan_id sunucuda
--                        yazılıyor, istemcinin gönderdiği yok sayılıyor.
--   öğrenci            : yapildi, calisilan_dk — blok ONAYLANMAMIŞSA
--   tamamlama fonksiyonu: onayı sıfırlayabilir (app.blok_rpc bayrağı)
--   sayaç fonksiyonu   : sayaç sütunları (app.sayac_rpc bayrağı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_blogu_koru()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  ogrenci UUID;
  -- COALESCE ŞART: bayrak hiç ayarlanmadıysa current_setting NULL döner
  -- ve "NOT bayrak" NULL'a düşüp korumayı sessizce kapatırdı.
  sayac_yetkisi BOOLEAN := COALESCE(current_setting('app.sayac_rpc', true), '') = 'evet';
  blok_yetkisi  BOOLEAN := COALESCE(current_setting('app.blok_rpc',  true), '') = 'evet';
  koc BOOLEAN;
BEGIN
  IF NEW.yapildi IS DISTINCT FROM OLD.yapildi THEN
    NEW.yapildi_tarihi := CASE WHEN NEW.yapildi THEN now() ELSE NULL END;
  ELSE
    NEW.yapildi_tarihi := OLD.yapildi_tarihi;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT sayac_yetkisi AND (
       NEW.sayac_baslangic    IS DISTINCT FROM OLD.sayac_baslangic
    OR NEW.sayacla_olculen_dk IS DISTINCT FROM OLD.sayacla_olculen_dk
  ) THEN
    RAISE EXCEPTION 'Sayaç yalnızca sayaç üzerinden değiştirilebilir'
      USING ERRCODE = '42501';
  END IF;

  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = OLD.plan_id;
  koc := public.ogrencim_mi(ogrenci) OR public.admin_mi();

  -- Onay damgası sunucudan: kim, ne zaman. Koç istemcisi saat ya da
  -- başka bir kişi adı gönderemesin.
  IF NEW.koc_onayi IS DISTINCT FROM OLD.koc_onayi THEN
    NEW.onay_tarihi  := CASE WHEN NEW.koc_onayi IS NULL THEN NULL ELSE now() END;
    NEW.onaylayan_id := CASE WHEN NEW.koc_onayi IS NULL THEN NULL ELSE auth.uid() END;
  ELSE
    NEW.onay_tarihi  := OLD.onay_tarihi;
    NEW.onaylayan_id := OLD.onaylayan_id;
  END IF;

  IF NOT koc THEN
    IF (NEW.plan_id, NEW.gun, NEW.dilim, NEW.sira, NEW.tur, NEW.baslik, NEW.ders,
        NEW.konu, NEW.sure_dk, NEW.banka_id, NEW.bolum_id, NEW.sayfa_bas,
        NEW.sayfa_son, NEW.video_url, NEW.aciklama, NEW.devreden,
        NEW.baslangic_saati, NEW.bitis_saati)
       IS DISTINCT FROM
       (OLD.plan_id, OLD.gun, OLD.dilim, OLD.sira, OLD.tur, OLD.baslik, OLD.ders,
        OLD.konu, OLD.sure_dk, OLD.banka_id, OLD.bolum_id, OLD.sayfa_bas,
        OLD.sayfa_son, OLD.video_url, OLD.aciklama, OLD.devreden,
        OLD.baslangic_saati, OLD.bitis_saati)
    THEN
      RAISE EXCEPTION 'Öğrenci bloğu yalnızca işaretleyebilir ve süresini girebilir'
        USING ERRCODE = '42501';
    END IF;

    -- Öğrenci kendini onaylayamaz. Tamamlama fonksiyonu yalnızca onayı
    -- SIFIRLAYABİLİR (iade sonrası yeniden teslim); başka değer yazamaz.
    IF (NEW.koc_onayi, NEW.onay_notu) IS DISTINCT FROM (OLD.koc_onayi, OLD.onay_notu)
       AND NOT (blok_yetkisi AND NEW.koc_onayi IS NULL)
    THEN
      RAISE EXCEPTION 'Bloğun onayını yalnızca koç değiştirebilir'
        USING ERRCODE = '42501';
    END IF;

    -- Onaylanmış iş sonradan değişmez: işaret kaldırılamaz, süre
    -- oynatılamaz. Koç iade ederse yeniden açılır.
    IF OLD.koc_onayi = 'onaylandi'
       AND (NEW.yapildi, NEW.calisilan_dk) IS DISTINCT FROM (OLD.yapildi, OLD.calisilan_dk)
    THEN
      RAISE EXCEPTION 'Koçun onayladığı blok değiştirilemez'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;


-- ------------------------------------------------------------
-- 4. Onaylanan bloğun testi öğrencide kilitli
--
-- Görevdeki kuralın aynısı (test_duzenleme_migration.sql). Eski
-- test_duzenlenebilir_mi(p_task) fonksiyonuna dokunulmuyor — imzası
-- değişirse 42P13 ve DROP gerekirdi; yanına blok için ikinci bir
-- denetim ekleniyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_blogu_acik_mi(p_blok UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_blok IS NULL
      OR NOT EXISTS (
           SELECT 1 FROM calisma_bloklari
           WHERE id = p_blok AND koc_onayi = 'onaylandi'
         );
$$;

-- Politika içinden çağrılıyor: authenticated EXECUTE yetkisi şart.
GRANT EXECUTE ON FUNCTION public.test_blogu_acik_mi(UUID) TO authenticated;

DROP POLICY IF EXISTS "Ogrenci kendi testini duzenler" ON test_sessions;
CREATE POLICY "Ogrenci kendi testini duzenler" ON test_sessions
  FOR UPDATE TO authenticated
  USING      (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id) AND test_blogu_acik_mi(blok_id))
  WITH CHECK (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id) AND test_blogu_acik_mi(blok_id));

DROP POLICY IF EXISTS "Ogrenci kendi testini siler" ON test_sessions;
CREATE POLICY "Ogrenci kendi testini siler" ON test_sessions
  FOR DELETE TO authenticated
  USING (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id) AND test_blogu_acik_mi(blok_id));


-- ------------------------------------------------------------
-- 5. Tamamlama: işaret + süre + test + GÖRSELLER, tek işlemde
--
-- İmzaya p_dosyalar eklendi. CREATE OR REPLACE yeni parametreyle İKİNCİ
-- bir fonksiyon açardı; PostgREST iki aday arasında seçemeyip hata verir.
-- Eski imza bu yüzden önce kaldırılıyor. Varsayılanı olduğu için yayında
-- olan eski arayüz (6 parametreyle çağıran) çalışmaya devam ediyor.
--
-- Sıra bilinçli: önce test, SONRA blok. Bloğun "yapıldı"ya dönmesi koça
-- bildirim tetikliyor; bildirim testin sonucunu da yazabilsin diye test
-- o anda yerinde olmalı.
--
-- p_dosyalar: [{url, ad}] — NULL gönderilirse görsellere dokunulmuyor.
-- Adresler YALNIZCA bu öğrencinin depo klasörünü gösterebilir. Denetim
-- sunucuda şart: istemci atlanıp başka öğrencinin dosya adresi ya da dış
-- bir bağlantı yazılırsa koçun ekranında "öğrencinin çözümü" diye açılırdı.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.calisma_blogu_tamamla(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.calisma_blogu_tamamla(
  p_blok         UUID,
  p_yapildi      BOOLEAN,
  p_calisilan_dk INTEGER DEFAULT NULL,
  p_soru         INTEGER DEFAULT NULL,
  p_dogru        INTEGER DEFAULT NULL,
  p_yanlis       INTEGER DEFAULT NULL,
  p_dosyalar     JSONB   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  blok    calisma_bloklari%ROWTYPE;
  ogrenci UUID;
  test_id UUID;
  oge     JSONB;
  onek    TEXT;
BEGIN
  SELECT * INTO blok FROM calisma_bloklari WHERE id = p_blok;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blok bulunamadı'; END IF;
  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = blok.plan_id;

  IF auth.uid() IS DISTINCT FROM ogrenci
     AND NOT (public.ogrencim_mi(ogrenci) OR public.admin_mi()) THEN
    RAISE EXCEPTION 'Bu bloğu işaretleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  IF blok.koc_onayi = 'onaylandi'
     AND auth.uid() IS NOT DISTINCT FROM ogrenci THEN
    RAISE EXCEPTION 'Koçun onayladığı blok değiştirilemez';
  END IF;

  IF p_soru IS NOT NULL THEN
    IF p_soru <= 0 THEN RAISE EXCEPTION 'Soru sayısı sıfırdan büyük olmalı'; END IF;
    IF COALESCE(p_dogru, 0) < 0 OR COALESCE(p_yanlis, 0) < 0 THEN
      RAISE EXCEPTION 'Doğru ve yanlış sayısı eksi olamaz';
    END IF;
    IF COALESCE(p_dogru, 0) + COALESCE(p_yanlis, 0) > p_soru THEN
      RAISE EXCEPTION 'Doğru + yanlış (%), soru sayısını (%) geçemez',
        COALESCE(p_dogru, 0) + COALESCE(p_yanlis, 0), p_soru;
    END IF;
  END IF;

  IF p_dosyalar IS NOT NULL THEN
    IF jsonb_typeof(p_dosyalar) <> 'array' THEN
      RAISE EXCEPTION 'Görsel listesi geçersiz';
    END IF;
    IF jsonb_array_length(p_dosyalar) > 10 THEN
      RAISE EXCEPTION 'Bir teste en fazla 10 görsel eklenebilir';
    END IF;
    onek := '/object/public/homework/' || ogrenci::text || '/';
    FOR oge IN SELECT * FROM jsonb_array_elements(p_dosyalar) LOOP
      IF jsonb_typeof(oge) <> 'object'
         OR jsonb_typeof(oge->'url') <> 'string'
         OR (oge->>'url') !~* '^https://'
         OR strpos(oge->>'url', onek) = 0
         OR strpos(oge->>'url', '..') > 0
      THEN
        RAISE EXCEPTION 'Görsel adresi bu öğrencinin dosyası değil';
      END IF;
    END LOOP;
  END IF;

  IF blok.sayac_baslangic IS NOT NULL THEN
    PERFORM public.calisma_sayaci(p_blok, 'durdur');
  END IF;

  -- Test (varsa) — bloktan ÖNCE
  SELECT id INTO test_id FROM test_sessions WHERE blok_id = p_blok;
  IF p_soru IS NOT NULL THEN
    IF test_id IS NULL THEN
      INSERT INTO test_sessions
        (student_id, subject, topic, question_count, correct_count, yanlis_count, blok_id,
         dosyalar, file_url, file_name)
      VALUES
        (ogrenci, COALESCE(blok.ders, 'Genel'), COALESCE(blok.konu, blok.baslik),
         p_soru, COALESCE(p_dogru, 0), p_yanlis, p_blok,
         COALESCE(p_dosyalar, '[]'::jsonb),
         p_dosyalar->0->>'url', p_dosyalar->0->>'ad')
      RETURNING id INTO test_id;
    ELSE
      UPDATE test_sessions
         SET question_count = p_soru,
             correct_count  = COALESCE(p_dogru, 0),
             yanlis_count   = p_yanlis,
             dosyalar       = COALESCE(p_dosyalar, dosyalar),
             file_url       = CASE WHEN p_dosyalar IS NULL THEN file_url  ELSE p_dosyalar->0->>'url' END,
             file_name      = CASE WHEN p_dosyalar IS NULL THEN file_name ELSE p_dosyalar->0->>'ad'  END
       WHERE id = test_id;
    END IF;
  ELSIF p_dosyalar IS NOT NULL THEN
    IF test_id IS NULL THEN
      -- Görsel bir teste ait; sonucu olmayan test açılmıyor (soru sayısı
      -- zorunlu). Arayüz bunu zaten istiyor, bu yalnızca doğrudan çağrıya.
      IF jsonb_array_length(p_dosyalar) > 0 THEN
        RAISE EXCEPTION 'Görsel eklemek için soru sayısını da girin';
      END IF;
    ELSE
      UPDATE test_sessions
         SET dosyalar  = p_dosyalar,
             file_url  = p_dosyalar->0->>'url',
             file_name = p_dosyalar->0->>'ad'
       WHERE id = test_id;
    END IF;
  END IF;

  -- İade edilmiş bloğu öğrenci yeniden tamamlıyor: onay beklemeye döner.
  PERFORM set_config('app.blok_rpc', 'evet', true);
  UPDATE calisma_bloklari
     SET yapildi      = p_yapildi,
         calisilan_dk = COALESCE(p_calisilan_dk, calisilan_dk),
         koc_onayi    = CASE WHEN p_yapildi AND koc_onayi = 'iade_edildi' THEN NULL ELSE koc_onayi END,
         onay_notu    = CASE WHEN p_yapildi AND koc_onayi = 'iade_edildi' THEN NULL ELSE onay_notu END
   WHERE id = p_blok;
  PERFORM set_config('app.blok_rpc', '', true);

  RETURN jsonb_build_object('test_id', test_id);
END $$;

REVOKE ALL ON FUNCTION public.calisma_blogu_tamamla(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_blogu_tamamla(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated;


-- ------------------------------------------------------------
-- 6. Bildirimler
--
-- a) Öğrenci bloğu tamamladı → koç(lar)a TEK bildirim, testin sonucu ve
--    görsel sayısıyla. Yalnızca "yapılmadı → yapıldı" geçişinde ve
--    işlemi ÖĞRENCİ yaptıysa: koçun kendi işaretlemesi ona bildirim
--    olarak dönmesin; aynı bloğun testini sonradan düzeltmek de yeni
--    bildirim üretmesin.
-- b) Koç onayladı / iade etti → öğrenciye.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_bildirim_plan_blogu()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ogrenci UUID;
  t       RECORD;
  mesaj   TEXT;
  r       RECORD;
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

  IF NEW.koc_onayi IS DISTINCT FROM OLD.koc_onayi AND NEW.koc_onayi IS NOT NULL THEN
    PERFORM bildirim_ekle(ogrenci, 'plan',
      CASE WHEN NEW.koc_onayi = 'onaylandi'
           THEN 'Koçun plan bloğunu onayladı ✓'
           ELSE 'Plan bloğun iade edildi' END,
      NEW.baslik || COALESCE(' — ' || NEW.onay_notu, ''),
      NEW.id);
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_bildirim_plan_blogu() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plan_blogu_bildirimi ON calisma_bloklari;
CREATE TRIGGER plan_blogu_bildirimi
  AFTER UPDATE OF yapildi, koc_onayi ON calisma_bloklari
  FOR EACH ROW EXECUTE FUNCTION public.trg_bildirim_plan_blogu();


-- ------------------------------------------------------------
-- 7. Kendi kendini sınayan doğrulama
--
-- Gerçek bir koç–öğrenci çiftiyle, 2099'daki bir haftada:
--   a) öğrenci görselli testle tamamlar; test ve görsel kaydolur
--   b) başka öğrencinin klasörünü gösteren görsel reddedilir
--   c) öğrenci kendi bloğunu ONAYLAYAMAZ
--   d) koç onaylar; onay damgası sunucudan (koç, şimdi) yazılır
--   e) öğrenci onaylı bloğun işaretini kaldıramaz
--   f) koç iade eder; öğrenci yeniden tamamlayınca onay beklemeye döner
--   g) göreve/bloğa bağlı testte genel "Test çözüldü" bildirimi atlanır
--
-- Bildirim tetikleyicileri SINAMA BOYUNCA kapalı: sınama gerçek koça
-- sahte bildirim göndermesin. (g) tetikleyiciyi değil fonksiyonun
-- gövdesini denetliyor.
-- ------------------------------------------------------------
DO $$
DECLARE
  ogr UUID; koc UUID; h_ DATE := date_trunc('week', date '2099-06-17')::date;
  plan_ UUID; blok_ UUID; red BOOLEAN; say INTEGER; satir RECORD;
  tetik TEXT; kapatilan TEXT[] := '{}';
  gorsel JSONB;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
    RETURN;
  END IF;

  FOREACH tetik IN ARRAY ARRAY['bildirim_test', 'rozet_test', 'gorev_testi_bildirimi'] LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger
                WHERE tgrelid = 'public.test_sessions'::regclass AND tgname = tetik) THEN
      EXECUTE format('ALTER TABLE public.test_sessions DISABLE TRIGGER %I', tetik);
      kapatilan := kapatilan || tetik;
    END IF;
  END LOOP;
  ALTER TABLE public.calisma_bloklari DISABLE TRIGGER plan_blogu_bildirimi;

  gorsel := jsonb_build_array(jsonb_build_object(
    'url', 'https://ornek.supabase.co/storage/v1/object/public/homework/' || ogr::text || '/plan-sinama-0.jpg',
    'ad',  'cozum.jpg'));

  INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
  VALUES (ogr, koc, h_) RETURNING id INTO plan_;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, ders, konu, sure_dk)
  VALUES (plan_, 2, 'aksam', 'konu', 'sinama', 'Matematik', 'Sınama Konusu', 40)
  RETURNING id INTO blok_;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);

  -- b) yabancı klasör reddedilir
  red := false;
  BEGIN
    PERFORM calisma_blogu_tamamla(blok_, true, 30, 20, 14, 4, jsonb_build_array(jsonb_build_object(
      'url', 'https://ornek.supabase.co/storage/v1/object/public/homework/' || koc::text || '/x.jpg', 'ad', 'x')));
  EXCEPTION WHEN raise_exception THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: baska klasorun gorseli kabul edildi'; END IF;

  -- a) görselli tamamlama
  PERFORM calisma_blogu_tamamla(blok_, true, 30, 20, 14, 4, gorsel);
  SELECT question_count, correct_count, jsonb_array_length(dosyalar) AS n, file_name
    INTO satir FROM test_sessions WHERE blok_id = blok_;
  IF satir.question_count IS DISTINCT FROM 20 OR satir.n IS DISTINCT FROM 1 OR satir.file_name IS DISTINCT FROM 'cozum.jpg' THEN
    RAISE EXCEPTION 'SINAMA a: test/gorsel kaydedilmedi (soru %, gorsel %)', satir.question_count, satir.n;
  END IF;

  -- c) öğrenci kendini onaylayamaz
  red := false;
  BEGIN
    UPDATE calisma_bloklari SET koc_onayi = 'onaylandi' WHERE id = blok_;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: ogrenci kendi blogunu onaylayabildi'; END IF;

  -- d) koç onaylar
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  UPDATE calisma_bloklari
     SET koc_onayi = 'onaylandi', onaylayan_id = ogr, onay_tarihi = now() - interval '5 days'
   WHERE id = blok_;
  SELECT koc_onayi, onaylayan_id, onay_tarihi INTO satir FROM calisma_bloklari WHERE id = blok_;
  IF satir.koc_onayi <> 'onaylandi' OR satir.onaylayan_id IS DISTINCT FROM koc
     OR satir.onay_tarihi < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'SINAMA d: onay damgasi sunucudan yazilmadi';
  END IF;

  -- e) öğrenci onaylı bloğun işaretini kaldıramaz (fonksiyon da, doğrudan yazma da)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  red := false;
  BEGIN
    PERFORM calisma_blogu_tamamla(blok_, false);
  EXCEPTION WHEN raise_exception THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA e: onayli blok fonksiyonla geri alindi'; END IF;
  red := false;
  BEGIN
    UPDATE calisma_bloklari SET yapildi = false WHERE id = blok_;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA e: onayli blok dogrudan geri alindi'; END IF;

  -- f) iade → yeniden teslim → onay bekliyor
  PERFORM set_config('request.jwt.claims', json_build_object('sub', koc)::text, true);
  UPDATE calisma_bloklari SET koc_onayi = 'iade_edildi', onay_notu = 'yeniden', yapildi = false WHERE id = blok_;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  PERFORM calisma_blogu_tamamla(blok_, true, 35, 20, 16, 2, NULL);
  SELECT yapildi, koc_onayi, onay_notu INTO satir FROM calisma_bloklari WHERE id = blok_;
  IF NOT satir.yapildi OR satir.koc_onayi IS NOT NULL OR satir.onay_notu IS NOT NULL THEN
    RAISE EXCEPTION 'SINAMA f: yeniden teslimde onay sifirlanmadi (%/%)', satir.yapildi, satir.koc_onayi;
  END IF;
  SELECT count(*) INTO say FROM test_sessions WHERE blok_id = blok_;
  IF say <> 1 OR (SELECT jsonb_array_length(dosyalar) FROM test_sessions WHERE blok_id = blok_) <> 1 THEN
    RAISE EXCEPTION 'SINAMA f: ikinci teslim testi cogaltti ya da gorseli sildi';
  END IF;

  -- g) genel test bildirimi bağlı testleri atlıyor
  IF strpos(pg_get_functiondef('public.trg_bildirim_test()'::regprocedure), 'NEW.blok_id IS NOT NULL') = 0 THEN
    RAISE EXCEPTION 'SINAMA g: trg_bildirim_test bagli testleri atlamiyor';
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM test_sessions WHERE blok_id = blok_;
  DELETE FROM calisma_planlari WHERE id = plan_;
  DELETE FROM ogrenci_haftalik o WHERE o.student_id = ogr AND o.hafta = h_;

  ALTER TABLE public.calisma_bloklari ENABLE TRIGGER plan_blogu_bildirimi;
  FOREACH tetik IN ARRAY kapatilan LOOP
    EXECUTE format('ALTER TABLE public.test_sessions ENABLE TRIGGER %I', tetik);
  END LOOP;

  RAISE NOTICE 'plan_onay: 7 davranis sinamasi gecti.';
END $$;
