-- ============================================================
-- İKİNCİ KOÇ — her öğretmen yalnızca kendi öğrencisini görsün
--
-- BULGU: Öğretmen yetkisi veren politikaların çoğu sadece "role = teacher"
-- diye soruyor, "bu öğrenci senin mi" diye sormuyor. Tek öğretmenle sorun
-- değildi; ikinci koç eklendiği anda iki koç birbirinin öğrencilerinin
-- verisini görür ve değiştirebilir.
--
-- Çözüm: bu politikalar ogrencim_mi(student_id) ile daraltılıyor.
-- ogrencim_mi zaten doğru koşulu kullanıyor (teacher_students'ta
-- durum = 'onaylandi'), yani bağ karşılıklı onaylanmadan erişim açılmıyor.
--
-- BOZULMAYACAK: Paneller zaten kendi verisini istiyor (öğretmen paneli
-- tasks'i .eq("teacher_id", userId) ile, öğrenci kendi id'siyle çekiyor).
-- Politika daralması bu sorgulara ek satır kaybettirmez.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================


-- ============================================================
-- 1) Öğrenci verisi olan tablolar: role='teacher' -> ogrencim_mi()
-- ============================================================

-- --- student_profiles: telefon, doğum tarihi, okul, veli bilgileri ---
DROP POLICY IF EXISTS "Öğretmen profilleri okur" ON student_profiles;
CREATE POLICY "Ogretmen kendi ogrencisinin profilini okur" ON student_profiles
  FOR SELECT USING (ogrencim_mi(id));

-- --- exam_results ---
DROP POLICY IF EXISTS "Ogretmen sinav sonuclarini yonetir" ON exam_results;
CREATE POLICY "Ogretmen kendi ogrencisinin sinavlarini yonetir" ON exam_results
  FOR ALL
  USING      (ogrencim_mi(student_id))
  WITH CHECK (ogrencim_mi(student_id));

-- --- homework_submissions ---
DROP POLICY IF EXISTS "Öğretmen gönderimleri yönetir" ON homework_submissions;
CREATE POLICY "Ogretmen kendi ogrencisinin odevlerini yonetir" ON homework_submissions
  FOR ALL
  USING      (ogrencim_mi(student_id))
  WITH CHECK (ogrencim_mi(student_id));

-- --- test_sessions ---
DROP POLICY IF EXISTS "Ogretmen testleri okur" ON test_sessions;
CREATE POLICY "Ogretmen kendi ogrencisinin testlerini okur" ON test_sessions
  FOR SELECT USING (ogrencim_mi(student_id));


-- ============================================================
-- 2) tasks — politikaları hiçbir migration dosyasında yoktu
--    (Supabase arayüzünden elle kurulmuş.) Adları bilinmediği için
--    tümü kaldırılıp eksiksiz bir set yeniden kuruluyor. Aşağıdaki set
--    uygulamanın gerçek erişim ihtiyacından çıkarıldı:
--      StudentDashboard.jsx:100  öğrenci kendi görevlerini okur
--      TaskItem.jsx:15           öğrenci is_done günceller
--      ParentDashboard.jsx:39    veli çocuğunun görevlerini okur
--      TeacherDashboard.jsx:75   öğretmen kendi atadıklarını okur
--      TeacherDashboard.jsx:135  öğretmen görev atar
-- ============================================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'tasks' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.tasks', r.policyname);
    RAISE NOTICE 'tasks: % kaldirildi', r.policyname;
  END LOOP;
END $$;

-- Öğrenci kendi görevlerini görür ve tamamlandı işaretler
CREATE POLICY "Ogrenci kendi gorevleri" ON tasks
  FOR SELECT USING (auth.uid() = student_id);

CREATE POLICY "Ogrenci gorevini tamamlar" ON tasks
  FOR UPDATE
  USING      (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Öğretmen yalnızca onaylı öğrencisinin görevlerini yönetir
CREATE POLICY "Ogretmen kendi ogrencisinin gorevleri" ON tasks
  FOR ALL
  USING      (ogrencim_mi(student_id))
  WITH CHECK (ogrencim_mi(student_id));

-- Veli bağlı çocuğunun görevlerini okur
CREATE POLICY "Veli cocuk gorevleri" ON tasks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM family_links
            WHERE parent_id = auth.uid() AND student_id = tasks.student_id)
  );


-- ============================================================
-- 3) Müfredat (exam_topics) — ortak taban + öğretmenin kendi eklediği
--
-- sahip_id NULL  -> ortak taban müfredat (uygulamadan silinemez)
-- sahip_id dolu  -> o öğretmenin kendi eklediği konu, kendisi yönetir
--
-- İleride çok kiracılı sürüme geçildiğinde bu kolon kiracı ayrımının
-- dayanağı olur; şimdiden koymak sonradan veri taşımaktan ucuz.
-- ============================================================
ALTER TABLE exam_topics
  ADD COLUMN IF NOT EXISTS sahip_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exam_topics_sahip ON exam_topics (sahip_id);

-- Mevcut 312 konunun tamamı ortak taban sayılıyor (sahip_id NULL kalır).

-- ZORUNLU: KonuYonetimi.jsx:46 insert'te sahip_id GÖNDERMİYOR. Varsayılan
-- olmasaydı aşağıdaki WITH CHECK her konu eklemeyi reddeder, özellik
-- tamamen bozulurdu. Varsayılanla istemci değişikliği gerekmiyor.
ALTER TABLE exam_topics ALTER COLUMN sahip_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Konulari ogretmen yonetir" ON exam_topics;
DROP POLICY IF EXISTS "Konulari herkes okur"      ON exam_topics;

-- Okuma: herkes tüm konuları görür. Konu adı hassas veri değil ve
-- öğrencinin sınavında geçen konuyu görebilmesi gerekiyor.
CREATE POLICY "Konulari herkes okur" ON exam_topics
  FOR SELECT TO authenticated USING (true);

-- Ekleme: öğretmen ekler, sahip olarak kendini yazmak ZORUNDA.
CREATE POLICY "Ogretmen kendi konusunu ekler" ON exam_topics
  FOR INSERT TO authenticated
  WITH CHECK (
    sahip_id = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

-- Silme: yalnızca kendi eklediğini. Ortak taban uygulamadan silinemez.
CREATE POLICY "Ogretmen kendi konusunu siler" ON exam_topics
  FOR DELETE TO authenticated
  USING (sahip_id = auth.uid());

-- Güncelleme: BİLİNÇLİ OLARAK tüm öğretmenlere açık.
--
-- Nedeni: aktif ve agirlik kolonları bugün GLOBAL. KonuYonetimi.jsx'te
-- öğretmen bir konuyu pasife alınca exam_topics.aktif güncelleniyor.
-- Bunu sahibe kısıtlarsam öğretmen ortak müfredattaki konuyu gizleyemez
-- ve mevcut bir özellik bozulur.
--
-- BİLİNEN SINIR: bu yüzden B koçu bir konuyu pasife alırsa A koçunda da
-- pasifleşir. Prototipte kabul edilebilir. Kalıcı çözüm aktif/agirlik'i
-- ogretmen_konu_tercihi (teacher_id, konu) gibi ayrı bir tabloya taşımak;
-- bu arayüz ve backend değişikliği de gerektirdiği için buraya alınmadı.
CREATE POLICY "Ogretmen konu tercihlerini gunceller" ON exam_topics
  FOR UPDATE TO authenticated
  USING      (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher'));


-- ============================================================
-- 4) Hazır programlar (study_programs) — oluşturan düzenler
--
-- DAVRANIŞ DEĞİŞİKLİĞİ: "⚡ Yoğun Atılım" ve "🌊 Dengeli Derinlik"
-- kayıtlarının created_by değeri NULL. Bunlar tohum veri; aşağıdaki
-- politikalardan sonra uygulamadan DÜZENLENEMEZ ve SİLİNEMEZ olurlar
-- (okunabilir kalırlar). Müfredattaki ortak taban mantığıyla aynı.
-- Bunları düzenlemek isterseniz sahiplerini SQL Editor'den atayın:
--   UPDATE study_programs SET created_by = '<ogretmen_id>'
--   WHERE created_by IS NULL;
-- ============================================================
DROP POLICY IF EXISTS "Ogretmen program yonetir"   ON study_programs;
DROP POLICY IF EXISTS "Programlari herkes okur"    ON study_programs;

CREATE POLICY "Programlari herkes okur" ON study_programs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ogretmen kendi programini olusturur" ON study_programs
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Ogretmen kendi programini duzenler" ON study_programs
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

CREATE POLICY "Ogretmen kendi programini siler" ON study_programs
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());


-- ============================================================
-- 5) konu_yeniden_adlandir — en tehlikeli fonksiyon
--
-- Mevcut hali TÜM platformda çalışıyor: bir konuyu yeniden adlandırınca
-- bütün öğrencilerin tasks / test_sessions / exam_results kayıtlarını
-- yeniden yazıyor. İki koçla bu, B koçunun A koçunun öğrenci verisini
-- değiştirmesi demek.
--
-- Yeni hali: yalnızca ÇAĞIRANIN öğrencilerinin kayıtlarını günceller ve
-- exam_topics satırını yalnızca sahibiyse yeniden adlandırır.
-- ============================================================
CREATE OR REPLACE FUNCTION konu_yeniden_adlandir(p_ders TEXT, p_eski TEXT, p_yeni TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ogrenciler UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'teacher') THEN
    RAISE EXCEPTION 'Bu islem icin ogretmen yetkisi gerekiyor';
  END IF;

  -- Yalnızca çağıranın onaylı öğrencileri
  SELECT array_agg(student_id) INTO v_ogrenciler
  FROM teacher_students
  WHERE teacher_id = auth.uid() AND durum = 'onaylandi';

  IF v_ogrenciler IS NULL THEN v_ogrenciler := ARRAY[]::UUID[]; END IF;

  UPDATE tasks         SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski AND student_id = ANY(v_ogrenciler);
  UPDATE test_sessions SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski AND student_id = ANY(v_ogrenciler);

  UPDATE exam_results er
  SET subject_details = jsonb_set(
        er.subject_details,
        ARRAY[p_ders, 'yanlis_konular'],
        (SELECT COALESCE(jsonb_agg(
                  CASE WHEN x = to_jsonb(p_eski) THEN to_jsonb(p_yeni) ELSE x END
                ), '[]'::jsonb)
         FROM jsonb_array_elements(er.subject_details -> p_ders -> 'yanlis_konular') x)
      )
  WHERE er.student_id = ANY(v_ogrenciler)
    AND er.subject_details ? p_ders
    AND er.subject_details -> p_ders -> 'yanlis_konular' @> to_jsonb(ARRAY[p_eski]);

  -- Konu kaydının kendisi: yalnızca öğretmenin kendi eklediği konu
  UPDATE exam_topics SET topic = p_yeni
    WHERE subject = p_ders AND topic = p_eski AND sahip_id = auth.uid();
END; $$;

REVOKE ALL ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) TO authenticated;


-- ============================================================
-- DOKUNULMAYANLAR (zaten doğru)
--   lessons             -> teacher_id / student_id ile bağlı
--   program_atamalari   -> ogrencim_mi() kullanıyor
--   teacher_students    -> iki taraflı teklif + onay
--   users               -> öğretmen tüm öğrencilerin ad/e-postasını görür.
--                          Davet gönderebilmesi için gerekli; sizin
--                          kararınızla şimdilik böyle kalıyor.
--
-- DOĞRULAMA
-- ÖNEMLİ — ÇALIŞTIRINCA HEMEN FARK EDECEĞİNİZ ŞEY
--   teacher_students'ta "yağmur erenler" bağı hâlâ 'beklemede'. Bugün
--   role='teacher' politikaları sayesinde bu öğrencinin verisi size
--   görünüyor; daralttıktan sonra ogrencim_mi() yalnızca 'onaylandi'
--   bağları saydığı için GÖRÜNMEYECEK. Bu hatanın değil, kuralın
--   sonucu. Görmeye devam etmek için öğrencinin bağlantıyı onaylaması
--   gerekiyor (ya da SQL'den durum = 'onaylandi' yapılmalı).
--
--   İkinci koç eklendikten sonra o hesapla:
--     - kendi öğrencisi görünmeli, diğerininki GÖRÜNMEMELİ
--     - kendi eklediği konuyu silebilmeli, ortak tabandakini SİLEMEMELİ
--     - başkasının programını düzenleyememeli
--   Mevcut öğretmen hesabında hiçbir şey değişmemeli.
-- ============================================================
