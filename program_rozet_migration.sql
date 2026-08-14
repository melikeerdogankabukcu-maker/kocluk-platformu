-- ============================================================
-- Migration: çalışma programı + aralıklı hedefler + rozetler
--
-- Program tanımları kodda (src/lib/studyPrograms.js). Burada yalnızca
-- ÖĞRENCİYE ATAMA ve TAMAMLAMA durumu tutulur.
--
-- Tamamlanan satırlar "hafta-gün-satır" anahtarlarıyla bir JSONB dizide durur
-- (ör. ["1-0-0","1-0-1"]). Haftalık hedef kontrolü bu anahtarın ilk parçasından
-- yapılır, böylece hafta bazlı ilerleme SQL tarafında hesaplanabilir.
--
-- Rozetler VERİDEN türetilir ve tetikleyicilerle otomatik verilir; öğrenci
-- kendine rozet yazamaz.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ---------- Program atamaları ----------
CREATE TABLE IF NOT EXISTS program_atamalari (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  program_id     TEXT        NOT NULL,          -- 'yogun' | 'dengeli'
  baslangic      DATE        NOT NULL,
  toplam_satir   INT         NOT NULL DEFAULT 0,
  hafta_satirlari JSONB      NOT NULL DEFAULT '{}',  -- {"1":14,"2":12,...}
  tamamlananlar  JSONB       NOT NULL DEFAULT '[]',  -- ["1-0-0", ...]
  aktif          BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_program_atama_student ON program_atamalari (student_id, aktif);

ALTER TABLE program_atamalari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ogrenci kendi programi"      ON program_atamalari;
DROP POLICY IF EXISTS "Ogretmen ogrenci programlari" ON program_atamalari;
DROP POLICY IF EXISTS "Veli cocuk programi"          ON program_atamalari;

-- Öğrenci kendi programını görür ve işaretleyebilir
CREATE POLICY "Ogrenci kendi programi" ON program_atamalari
  FOR ALL USING (auth.uid() = student_id) WITH CHECK (auth.uid() = student_id);

-- Öğretmen kendi öğrencilerinin programını yönetir
CREATE POLICY "Ogretmen ogrenci programlari" ON program_atamalari
  FOR ALL USING (ogrencim_mi(student_id)) WITH CHECK (ogrencim_mi(student_id));

-- Veli çocuğunun programını görür
CREATE POLICY "Veli cocuk programi" ON program_atamalari
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = program_atamalari.student_id)
  );

-- ---------- Rozetler ----------
CREATE TABLE IF NOT EXISTS badges (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rozet_kod     TEXT        NOT NULL,
  kazanildi_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, rozet_kod)
);

ALTER TABLE badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kendi rozetlerini gorur"    ON badges;
DROP POLICY IF EXISTS "Ogretmen rozetleri gorur"   ON badges;
DROP POLICY IF EXISTS "Veli cocuk rozetleri gorur" ON badges;

CREATE POLICY "Kendi rozetlerini gorur" ON badges
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Ogretmen rozetleri gorur" ON badges
  FOR SELECT USING (ogrencim_mi(user_id));

CREATE POLICY "Veli cocuk rozetleri gorur" ON badges
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = badges.user_id)
  );
-- INSERT yok: rozetler yalnızca tetikleyicilerle verilir (kimse kendine yazamaz)

-- ---------- Rozet verme ----------
CREATE OR REPLACE FUNCTION rozet_ver(p_user UUID, p_kod TEXT, p_ad TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_eklenen INT := 0;
BEGIN
  INSERT INTO badges (user_id, rozet_kod) VALUES (p_user, p_kod)
  ON CONFLICT (user_id, rozet_kod) DO NOTHING;
  GET DIAGNOSTICS v_eklenen = ROW_COUNT;
  -- Yalnızca ilk kez kazanıldığında bildir
  IF v_eklenen > 0 THEN
    PERFORM bildirim_ekle(p_user, 'rozet', 'Yeni rozet kazandın! 🏅', p_ad, NULL);
  END IF;
END; $$;

-- Tüm rozet ölçütlerini kontrol eder; eksik olanları verir (idempotent).
CREATE OR REPLACE FUNCTION rozetleri_guncelle(p_user UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_sinav INT; v_odev INT;
  v_son NUMERIC; v_onceki NUMERIC; v_fark NUMERIC;
  r RECORD;
BEGIN
  SELECT count(*) INTO v_gorev FROM tasks           WHERE student_id = p_user AND is_done;
  SELECT count(*) INTO v_test  FROM test_sessions   WHERE student_id = p_user;
  SELECT count(*) INTO v_sinav FROM exam_results    WHERE student_id = p_user;
  SELECT count(*) INTO v_odev  FROM homework_submissions
    WHERE student_id = p_user AND status = 'onaylandi';

  -- Görev
  IF v_gorev >=  1 THEN PERFORM rozet_ver(p_user, 'ilk_gorev', 'İlk Adım');       END IF;
  IF v_gorev >= 10 THEN PERFORM rozet_ver(p_user, 'gorev_10',  'Düzenli');        END IF;
  IF v_gorev >= 50 THEN PERFORM rozet_ver(p_user, 'gorev_50',  'Azimli');         END IF;
  -- Test
  IF v_test  >=  1 THEN PERFORM rozet_ver(p_user, 'ilk_test',  'Deneme Başlangıcı'); END IF;
  IF v_test  >= 25 THEN PERFORM rozet_ver(p_user, 'test_25',   'Soru Avcısı');    END IF;
  -- Ödev
  IF v_odev  >=  5 THEN PERFORM rozet_ver(p_user, 'odev_5',    'Ödevci');         END IF;
  -- Sınav
  IF v_sinav >=  1 THEN PERFORM rozet_ver(p_user, 'ilk_sinav', 'İlk Deneme');     END IF;

  -- Net artışı: aynı türdeki son iki deneme
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
    IF v_fark >  0 THEN PERFORM rozet_ver(p_user, 'net_artis',    'Yükseliş'); END IF;
    IF v_fark >= 10 THEN PERFORM rozet_ver(p_user, 'net_artis_10', 'Sıçrama');  END IF;
  END LOOP;

  -- Program hedefleri: hafta tamamlama ve program bitirme
  FOR r IN SELECT * FROM program_atamalari WHERE student_id = p_user LOOP
    -- Tamamlanan satır sayısı programın tamamına eşitse
    IF r.toplam_satir > 0
       AND jsonb_array_length(r.tamamlananlar) >= r.toplam_satir THEN
      PERFORM rozet_ver(p_user, 'program_tamam', 'Program Bitti');
    END IF;
    -- Herhangi bir hafta bütünüyle tamamlandıysa
    IF EXISTS (
      SELECT 1
      FROM (SELECT split_part(k, '-', 1) AS hafta, count(*) AS adet
            FROM jsonb_array_elements_text(r.tamamlananlar) k
            GROUP BY 1) t
      WHERE (r.hafta_satirlari ->> t.hafta)::int IS NOT NULL
        AND t.adet >= (r.hafta_satirlari ->> t.hafta)::int
    ) THEN
      PERFORM rozet_ver(p_user, 'hafta_tamam', 'Haftayı Bitirdin');
    END IF;
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION rozetleri_guncelle(UUID) TO authenticated;

-- ---------- Tetikleyiciler: ilgili veri değişince rozetleri tazele ----------
CREATE OR REPLACE FUNCTION trg_rozet_tazele()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM rozetleri_guncelle(NEW.student_id);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS rozet_gorev   ON tasks;
CREATE TRIGGER rozet_gorev   AFTER UPDATE OF is_done ON tasks
  FOR EACH ROW EXECUTE FUNCTION trg_rozet_tazele();

DROP TRIGGER IF EXISTS rozet_test    ON test_sessions;
CREATE TRIGGER rozet_test    AFTER INSERT ON test_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_rozet_tazele();

DROP TRIGGER IF EXISTS rozet_sinav   ON exam_results;
CREATE TRIGGER rozet_sinav   AFTER INSERT ON exam_results
  FOR EACH ROW EXECUTE FUNCTION trg_rozet_tazele();

DROP TRIGGER IF EXISTS rozet_odev    ON homework_submissions;
CREATE TRIGGER rozet_odev    AFTER UPDATE OF status ON homework_submissions
  FOR EACH ROW EXECUTE FUNCTION trg_rozet_tazele();

DROP TRIGGER IF EXISTS rozet_program ON program_atamalari;
CREATE TRIGGER rozet_program AFTER UPDATE OF tamamlananlar ON program_atamalari
  FOR EACH ROW EXECUTE FUNCTION trg_rozet_tazele();

-- updated_at
CREATE OR REPLACE FUNCTION trg_program_updated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS program_updated_at ON program_atamalari;
CREATE TRIGGER program_updated_at BEFORE UPDATE ON program_atamalari
  FOR EACH ROW EXECUTE FUNCTION trg_program_updated();

-- Doğrulama:
--   SELECT u.full_name, b.rozet_kod, b.kazanildi_at
--   FROM badges b JOIN users u ON u.id = b.user_id ORDER BY b.kazanildi_at DESC;
