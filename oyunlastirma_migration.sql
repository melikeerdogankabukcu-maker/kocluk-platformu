-- ============================================================
-- Migration: oyunlaştırma — XP, seviye, avatar ve yeni rozetler
--
-- XP hiçbir yerde SAKLANMAZ; her zaman mevcut veriden hesaplanır.
-- Böylece sayaç kayması olmaz ve öğrenci kendine puan yazamaz.
-- Seviye eşikleri ve avatar aşamaları arayüzde (src/lib/gamification.js).
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- Öğrencinin seçtiği avatar türü (görsel tercih; ilerleme XP'den gelir)
ALTER TABLE student_profiles
  ADD COLUMN IF NOT EXISTS avatar_tur TEXT NOT NULL DEFAULT 'agac';

-- ============================================================
-- XP hesabı
-- ============================================================
CREATE OR REPLACE FUNCTION ogrenci_puan(p_user UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_odev INT; v_sinav INT;
  v_ders INT; v_adim INT; v_rozet INT; v_artis INT := 0;
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

  -- Net artışı olan her sınav türü için bonus
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
        + v_ders * 10 + v_adim * 8 + v_rozet * 25 + v_artis * 30;

  RETURN jsonb_build_object(
    'xp', v_xp,
    'kirilim', jsonb_build_object(
      'gorev', v_gorev, 'test', v_test, 'odev', v_odev, 'sinav', v_sinav,
      'ders', v_ders, 'program_adimi', v_adim, 'rozet', v_rozet, 'net_artisi', v_artis
    )
  );
END; $$;

GRANT EXECUTE ON FUNCTION ogrenci_puan(UUID) TO authenticated;

-- ============================================================
-- Rozet ölçütleri genişletildi (öncekiler korunuyor)
-- ============================================================
CREATE OR REPLACE FUNCTION rozetleri_guncelle(p_user UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_sinav INT; v_odev INT; v_ders INT;
  v_son NUMERIC; v_onceki NUMERIC; v_fark NUMERIC; v_enyuksek NUMERIC;
  v_xp INT; v_hafta INT;
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

  -- Net kilometre taşları (herhangi bir sınav türündeki en yüksek net)
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

  -- Program hedefleri
  FOR r IN SELECT * FROM program_atamalari WHERE student_id = p_user LOOP
    IF r.toplam_satir > 0
       AND jsonb_array_length(r.tamamlananlar) >= r.toplam_satir THEN
      PERFORM rozet_ver(p_user, 'program_tamam', 'Program Bitti');
    END IF;
    -- Tamamlanmış hafta sayısı
    SELECT count(*) INTO v_hafta
    FROM (SELECT split_part(k, '-', 1) AS hafta, count(*) AS adet
          FROM jsonb_array_elements_text(r.tamamlananlar) k
          GROUP BY 1) t
    WHERE (r.hafta_satirlari ->> t.hafta)::int IS NOT NULL
      AND t.adet >= (r.hafta_satirlari ->> t.hafta)::int;
    IF v_hafta >= 1 THEN PERFORM rozet_ver(p_user, 'hafta_tamam',  'Haftayı Bitirdin'); END IF;
    IF v_hafta >= 4 THEN PERFORM rozet_ver(p_user, 'hafta_4',      'Dört Hafta Aralıksız'); END IF;
  END LOOP;

  -- Seviye rozetleri (XP eşikleri src/lib/gamification.js ile aynı formül: 25*(n-1)*n)
  v_xp := (ogrenci_puan(p_user) ->> 'xp')::int;
  IF v_xp >=  500 THEN PERFORM rozet_ver(p_user, 'seviye_5',  'Seviye 5');  END IF;  -- 25*4*5
  IF v_xp >= 2250 THEN PERFORM rozet_ver(p_user, 'seviye_10', 'Seviye 10'); END IF;  -- 25*9*10
END; $$;

-- Rozet kazanılınca XP de arttığı için seviye rozetleri bir sonraki
-- tetiklemede yakalanır; bu kasıtlı (sonsuz döngü olmasın diye).

-- Doğrulama:
--   SELECT ogrenci_puan('<student-uuid>');
--   SELECT rozet_kod FROM badges WHERE user_id = '<student-uuid>';
