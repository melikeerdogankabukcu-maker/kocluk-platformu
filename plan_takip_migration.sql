-- ============================================================
-- ÇALIŞMA PLANI: SAAT, SÜRE, SAYAÇ, TEST BAĞI, GELİŞİM
--
-- 1. Bloklara saat aralığı (koç)
-- 2. Gerçekleşen süre (öğrenci bildirir) + sayaç (sunucu ölçer)
-- 3. Blok "yaptım" işaretlenirken test sonucu → bloğa bağlı test kaydı
-- 4. Haftalık özete plan uyumu ve çalışma süresi
--
-- Önkoşul: calisma_plani_migration.sql çalışmış olmalı.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================


-- ------------------------------------------------------------
-- 1. Yeni blok sütunları
-- ------------------------------------------------------------
ALTER TABLE calisma_bloklari
  ADD COLUMN IF NOT EXISTS baslangic_saati     TIME,
  ADD COLUMN IF NOT EXISTS bitis_saati         TIME,
  -- Öğrencinin BİLDİRDİĞİ süre. Sayaçtan önerilir ama öğrenci değiştirebilir.
  ADD COLUMN IF NOT EXISTS calisilan_dk        INTEGER,
  -- Sayacın ÖLÇTÜĞÜ süre. Yalnızca sunucudaki sayaç fonksiyonu yazabilir.
  --
  -- İki ayrı sütun bilinçli: "çalışılan 45 dk" ile "sayacın gördüğü 32 dk"
  -- farklı bilgiler. Tek sütun olsaydı koç, bir sürenin ölçülmüş mü yoksa
  -- elle mi yazılmış olduğunu hiçbir zaman ayırt edemezdi.
  ADD COLUMN IF NOT EXISTS sayacla_olculen_dk  INTEGER NOT NULL DEFAULT 0,
  -- Çalışan sayacın başlangıcı. Tarayıcıda değil VERİTABANINDA: öğrenci
  -- uygulamayı kapatsa, telefonu değiştirse bile sayaç kaldığı yerden
  -- sürüyor. Sayacın açık kalması için uygulamanın açık tutulması gerekmiyor.
  ADD COLUMN IF NOT EXISTS sayac_baslangic     TIMESTAMPTZ;

ALTER TABLE calisma_bloklari DROP CONSTRAINT IF EXISTS calisma_blogu_saat;
ALTER TABLE calisma_bloklari ADD CONSTRAINT calisma_blogu_saat
  CHECK (baslangic_saati IS NULL OR bitis_saati IS NULL OR bitis_saati > baslangic_saati);

ALTER TABLE calisma_bloklari DROP CONSTRAINT IF EXISTS calisma_blogu_sure;
ALTER TABLE calisma_bloklari ADD CONSTRAINT calisma_blogu_sure
  CHECK ((calisilan_dk IS NULL OR calisilan_dk BETWEEN 0 AND 1440)
         AND sayacla_olculen_dk >= 0);


-- ------------------------------------------------------------
-- 2. Testi bloğa bağla
-- ------------------------------------------------------------
ALTER TABLE test_sessions
  ADD COLUMN IF NOT EXISTS blok_id UUID REFERENCES calisma_bloklari(id) ON DELETE SET NULL;

-- Blok başına en fazla bir test. Öğrenci işareti kaldırıp yeniden
-- koyduğunda İKİNCİ bir test açılmasın; mevcut test güncellensin.
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_blok_tekil
  ON test_sessions (blok_id) WHERE blok_id IS NOT NULL;

-- Bütünlük: test ancak kendi öğrencisinin planındaki bloğa bağlanabilir.
-- Öğrenci kendi testini REST ile doğrudan güncelleyebildiği için bu kural
-- istemciye bırakılamaz; başkasının bloğuna test bağlayıp o öğrencinin
-- haftalık özetini şişirebilirdi.
CREATE OR REPLACE FUNCTION public.test_blok_bagi_denetle()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.blok_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.blok_id IS DISTINCT FROM OLD.blok_id
          OR NEW.student_id IS DISTINCT FROM OLD.student_id)
     AND NOT EXISTS (
       SELECT 1 FROM calisma_bloklari k
       JOIN calisma_planlari p ON p.id = k.plan_id
       WHERE k.id = NEW.blok_id AND p.student_id = NEW.student_id
     )
  THEN
    RAISE EXCEPTION 'Test yalnızca öğrencinin kendi planındaki bloğa bağlanabilir'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.test_blok_bagi_denetle() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_test_blok_bagi ON test_sessions;
CREATE TRIGGER trg_test_blok_bagi
  BEFORE INSERT OR UPDATE ON test_sessions
  FOR EACH ROW EXECUTE FUNCTION public.test_blok_bagi_denetle();


-- ------------------------------------------------------------
-- 3. Sütun koruması (yenilenmiş)
--
--   koç / yönetici    : her şey
--   öğrenci           : yapildi, calisilan_dk
--   yalnız sayaç fonk.: sayac_baslangic, sayacla_olculen_dk
--
-- Sayaç sütunlarını öğrenci doğrudan yazabilseydi, sayac_baslangic'i üç
-- saat geriye çekip "sayaçla ölçülmüş" süre uydurabilirdi — ölçülen
-- süreyi ayrı tutmanın bütün anlamı giderdi. Sayaç fonksiyonu yazarken
-- işlem-yerel bir bayrak (app.sayac_rpc) koyuyor; tetikleyici bu
-- sütunlara yalnızca o bayrak varken izin veriyor. Bayrak işlem sonunda
-- kendiliğinden düşüyor ve PostgREST üzerinden ayarlanamıyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_blogu_koru()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  ogrenci UUID;
  -- COALESCE ŞART. Bayrak bu bağlantıda hiç ayarlanmadıysa
  -- current_setting NULL döner; NULL = 'evet' de NULL olur ve aşağıdaki
  -- "IF NOT sayac_yetkisi AND ..." NULL'a, yani YANLIŞ'a düşer — koruma
  -- sessizce devre dışı kalır ve öğrenci sayaç sütunlarını yazabilirdi.
  sayac_yetkisi BOOLEAN := COALESCE(current_setting('app.sayac_rpc', true), '') = 'evet';
BEGIN
  IF NEW.yapildi IS DISTINCT FROM OLD.yapildi THEN
    NEW.yapildi_tarihi := CASE WHEN NEW.yapildi THEN now() ELSE NULL END;
  ELSE
    NEW.yapildi_tarihi := OLD.yapildi_tarihi;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sayaç sütunları: kim olursa olsun yalnızca sayaç fonksiyonundan
  IF NOT sayac_yetkisi AND (
       NEW.sayac_baslangic    IS DISTINCT FROM OLD.sayac_baslangic
    OR NEW.sayacla_olculen_dk IS DISTINCT FROM OLD.sayacla_olculen_dk
  ) THEN
    RAISE EXCEPTION 'Sayaç yalnızca sayaç üzerinden değiştirilebilir'
      USING ERRCODE = '42501';
  END IF;

  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = OLD.plan_id;

  IF NOT (public.ogrencim_mi(ogrenci) OR public.admin_mi()) THEN
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
  END IF;

  RETURN NEW;
END $$;
-- (Tetikleyici calisma_plani_migration.sql'de bu fonksiyona bağlı; yeniden
--  oluşturmaya gerek yok, CREATE OR REPLACE gövdeyi yerinde değiştiriyor.)


-- ------------------------------------------------------------
-- 4. Yeni hafta kopyası saatleri de taşısın
--
-- İmza (p_student, p_hafta, p_kopyala) BİREBİR aynı. Parametre adı
-- değişseydi CREATE OR REPLACE 42P13 verir ve DROP gerekirdi.
-- Süre ve sayaç KOPYALANMIYOR: yeni haftanın çalışması sıfırdan başlar.
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
    SELECT id INTO kaynak FROM calisma_planlari
     WHERE student_id = p_student AND hafta_basi < p_hafta
     ORDER BY hafta_basi DESC LIMIT 1;

    IF kaynak IS NOT NULL THEN
      INSERT INTO calisma_bloklari
        (plan_id, gun, dilim, sira, tur, baslik, ders, konu, sure_dk,
         banka_id, bolum_id, sayfa_bas, sayfa_son, video_url, aciklama, devreden,
         baslangic_saati, bitis_saati)
      SELECT yeni, gun, dilim, sira, tur, baslik, ders, konu, sure_dk,
             banka_id, bolum_id, sayfa_bas, sayfa_son, video_url, aciklama,
             NOT yapildi, baslangic_saati, bitis_saati
        FROM calisma_bloklari
       WHERE plan_id = kaynak;
    END IF;
  END IF;

  RETURN yeni;
END $$;

REVOKE ALL ON FUNCTION public.calisma_plani_olustur(UUID, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_plani_olustur(UUID, DATE, BOOLEAN) TO authenticated;


-- ------------------------------------------------------------
-- 5. Sayaç
--
-- Zaman SUNUCUDAN (now()). Öğrencinin telefon saati yanlış olabilir ya da
-- değiştirilebilir; ölçülen sürenin güvenilir olmasının tek yolu bu.
--
-- 'basla' öğrencinin AÇIK BAŞKA SAYACINI önce durduruyor: iki bloğun
-- sayacı aynı anda işleseydi aynı dakikalar iki kez sayılırdı.
--
-- 'durdur' en fazla 240 dakika ekliyor. Akşam başlatılıp unutulan bir
-- sayaç sabaha kadar işleyip bloğa 14 saat yazmasın; kırpıldığında
-- dönüşte "kirpildi" bildiriliyor ki öğrenciye söylensin.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_sayaci(p_blok UUID, p_islem TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  blok    calisma_bloklari%ROWTYPE;
  ogrenci UUID;
  diger   UUID;
  gecen   NUMERIC;
  ek      INTEGER := 0;
  kirp    BOOLEAN := false;
BEGIN
  SELECT * INTO blok FROM calisma_bloklari WHERE id = p_blok;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Blok bulunamadı';
  END IF;
  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = blok.plan_id;

  IF auth.uid() IS DISTINCT FROM ogrenci
     AND NOT (public.ogrencim_mi(ogrenci) OR public.admin_mi()) THEN
    RAISE EXCEPTION 'Bu bloğun sayacını kullanma yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.sayac_rpc', 'evet', true);

  IF p_islem = 'basla' THEN
    IF blok.sayac_baslangic IS NULL THEN
      FOR diger IN
        SELECT k.id FROM calisma_bloklari k
        JOIN calisma_planlari p ON p.id = k.plan_id
        WHERE p.student_id = ogrenci AND k.sayac_baslangic IS NOT NULL AND k.id <> p_blok
      LOOP
        PERFORM public.calisma_sayaci(diger, 'durdur');
        PERFORM set_config('app.sayac_rpc', 'evet', true);   -- iç çağrı düşürdü
      END LOOP;
      UPDATE calisma_bloklari SET sayac_baslangic = now() WHERE id = p_blok;
    END IF;

  ELSIF p_islem = 'durdur' THEN
    IF blok.sayac_baslangic IS NOT NULL THEN
      gecen := extract(epoch FROM (now() - blok.sayac_baslangic)) / 60.0;
      IF gecen > 240 THEN ek := 240; kirp := true;
      ELSE ek := GREATEST(0, round(gecen)::int);
      END IF;
      UPDATE calisma_bloklari
         SET sayacla_olculen_dk = sayacla_olculen_dk + ek,
             sayac_baslangic    = NULL
       WHERE id = p_blok;
    END IF;

  ELSE
    PERFORM set_config('app.sayac_rpc', '', true);
    RAISE EXCEPTION 'Geçersiz sayaç işlemi: %', p_islem;
  END IF;

  PERFORM set_config('app.sayac_rpc', '', true);

  SELECT * INTO blok FROM calisma_bloklari WHERE id = p_blok;
  RETURN jsonb_build_object(
    'sayacla_olculen_dk', blok.sayacla_olculen_dk,
    'sayac_baslangic',    blok.sayac_baslangic,
    'eklenen_dk',         ek,
    'kirpildi',           kirp,
    'simdi',              now()
  );
END $$;

REVOKE ALL ON FUNCTION public.calisma_sayaci(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_sayaci(UUID, TEXT) TO authenticated;


-- ------------------------------------------------------------
-- 6. Bloğu tamamla: işaret + süre + test, TEK İŞLEMDE
--
-- İki ayrı istek olsaydı (önce işaret, sonra test) ikincisi düştüğünde
-- blok "yapıldı" görünür ama sonucu hiçbir yerde olmazdı; öğrenci de
-- girdiğini sanırdı.
--
-- p_soru NULL: test bilgisi gönderilmedi, var olan teste DOKUNULMUYOR.
-- İşareti kaldıran öğrencinin daha önce girdiği sonuç silinmesin; tekrar
-- işaretlediğinde form o değerlerle açılıyor ve test güncelleniyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calisma_blogu_tamamla(
  p_blok         UUID,
  p_yapildi      BOOLEAN,
  p_calisilan_dk INTEGER DEFAULT NULL,
  p_soru         INTEGER DEFAULT NULL,
  p_dogru        INTEGER DEFAULT NULL,
  p_yanlis       INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  blok    calisma_bloklari%ROWTYPE;
  ogrenci UUID;
  test_id UUID;
BEGIN
  SELECT * INTO blok FROM calisma_bloklari WHERE id = p_blok;
  IF NOT FOUND THEN RAISE EXCEPTION 'Blok bulunamadı'; END IF;
  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = blok.plan_id;

  IF auth.uid() IS DISTINCT FROM ogrenci
     AND NOT (public.ogrencim_mi(ogrenci) OR public.admin_mi()) THEN
    RAISE EXCEPTION 'Bu bloğu işaretleme yetkiniz yok' USING ERRCODE = '42501';
  END IF;

  -- Sayılar test_sayilari_tutarli kısıtıyla aynı kuralla ÖNCEDEN
  -- denetleniyor: kısıta çarpsaydı öğrenci anlamsız bir veritabanı
  -- hatası görürdü.
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

  -- Açık sayaç varsa önce durdurulur: işaretlenen blokta sayaç işlemeye
  -- devam etmesin.
  IF blok.sayac_baslangic IS NOT NULL THEN
    PERFORM public.calisma_sayaci(p_blok, 'durdur');
  END IF;

  UPDATE calisma_bloklari
     SET yapildi = p_yapildi,
         calisilan_dk = COALESCE(p_calisilan_dk, calisilan_dk)
   WHERE id = p_blok;

  IF p_soru IS NOT NULL THEN
    SELECT id INTO test_id FROM test_sessions WHERE blok_id = p_blok;
    IF test_id IS NULL THEN
      INSERT INTO test_sessions
        (student_id, subject, topic, question_count, correct_count, yanlis_count, blok_id)
      VALUES
        (ogrenci, COALESCE(blok.ders, 'Genel'), COALESCE(blok.konu, blok.baslik),
         p_soru, COALESCE(p_dogru, 0), p_yanlis, p_blok)
      RETURNING id INTO test_id;
    ELSE
      UPDATE test_sessions
         SET question_count = p_soru,
             correct_count  = COALESCE(p_dogru, 0),
             yanlis_count   = p_yanlis
       WHERE id = test_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('test_id', test_id);
END $$;

REVOKE ALL ON FUNCTION public.calisma_blogu_tamamla(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calisma_blogu_tamamla(UUID, BOOLEAN, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;


-- ------------------------------------------------------------
-- 7. Haftalık özete plan sütunları
--
-- İmza (p_student, p_hafta) BİREBİR aynı: 42P13 tuzağına düşmemek için.
-- Gövde gorev_tamamlanma_migration.sql'deki SON sürümün aynısı; yalnızca
-- plan satırları eklendi. O dosyadan sonra fonksiyonu yeniden tanımlayan
-- başka bir migration yok (kontrol edildi) — eski bir sürümü genişletip
-- gorev_yapilan'ı sessizce geri almıyoruz.
-- ------------------------------------------------------------
ALTER TABLE ogrenci_haftalik
  ADD COLUMN IF NOT EXISTS plan_blok     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_yapilan  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_dk       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calisilan_dk  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sayac_dk      INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN ogrenci_haftalik.plan_blok IS
  'O haftanın planındaki blok sayısı (planın haftasına göre).';
COMMENT ON COLUMN ogrenci_haftalik.calisilan_dk IS
  'Öğrencinin bildirdiği çalışma süresi. sayac_dk ise sayacın ölçtüğü kısmı.';

CREATE OR REPLACE FUNCTION public.haftalik_ozet_hesapla(p_student UUID, p_hafta DATE)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b DATE := date_trunc('week', p_hafta)::date;
  s DATE := b + 7;
  v RECORD;
BEGIN
  SELECT
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student
        AND COALESCE(t.due_date, t.created_at::date) >= b
        AND COALESCE(t.due_date, t.created_at::date) <  s) AS g_verilen,
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student AND t.is_done
        AND COALESCE(t.due_date, t.created_at::date) >= b
        AND COALESCE(t.due_date, t.created_at::date) <  s) AS g_tamam,
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student AND t.is_done
        AND COALESCE(t.tamamlanma_tarihi::date, t.due_date, t.created_at::date) >= b
        AND COALESCE(t.tamamlanma_tarihi::date, t.due_date, t.created_at::date) <  s) AS g_yapilan,
    (SELECT count(*) FROM tasks t
      WHERE t.student_id = p_student AND t.ogretmen_onayi = 'iade_edildi'
        AND COALESCE(t.due_date, t.created_at::date) >= b
        AND COALESCE(t.due_date, t.created_at::date) <  s) AS g_iade,

    (SELECT count(*) FROM test_sessions x
      WHERE x.student_id = p_student
        AND x.created_at >= b AND x.created_at < s) AS t_sayi,
    (SELECT count(*) FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS t_ayrintili,
    (SELECT COALESCE(sum(x.question_count), 0) FROM test_sessions x
      WHERE x.student_id = p_student
        AND x.created_at >= b AND x.created_at < s) AS s_toplam,
    (SELECT COALESCE(sum(x.correct_count), 0) FROM test_sessions x
      WHERE x.student_id = p_student
        AND x.created_at >= b AND x.created_at < s) AS s_dogru,
    (SELECT COALESCE(sum(x.yanlis_count), 0) FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS s_yanlis,
    (SELECT COALESCE(sum(x.question_count - x.correct_count - x.yanlis_count), 0)
       FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS s_bos,
    (SELECT sum(x.correct_count - x.yanlis_count / 4.0) FROM test_sessions x
      WHERE x.student_id = p_student AND x.yanlis_count IS NOT NULL
        AND x.created_at >= b AND x.created_at < s) AS t_net,

    (SELECT count(*) FROM exam_results e
      WHERE e.student_id = p_student
        AND e.exam_date >= b AND e.exam_date < s) AS sv_sayi,
    (SELECT avg(e.total_net) FROM exam_results e
      WHERE e.student_id = p_student AND e.total_net IS NOT NULL
        AND e.exam_date >= b AND e.exam_date < s) AS sv_net,

    (SELECT count(*) FROM lessons l
      WHERE l.student_id = p_student AND l.status = 'onaylandi'
        AND l.lesson_date >= b AND l.lesson_date < s) AS d_plan,
    (SELECT count(*) FROM lessons l
      WHERE l.student_id = p_student AND l.katilim IN ('geldi', 'gec_geldi')
        AND l.lesson_date >= b AND l.lesson_date < s) AS d_geldi,
    (SELECT count(*) FROM lessons l
      WHERE l.student_id = p_student AND l.katilim = 'gelmedi'
        AND l.lesson_date >= b AND l.lesson_date < s) AS d_gelmedi,

    -- Plan: bloğun ait olduğu PLANIN haftası. Geç yapılan bloğun testi
    -- yapıldığı haftada sayılıyor (test_sessions.created_at); bloğun
    -- kendisi planın haftasında. Görevlerdeki "ait olduğu hafta / fiilen
    -- yapıldığı hafta" ayrımının aynısı.
    (SELECT count(*) FROM calisma_bloklari k JOIN calisma_planlari p ON p.id = k.plan_id
      WHERE p.student_id = p_student AND p.hafta_basi = b) AS p_blok,
    (SELECT count(*) FROM calisma_bloklari k JOIN calisma_planlari p ON p.id = k.plan_id
      WHERE p.student_id = p_student AND p.hafta_basi = b AND k.yapildi) AS p_yapilan,
    (SELECT COALESCE(sum(k.sure_dk), 0) FROM calisma_bloklari k JOIN calisma_planlari p ON p.id = k.plan_id
      WHERE p.student_id = p_student AND p.hafta_basi = b) AS p_dk,
    (SELECT COALESCE(sum(k.calisilan_dk), 0) FROM calisma_bloklari k JOIN calisma_planlari p ON p.id = k.plan_id
      WHERE p.student_id = p_student AND p.hafta_basi = b) AS p_calisilan,
    (SELECT COALESCE(sum(k.sayacla_olculen_dk), 0) FROM calisma_bloklari k JOIN calisma_planlari p ON p.id = k.plan_id
      WHERE p.student_id = p_student AND p.hafta_basi = b) AS p_sayac
  INTO v;

  INSERT INTO ogrenci_haftalik AS o (
    student_id, hafta,
    gorev_verilen, gorev_tamamlanan, gorev_yapilan, gorev_iade,
    test_sayisi, test_ayrintili, soru_toplam, soru_dogru, soru_yanlis, soru_bos, test_net,
    sinav_sayisi, sinav_net_ort,
    ders_planlanan, ders_geldi, ders_gelmedi,
    plan_blok, plan_yapilan, plan_dk, calisilan_dk, sayac_dk,
    hesaplanma
  ) VALUES (
    p_student, b,
    v.g_verilen, v.g_tamam, v.g_yapilan, v.g_iade,
    v.t_sayi, v.t_ayrintili, v.s_toplam, v.s_dogru, v.s_yanlis, v.s_bos, v.t_net,
    v.sv_sayi, v.sv_net,
    v.d_plan, v.d_geldi, v.d_gelmedi,
    v.p_blok, v.p_yapilan, v.p_dk, v.p_calisilan, v.p_sayac,
    now()
  )
  ON CONFLICT (student_id, hafta) DO UPDATE SET
    gorev_verilen = EXCLUDED.gorev_verilen,
    gorev_tamamlanan = EXCLUDED.gorev_tamamlanan,
    gorev_yapilan = EXCLUDED.gorev_yapilan,
    gorev_iade = EXCLUDED.gorev_iade,
    test_sayisi = EXCLUDED.test_sayisi,
    test_ayrintili = EXCLUDED.test_ayrintili,
    soru_toplam = EXCLUDED.soru_toplam,
    soru_dogru = EXCLUDED.soru_dogru,
    soru_yanlis = EXCLUDED.soru_yanlis,
    soru_bos = EXCLUDED.soru_bos,
    test_net = EXCLUDED.test_net,
    sinav_sayisi = EXCLUDED.sinav_sayisi,
    sinav_net_ort = EXCLUDED.sinav_net_ort,
    ders_planlanan = EXCLUDED.ders_planlanan,
    ders_geldi = EXCLUDED.ders_geldi,
    ders_gelmedi = EXCLUDED.ders_gelmedi,
    plan_blok = EXCLUDED.plan_blok,
    plan_yapilan = EXCLUDED.plan_yapilan,
    plan_dk = EXCLUDED.plan_dk,
    calisilan_dk = EXCLUDED.calisilan_dk,
    sayac_dk = EXCLUDED.sayac_dk,
    hesaplanma = now();
END $$;

REVOKE ALL ON FUNCTION public.haftalik_ozet_hesapla(UUID, DATE)
  FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 8. Plan değişince özet kendiliğinden tazelensin
--
-- Sürükle-bırak yalnızca gün/dilim/sıra değiştiriyor ve özeti
-- etkilemiyor; o güncellemelerde hesaplama ATLANIYOR. Yoksa her
-- sürüklemede ~25 alt sorgu çalışırdı.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_ozet_tazele_plan_blok()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r RECORD;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
     AND NEW.yapildi IS NOT DISTINCT FROM OLD.yapildi
     AND NEW.sure_dk IS NOT DISTINCT FROM OLD.sure_dk
     AND NEW.calisilan_dk IS NOT DISTINCT FROM OLD.calisilan_dk
     AND NEW.sayacla_olculen_dk IS NOT DISTINCT FROM OLD.sayacla_olculen_dk
  THEN
    RETURN NEW;
  END IF;

  -- Plan silinirken (CASCADE) plan satırı artık yok: sorgu boş döner,
  -- hesaplamayı plan tetikleyicisi yapıyor.
  FOR r IN
    SELECT DISTINCT p.student_id, p.hafta_basi FROM calisma_planlari p
     WHERE p.id IN (CASE WHEN TG_OP <> 'INSERT' THEN OLD.plan_id END,
                    CASE WHEN TG_OP <> 'DELETE' THEN NEW.plan_id END)
  LOOP
    PERFORM haftalik_ozet_hesapla(r.student_id, r.hafta_basi);
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.trg_ozet_tazele_plan_blok() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plan_blok_ozet_tazele ON calisma_bloklari;
CREATE TRIGGER plan_blok_ozet_tazele
  AFTER INSERT OR UPDATE OR DELETE ON calisma_bloklari
  FOR EACH ROW EXECUTE FUNCTION public.trg_ozet_tazele_plan_blok();

CREATE OR REPLACE FUNCTION public.trg_ozet_tazele_plan()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.hafta_basi);
  RETURN OLD;
END $$;

REVOKE ALL ON FUNCTION public.trg_ozet_tazele_plan() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS plan_ozet_tazele ON calisma_planlari;
CREATE TRIGGER plan_ozet_tazele
  AFTER DELETE ON calisma_planlari
  FOR EACH ROW EXECUTE FUNCTION public.trg_ozet_tazele_plan();


-- Planı olan haftalar yeni sütunlarla bir kez hesaplanıyor
DO $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT DISTINCT student_id, hafta_basi FROM calisma_planlari LOOP
    PERFORM haftalik_ozet_hesapla(r.student_id, r.hafta_basi);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'plan haftalari ozete islendi: %', n;
END $$;


-- ------------------------------------------------------------
-- 9. Kendi kendini sınayan doğrulama
--
-- Gerçek bir koç–öğrenci çiftiyle, 2099'daki bir haftada:
--   a) öğrenci bloğun SAATİNİ değiştiremez
--   b) öğrenci sayac_baslangic'i doğrudan GERİYE ÇEKEMEZ
--   c) sayaç ölçüyor (başlangıç sunucu bağlamında 20 dk geriye alınıp durdurulur)
--   d) tamamla: blok işaretlenir, BAĞLI test açılır, ikinci çağrı ikinci
--      test AÇMAZ, günceller
--   e) özet: plan_blok / plan_yapilan / calisilan_dk / sayac_dk doğru
--   f) doğru+yanlış > soru anlaşılır hatayla reddedilir
-- Tutmazsa her şey geri alınır.
--
-- ── SINAMA GERÇEK KİŞİLERE DOKUNMAMALI ───────────────────────
-- test_sessions'a yazılan her satır iki yan etkili tetikleyiciyi
-- çalıştırıyor: koça "öğrenci test ekledi" bildirimi (bildirim_test) ve
-- rozet hesabı (rozet_test). Sınama bunlarla çalışsaydı gerçek koça sahte
-- bir bildirim gider, gerçek öğrenciye rozet verilebilirdi. Bu iki
-- tetikleyici YALNIZCA sınama boyunca kapatılıyor; özet tetikleyicisi
-- açık kalıyor, çünkü sınanan şey o. ALTER TABLE işlemsel: sınama
-- patlarsa geri alma tetikleyicileri de eski hâline döndürüyor.
-- ------------------------------------------------------------
DO $$
DECLARE
  ogr UUID; koc UUID; h_ DATE := date_trunc('week', date '2099-06-17')::date;
  plan_ UUID; blok_ UUID; say INTEGER; ozet RECORD; red BOOLEAN; t_ UUID;
  tetik TEXT; kapatilan TEXT[] := '{}';
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

  INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
  VALUES (ogr, koc, h_) RETURNING id INTO plan_;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, ders, konu, sure_dk, baslangic_saati, bitis_saati)
  VALUES (plan_, 1, 'aksam', 'konu', 'sinama', 'Matematik', 'Sınama Konusu', 45, '18:00', '18:45')
  RETURNING id INTO blok_;

  -- a) öğrenci saati değiştiremez
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  red := false;
  BEGIN
    UPDATE calisma_bloklari SET baslangic_saati = '10:00' WHERE id = blok_;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA a: ogrenci blok saatini degistirebildi'; END IF;

  -- b) öğrenci sayacı doğrudan geriye çekemez
  red := false;
  BEGIN
    UPDATE calisma_bloklari SET sayac_baslangic = now() - interval '3 hours' WHERE id = blok_;
  EXCEPTION WHEN insufficient_privilege THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: ogrenci sayaci dogrudan yazabildi'; END IF;

  -- c) sayaç: başlat, başlangıcı (sunucu bağlamında) 20 dk geriye al, durdur
  PERFORM calisma_sayaci(blok_, 'basla');
  PERFORM set_config('request.jwt.claims', '', true);
  UPDATE calisma_bloklari SET sayac_baslangic = now() - interval '20 minutes' WHERE id = blok_;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  PERFORM calisma_sayaci(blok_, 'durdur');
  SELECT sayacla_olculen_dk INTO say FROM calisma_bloklari WHERE id = blok_;
  IF say <> 20 THEN RAISE EXCEPTION 'SINAMA c: sayac 20 yerine % dk olctu', say; END IF;

  -- f) tutarsız sayılar anlaşılır hatayla reddedilir
  red := false;
  BEGIN
    PERFORM calisma_blogu_tamamla(blok_, true, 30, 10, 8, 5);
  EXCEPTION WHEN raise_exception THEN red := true;
  END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA f: dogru+yanlis > soru kabul edildi'; END IF;

  -- d) tamamla: bağlı test açılır; ikinci çağrı günceller
  PERFORM calisma_blogu_tamamla(blok_, true, 30, 20, 15, 3);
  PERFORM calisma_blogu_tamamla(blok_, true, 35, 20, 16, 2);
  SELECT count(*) INTO say FROM test_sessions WHERE blok_id = blok_;
  IF say <> 1 THEN RAISE EXCEPTION 'SINAMA d: bloga % test baglandi (1 bekleniyor)', say; END IF;
  SELECT id INTO t_ FROM test_sessions WHERE blok_id = blok_;
  IF (SELECT correct_count FROM test_sessions WHERE id = t_) <> 16 THEN
    RAISE EXCEPTION 'SINAMA d: ikinci cagri testi guncellemedi';
  END IF;

  -- e) özet
  -- Değişken adı h_: "hafta" hem sütun hem değişken olsaydı PL/pgSQL
  -- belirsiz sütun hatası verirdi.
  SELECT * INTO ozet FROM ogrenci_haftalik o WHERE o.student_id = ogr AND o.hafta = h_;
  IF ozet.plan_blok <> 1 OR ozet.plan_yapilan <> 1 OR ozet.plan_dk <> 45
     OR ozet.calisilan_dk <> 35 OR ozet.sayac_dk <> 20 THEN
    RAISE EXCEPTION 'SINAMA e: ozet yanlis (blok %, yapilan %, plan_dk %, calisilan %, sayac %)',
      ozet.plan_blok, ozet.plan_yapilan, ozet.plan_dk, ozet.calisilan_dk, ozet.sayac_dk;
  END IF;

  -- Temizlik. Test gerçek haftaya (bugün) yazıldı; silinince o haftanın
  -- özeti de tetikleyiciyle eski hâline dönüyor.
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM test_sessions WHERE blok_id = blok_;
  DELETE FROM calisma_planlari WHERE id = plan_;
  DELETE FROM ogrenci_haftalik o WHERE o.student_id = ogr AND o.hafta = h_;

  FOREACH tetik IN ARRAY kapatilan LOOP
    EXECUTE format('ALTER TABLE public.test_sessions ENABLE TRIGGER %I', tetik);
  END LOOP;

  RAISE NOTICE 'plan_takip: 6 davranis sinamasi gecti.';
END $$;
