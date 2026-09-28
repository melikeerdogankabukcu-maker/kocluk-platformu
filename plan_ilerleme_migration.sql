-- ============================================================
-- HAFTALIK PLAN, ÖĞRENCİNİN İLERLEMESİNE SAYILIYOR
--
-- Sorun: XP, seviye ve rozetler yalnızca görev, test, ödev, ders ve
-- program adımlarına bakıyordu. Haftalık çalışma planında yapılan iş
-- hiçbirine girmiyordu — öğrenci planı bitirse bile puanı kıpırdamıyordu.
--
-- Ölçü "yapıldı" işareti (görevlerdeki kuralın aynısı): öğrenci bloğu
-- tamamlar tamamlamaz sayılıyor. Koç iade ederse blok yeniden açıldığı
-- için puan da kendiliğinden geri düşüyor — XP hiçbir yerde saklanmıyor,
-- her sorguda taze hesaplanıyor.
--
-- Önkoşul: oyunlastirma_migration.sql, program_rozet_migration.sql,
--          calisma_plani_migration.sql.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================


-- ------------------------------------------------------------
-- 1. XP hesabına plan bloğu
--
-- Ağırlık 8: bir görevden (10) küçük, bir test kaydından (5) büyük.
-- Plan bloğu görevden daha küçük bir iş parçası ama çoğu zaman ölçülmüş
-- bir çalışma (süre + test) taşıyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ogrenci_puan(p_user UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_odev INT; v_sinav INT;
  v_ders INT; v_adim INT; v_rozet INT; v_artis INT := 0;
  v_blok INT;
  r RECORD; v_son NUMERIC; v_onceki NUMERIC;
  v_xp INT;
BEGIN
  SELECT count(*) INTO v_gorev FROM tasks         WHERE student_id = p_user AND is_done;
  SELECT count(*) INTO v_test  FROM test_sessions WHERE student_id = p_user;
  SELECT count(*) INTO v_sinav FROM exam_results  WHERE student_id = p_user;
  SELECT count(*) INTO v_odev  FROM homework_submissions
    WHERE student_id = p_user AND status = 'onaylandi';
  SELECT count(*) INTO v_ders  FROM lessons
    WHERE student_id = p_user AND completed;
  SELECT count(*) INTO v_rozet FROM badges        WHERE user_id = p_user;
  SELECT COALESCE(sum(jsonb_array_length(tamamlananlar)), 0) INTO v_adim
    FROM program_atamalari WHERE student_id = p_user;

  -- Haftalık plandaki tamamlanmış bloklar
  SELECT count(*) INTO v_blok
    FROM calisma_bloklari k
    JOIN calisma_planlari p ON p.id = k.plan_id
   WHERE p.student_id = p_user AND k.yapildi;

  FOR r IN SELECT exam_type FROM exam_results
           WHERE student_id = p_user AND total_net IS NOT NULL
           GROUP BY exam_type HAVING count(*) >= 2 LOOP
    SELECT total_net INTO v_son FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC LIMIT 1;
    SELECT total_net INTO v_onceki FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC OFFSET 1 LIMIT 1;
    IF COALESCE(v_son,0) > COALESCE(v_onceki,0) THEN v_artis := v_artis + 1; END IF;
  END LOOP;

  v_xp := v_gorev * 10 + v_test * 5 + v_odev * 15 + v_sinav * 20
        + v_ders * 10 + v_adim * 8 + v_rozet * 25 + v_artis * 30
        + v_blok * 8;

  RETURN jsonb_build_object(
    'xp', v_xp,
    'kirilim', jsonb_build_object(
      'gorev', v_gorev, 'test', v_test, 'odev', v_odev, 'sinav', v_sinav,
      'ders', v_ders, 'program_adimi', v_adim, 'rozet', v_rozet,
      'net_artisi', v_artis, 'plan_blogu', v_blok
    )
  );
END; $$;

REVOKE ALL ON FUNCTION ogrenci_puan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ogrenci_puan(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 2. Plan rozetleri
--
-- Gövde oyunlastirma_migration.sql'deki SON sürümün aynısı; yalnızca
-- plan bölümü eklendi. (İki migration'da iki ayrı sürüm var; zengin olan
-- bu. Rozet verme idempotent olduğu için hangisi yüklüyse olsun, bu
-- sürüm eksik ölçütleri de tamamlıyor.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION rozetleri_guncelle(p_user UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_sinav INT; v_odev INT; v_ders INT;
  v_son NUMERIC; v_onceki NUMERIC; v_fark NUMERIC; v_enyuksek NUMERIC;
  v_xp INT; v_hafta INT; v_blok INT; v_tam_hafta INT;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_gorev FROM tasks           WHERE student_id = p_user AND is_done;
  SELECT count(*) INTO v_test  FROM test_sessions   WHERE student_id = p_user;
  SELECT count(*) INTO v_sinav FROM exam_results    WHERE student_id = p_user;
  SELECT count(*) INTO v_odev  FROM homework_submissions
    WHERE student_id = p_user AND status = 'onaylandi';
  SELECT count(*) INTO v_ders  FROM lessons WHERE student_id = p_user AND completed;

  -- Görev
  IF v_gorev >=   1 THEN PERFORM rozet_ver(p_user, 'ilk_gorev',  'İlk Adım');   END IF;
  IF v_gorev >=  10 THEN PERFORM rozet_ver(p_user, 'gorev_10',   'Düzenli');    END IF;
  IF v_gorev >=  50 THEN PERFORM rozet_ver(p_user, 'gorev_50',   'Azimli');     END IF;
  IF v_gorev >= 100 THEN PERFORM rozet_ver(p_user, 'gorev_100',  'Yılmaz');     END IF;
  -- Test
  IF v_test  >=   1 THEN PERFORM rozet_ver(p_user, 'ilk_test',   'Deneme Başlangıcı'); END IF;
  IF v_test  >=  25 THEN PERFORM rozet_ver(p_user, 'test_25',    'Soru Avcısı'); END IF;
  IF v_test  >= 100 THEN PERFORM rozet_ver(p_user, 'test_100',   'Soru Ustası'); END IF;
  -- Ödev
  IF v_odev  >=   5 THEN PERFORM rozet_ver(p_user, 'odev_5',     'Ödevci');     END IF;
  IF v_odev  >=  20 THEN PERFORM rozet_ver(p_user, 'odev_20',    'Titiz');      END IF;
  -- Ders
  IF v_ders  >=  10 THEN PERFORM rozet_ver(p_user, 'ders_10',    'Sadık Öğrenci'); END IF;
  -- Sınav
  IF v_sinav >=   1 THEN PERFORM rozet_ver(p_user, 'ilk_sinav',  'İlk Deneme'); END IF;
  IF v_sinav >=  10 THEN PERFORM rozet_ver(p_user, 'sinav_10',   'Deneme Maratonu'); END IF;

  -- ── PLAN ────────────────────────────────────────────────────
  SELECT count(*) INTO v_blok
    FROM calisma_bloklari k
    JOIN calisma_planlari p ON p.id = k.plan_id
   WHERE p.student_id = p_user AND k.yapildi;

  IF v_blok >=   1 THEN PERFORM rozet_ver(p_user, 'ilk_blok',  'Plana Başladın'); END IF;
  IF v_blok >=  25 THEN PERFORM rozet_ver(p_user, 'blok_25',   'Plana Sadık');    END IF;
  IF v_blok >= 100 THEN PERFORM rozet_ver(p_user, 'blok_100',  'Plan Ustası');    END IF;

  -- Bütünüyle tamamlanmış hafta (en az 3 bloklu bir plan)
  SELECT count(*) INTO v_tam_hafta
    FROM calisma_planlari p
   WHERE p.student_id = p_user
     AND (SELECT count(*) FROM calisma_bloklari k WHERE k.plan_id = p.id) >= 3
     AND NOT EXISTS (SELECT 1 FROM calisma_bloklari k WHERE k.plan_id = p.id AND NOT k.yapildi);

  IF v_tam_hafta >= 1 THEN PERFORM rozet_ver(p_user, 'plan_haftasi', 'Haftanın Tamamı'); END IF;
  IF v_tam_hafta >= 4 THEN PERFORM rozet_ver(p_user, 'plan_hafta_4', 'Dört Hafta Eksiksiz'); END IF;

  -- Net kilometre taşları
  SELECT max(total_net) INTO v_enyuksek FROM exam_results WHERE student_id = p_user;
  IF v_enyuksek >=  50 THEN PERFORM rozet_ver(p_user, 'net_50',  '50 Net');  END IF;
  IF v_enyuksek >=  75 THEN PERFORM rozet_ver(p_user, 'net_75',  '75 Net');  END IF;
  IF v_enyuksek >= 100 THEN PERFORM rozet_ver(p_user, 'net_100', '100 Net'); END IF;

  -- Net artışı
  FOR r IN SELECT exam_type FROM exam_results
           WHERE student_id = p_user AND total_net IS NOT NULL
           GROUP BY exam_type HAVING count(*) >= 2 LOOP
    SELECT total_net INTO v_son FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC LIMIT 1;
    SELECT total_net INTO v_onceki FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC OFFSET 1 LIMIT 1;
    v_fark := COALESCE(v_son, 0) - COALESCE(v_onceki, 0);
    IF v_fark >   0 THEN PERFORM rozet_ver(p_user, 'net_artis',    'Yükseliş'); END IF;
    IF v_fark >= 10 THEN PERFORM rozet_ver(p_user, 'net_artis_10', 'Sıçrama');  END IF;
  END LOOP;

  -- Program hedefleri (program kütüphanesinden atanan programlar)
  FOR r IN SELECT * FROM program_atamalari WHERE student_id = p_user LOOP
    IF r.toplam_satir > 0
       AND jsonb_array_length(r.tamamlananlar) >= r.toplam_satir THEN
      PERFORM rozet_ver(p_user, 'program_tamam', 'Program Bitti');
    END IF;
    SELECT count(*) INTO v_hafta
    FROM (SELECT split_part(k, '-', 1) AS hafta, count(*) AS adet
          FROM jsonb_array_elements_text(r.tamamlananlar) k
          GROUP BY 1) t
    WHERE (r.hafta_satirlari ->> t.hafta)::int IS NOT NULL
      AND t.adet >= (r.hafta_satirlari ->> t.hafta)::int;
    IF v_hafta >= 1 THEN PERFORM rozet_ver(p_user, 'hafta_tamam',  'Haftayı Bitirdin'); END IF;
    IF v_hafta >= 4 THEN PERFORM rozet_ver(p_user, 'hafta_4',      'Dört Hafta Aralıksız'); END IF;
  END LOOP;

  -- Seviye rozetleri
  v_xp := (ogrenci_puan(p_user) ->> 'xp')::int;
  IF v_xp >=  500 THEN PERFORM rozet_ver(p_user, 'seviye_5',  'Seviye 5');  END IF;
  IF v_xp >= 2250 THEN PERFORM rozet_ver(p_user, 'seviye_10', 'Seviye 10'); END IF;
END; $$;

REVOKE ALL ON FUNCTION rozetleri_guncelle(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rozetleri_guncelle(UUID) TO authenticated;


-- ------------------------------------------------------------
-- 3. Blok işaretlenince rozetler tazelensin
--
-- Yalnızca "yapılmadı → yapıldı" geçişinde: sürükle-bırak, saat
-- düzenleme ya da toplu onayda geri alma her satır için ağır rozet
-- hesabını çalıştırmasın.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_rozet_plan_blogu()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ogrenci UUID;
BEGIN
  SELECT student_id INTO ogrenci FROM calisma_planlari WHERE id = NEW.plan_id;
  IF ogrenci IS NOT NULL THEN
    PERFORM rozetleri_guncelle(ogrenci);
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_rozet_plan_blogu() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rozet_plan_blogu ON calisma_bloklari;
CREATE TRIGGER rozet_plan_blogu
  AFTER UPDATE OF yapildi ON calisma_bloklari
  FOR EACH ROW
  WHEN (NEW.yapildi AND NOT OLD.yapildi)
  EXECUTE FUNCTION public.trg_rozet_plan_blogu();


-- ------------------------------------------------------------
-- 4. Var olan öğrencilere plan rozetleri
--
-- Rozetler yalnızca tetikleyiciyle veriliyordu; bu migration'dan önce
-- tamamlanmış bloklar için kimse rozet almamıştı. Bir kez herkes için
-- tazeleniyor — hak edilmiş rozet, bir sonraki bloğu beklemesin.
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD; n INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM users WHERE role = 'student' LOOP
    PERFORM rozetleri_guncelle(r.id);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'rozetler tazelendi: % ogrenci', n;
END $$;


-- ------------------------------------------------------------
-- 5. Kendi kendini sınayan doğrulama
--
-- Gerçek bir koç–öğrenci çiftiyle, 2099'daki bir haftada:
--   a) blok işaretlenince XP artıyor (blok başına 8) ve kırılımda görünüyor
--   b) işaret kalkınca XP geri düşüyor (XP saklanmıyor, hesaplanıyor)
--   c) rozet tetikleyicisi çalışıyor
--   d) haftanın tamamı yapılınca 'plan_haftasi' ölçütü tutuyor
--
-- Sınamanın açtığı plan, sınama sırasında verilmiş rozetler ve onların
-- bildirimleri siliniyor; sonra rozetler GERÇEK veriye göre yeniden
-- hesaplanıyor. Böylece sahte veriden rozet kalmıyor, hak edilen kalıyor.
-- ------------------------------------------------------------
DO $$
DECLARE
  ogr UUID; koc UUID; h_ DATE := date_trunc('week', date '2099-09-14')::date;
  plan_ UUID; b1 UUID; b2 UUID; b3 UUID;
  t0 TIMESTAMPTZ := clock_timestamp();
  xp0 INT; xp1 INT; kirilim INT;
BEGIN
  SELECT teacher_id, student_id INTO koc, ogr
    FROM teacher_students WHERE durum = 'onaylandi' LIMIT 1;
  IF ogr IS NULL THEN
    RAISE NOTICE 'onayli koc-ogrenci cifti yok; davranis sinamasi atlandi.';
    RETURN;
  END IF;

  SELECT (ogrenci_puan(ogr) ->> 'xp')::int INTO xp0;

  INSERT INTO calisma_planlari (student_id, teacher_id, hafta_basi)
  VALUES (ogr, koc, h_) RETURNING id INTO plan_;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, sure_dk)
  VALUES (plan_, 0, 'sabah', 'serbest', 'sinama 1', 30) RETURNING id INTO b1;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, sure_dk)
  VALUES (plan_, 1, 'ogle', 'serbest', 'sinama 2', 30) RETURNING id INTO b2;
  INSERT INTO calisma_bloklari (plan_id, gun, dilim, tur, baslik, sure_dk)
  VALUES (plan_, 2, 'aksam', 'serbest', 'sinama 3', 30) RETURNING id INTO b3;

  -- a) tek blok işaretle → XP artmalı, kırılımda görünmeli
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ogr)::text, true);
  UPDATE calisma_bloklari SET yapildi = true WHERE id = b1;

  SELECT (ogrenci_puan(ogr) ->> 'xp')::int INTO xp1;
  IF xp1 < xp0 + 8 THEN
    RAISE EXCEPTION 'SINAMA a: XP artmadi (% -> %)', xp0, xp1;
  END IF;

  -- c) rozet tetikleyicisi çalıştı mı: 'ilk_blok' ölçütü artık tutuyor
  IF NOT EXISTS (SELECT 1 FROM badges WHERE user_id = ogr AND rozet_kod = 'ilk_blok') THEN
    RAISE EXCEPTION 'SINAMA c: ilk_blok rozeti verilmedi';
  END IF;

  -- d) haftanın tamamı
  UPDATE calisma_bloklari SET yapildi = true WHERE id IN (b2, b3);
  IF NOT EXISTS (SELECT 1 FROM badges WHERE user_id = ogr AND rozet_kod = 'plan_haftasi') THEN
    RAISE EXCEPTION 'SINAMA d: plan_haftasi rozeti verilmedi';
  END IF;

  -- b) işaret kalkınca sayı geri düşüyor
  UPDATE calisma_bloklari SET yapildi = false WHERE plan_id = plan_;
  SELECT (ogrenci_puan(ogr) -> 'kirilim' ->> 'plan_blogu')::int INTO kirilim;
  SELECT count(*) INTO xp1
    FROM calisma_bloklari k JOIN calisma_planlari p ON p.id = k.plan_id
   WHERE p.student_id = ogr AND k.yapildi;
  IF kirilim <> xp1 THEN
    RAISE EXCEPTION 'SINAMA b: kirilim (%) gercek blok sayisiyla (%) uyusmuyor', kirilim, xp1;
  END IF;

  -- Temizlik
  PERFORM set_config('request.jwt.claims', '', true);
  DELETE FROM calisma_planlari WHERE id = plan_;
  DELETE FROM ogrenci_haftalik o WHERE o.student_id = ogr AND o.hafta = h_;
  DELETE FROM badges        WHERE user_id = ogr AND kazanildi_at >= t0;
  DELETE FROM notifications WHERE user_id = ogr AND tur = 'rozet' AND created_at >= t0;
  -- Gerçek veriye göre yeniden ver
  PERFORM rozetleri_guncelle(ogr);

  RAISE NOTICE 'plan_ilerleme: 4 davranis sinamasi gecti.';
END $$;
