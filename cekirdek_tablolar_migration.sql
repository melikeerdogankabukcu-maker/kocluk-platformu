-- ============================================================
-- Migration: ÇEKİRDEK TABLOLAR (ilk kurulumda panelden açılmış)
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN VAR ───────────────────────────────────────────────
-- users, family_links, tasks, exam_results, test_sessions, messages ilk
-- kurulumda Supabase panelinden elle açılmış ve hiçbir migration
-- dosyasında yer almıyordu. Yani depodan sıfırdan şema kurulamıyordu:
-- proje silinse ya da yeni bir ortam gerekse bu tablolar elde yeniden
-- yazılacaktı. 23 Ekim 2026'daki duraklatma maili bu riski hatırlattı.
--
-- Tanımlar TAHMİNLE YAZILMADI: canlı veritabanından çıkarıldı
-- (sema_cikar.sql) ve birebir buraya taşındı.
--
-- ── ÇALIŞTIRMA SIRASI ───────────────────────────────────────
-- Bu dosya sıfırdan kurulumda İLK sıradadır (diğer tablolar users'a
-- bağlı). Ama içindeki TETİKLEYİCİLER başka migration'lardaki
-- fonksiyonlara dayanıyor (audit_kaydet, trg_bildirim_*, trg_rozet_*,
-- users_rol_koru, mesaj_metnini_koru ...). Bu yüzden her tetikleyici
-- "fonksiyon varsa kur" diye korumalı: dosya tek başına da çalışıyor,
-- ilgili migration sonradan çalıştığında tetikleyici de kuruluyor.
-- Mevcut (dolu) veritabanında çalıştırmak güvenli ve etkisizdir.
--
-- ── ÇİFT KAYITLAR TEMİZLENDİ ────────────────────────────────
-- Canlıda aynı işi yapan ikiz politikalar vardı (geliştirme boyunca
-- birikmiş): exam_results'ta öğrenci/öğretmen/veli için üç çift,
-- test_sessions'ta öğretmen için bir çift, family_links'te iki ayrı
-- ama aynı UNIQUE kısıtı. Burada her biri BİR KEZ yazıldı. Davranış
-- aynı (politikalar zaten VEYA'lanıyor), yalnız tekrar yok.
--
-- ── anon'a İZİN VERİLMİYOR ──────────────────────────────────
-- Canlıda anon'un bu tablolarda tam CRUD izni var (Supabase'in eski
-- otomatik izni). Burada VERİLMİYOR; politikalar zaten anon'u
-- geçirmiyor (hepsi auth.uid()/auth.role() denetliyor). Yeniden
-- kurulan bir şemada bugün fiilen kullanılmayan bir kapıyı açmanın
-- anlamı yok. Ayrıntı: grantlar_migration.sql.

-- ------------------------------------------------------------
-- 1) users  — public profil; auth.users'a bağlı
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid()
                                  REFERENCES auth.users(id) ON DELETE CASCADE,
  email               TEXT        NOT NULL UNIQUE,
  full_name           TEXT        NOT NULL,
  role                TEXT        NOT NULL,
  created_at          TIMESTAMP   DEFAULT now(),
  talep_rol           TEXT,
  onay_durumu         TEXT        NOT NULL DEFAULT 'beklemede',
  talep_ogrenci_email TEXT,
  sifre_degistirmeli  BOOLEAN     NOT NULL DEFAULT false,
  kurum_id            UUID        REFERENCES public.kurumlar(id) ON DELETE SET NULL,
  kurum_rolu          TEXT        NOT NULL DEFAULT 'uye',
  CONSTRAINT users_role_check  CHECK (role = ANY (ARRAY['student','parent','teacher','admin'])),
  CONSTRAINT users_onay_check  CHECK (onay_durumu = ANY (ARRAY['beklemede','onaylandi','reddedildi'])),
  CONSTRAINT users_kurum_rolu_check CHECK (kurum_rolu = ANY (ARRAY['yonetici','uye']))
);

CREATE INDEX IF NOT EXISTS idx_users_kurum ON public.users (kurum_id);
CREATE INDEX IF NOT EXISTS idx_users_onay  ON public.users (onay_durumu)
  WHERE onay_durumu <> 'onaylandi';

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Kendi verisini gör" ON public.users;
CREATE POLICY "Kendi verisini gör" ON public.users
  FOR SELECT USING (auth.uid() = id);

-- ⚠ DİKKAT: bu politika GİRİŞ YAPMIŞ HERKESE bütün users satırlarını
-- açıyor (ad, e-posta, rol). Uygulama buna dayanıyor (koç arama,
-- bağlantı kurma) ama geniş bir kapı; daraltılması ayrı bir iştir ve
-- daraltılırsa önce hangi ekranların kırılacağı ölçülmelidir.
DROP POLICY IF EXISTS "Kimlik doğrulanmış kullanıcılar görebilir" ON public.users;
CREATE POLICY "Kimlik doğrulanmış kullanıcılar görebilir" ON public.users
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Kayıt sırasında ekle" ON public.users;
CREATE POLICY "Kayıt sırasında ekle" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Kayıt sırasında kendine öğretmen/admin rolü verilemiyor.
DROP POLICY IF EXISTS "Kendine ogretmen rolu verilemez" ON public.users;
CREATE POLICY "Kendine ogretmen rolu verilemez" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (role = ANY (ARRAY['student','parent']));

DROP POLICY IF EXISTS "Kendi verisini güncelle" ON public.users;
CREATE POLICY "Kendi verisini güncelle" ON public.users
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admin kullanici gunceller" ON public.users;
CREATE POLICY "Admin kullanici gunceller" ON public.users
  FOR UPDATE TO authenticated USING (admin_mi()) WITH CHECK (admin_mi());

-- ------------------------------------------------------------
-- 2) family_links  — veli ↔ öğrenci bağı
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  -- Canlıda aynı çifti koruyan İKİ ayrı UNIQUE kısıt vardı; biri yeter.
  CONSTRAINT family_links_benzersiz UNIQUE (parent_id, student_id)
);

ALTER TABLE public.family_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Veli kendi bagini gorur" ON public.family_links;
CREATE POLICY "Veli kendi bagini gorur" ON public.family_links
  FOR SELECT TO authenticated USING (parent_id = auth.uid());

DROP POLICY IF EXISTS "Ogrenci kendi velisini gorur" ON public.family_links;
CREATE POLICY "Ogrenci kendi velisini gorur" ON public.family_links
  FOR SELECT TO authenticated USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Ogretmen ogrencisinin velisini gorur" ON public.family_links;
CREATE POLICY "Ogretmen ogrencisinin velisini gorur" ON public.family_links
  FOR SELECT TO authenticated USING (ogrencim_mi(student_id));

DROP POLICY IF EXISTS "Yonetici tum baglari gorur" ON public.family_links;
CREATE POLICY "Yonetici tum baglari gorur" ON public.family_links
  FOR SELECT TO authenticated USING (admin_mi());

-- ------------------------------------------------------------
-- 3) tasks  — görevler
-- ------------------------------------------------------------
-- exam_results ve test_sessions buna bağlı (yabancı anahtar ve
-- politika), o yüzden onlardan ÖNCE.
CREATE TABLE IF NOT EXISTS public.tasks (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  teacher_id         UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  title              TEXT        NOT NULL,
  subject            TEXT,
  topic              TEXT,
  description        TEXT,
  estimated_minutes  INTEGER,
  difficulty         TEXT        DEFAULT 'medium',
  is_done            BOOLEAN     DEFAULT false,
  due_date           DATE,
  due_time           TIME,
  kaynak_program     TEXT,
  -- Koç doğrulaması: onaylanan görev öğrenci tarafından değiştirilemiyor
  -- (gorev_onay_kilidi tetikleyicisi).
  ogretmen_onayi     TEXT,
  onay_notu          TEXT,
  onaylayan_id       UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  onay_tarihi        TIMESTAMPTZ,
  tamamlanma_tarihi  TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tasks_ogretmen_onayi_check CHECK (
    ogretmen_onayi IS NULL OR ogretmen_onayi = ANY (ARRAY['onaylandi','iade_edildi'])),
  -- Saat varsa tarih de olmalı: tarihsiz bir saat takvimde yer bulamaz
  CONSTRAINT tasks_due_time_tarihsiz CHECK (due_time IS NULL OR due_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_tasks_teacher_student
  ON public.tasks (teacher_id, student_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_onay
  ON public.tasks (student_id, ogretmen_onayi) WHERE ogretmen_onayi IS NOT NULL;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ogrenci kendi gorevleri" ON public.tasks;
CREATE POLICY "Ogrenci kendi gorevleri" ON public.tasks
  FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Ogretmen kendi ogrencisinin gorevleri" ON public.tasks;
CREATE POLICY "Ogretmen kendi ogrencisinin gorevleri" ON public.tasks
  FOR ALL USING (ogrencim_mi(student_id)) WITH CHECK (ogrencim_mi(student_id));

DROP POLICY IF EXISTS "Veli cocuk gorevleri" ON public.tasks;
CREATE POLICY "Veli cocuk gorevleri" ON public.tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.family_links f
     WHERE f.parent_id = auth.uid() AND f.student_id = tasks.student_id));

-- ------------------------------------------------------------
-- 4) exam_results  — deneme sonuçları
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_results (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  exam_name       TEXT        NOT NULL,
  exam_type       TEXT        NOT NULL DEFAULT 'deneme',
  exam_date       DATE        NOT NULL DEFAULT CURRENT_DATE,
  total_net       NUMERIC(5,2),
  subject_nets    JSONB,
  subject_details JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Öğrenci kendi sınav sonuçlarını görür" ON public.exam_results;
CREATE POLICY "Öğrenci kendi sınav sonuçlarını görür" ON public.exam_results
  FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Öğrenci sınav sonucu ekleyebilir" ON public.exam_results;
CREATE POLICY "Öğrenci sınav sonucu ekleyebilir" ON public.exam_results
  FOR INSERT WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Ogretmen kendi ogrencilerinin sinavlarini yonetir" ON public.exam_results;
CREATE POLICY "Ogretmen kendi ogrencilerinin sinavlarini yonetir" ON public.exam_results
  FOR ALL USING (ogrencim_mi(student_id)) WITH CHECK (ogrencim_mi(student_id));

DROP POLICY IF EXISTS "Veli cocuk sinav sonuclarini okur" ON public.exam_results;
CREATE POLICY "Veli cocuk sinav sonuclarini okur" ON public.exam_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.family_links f
     WHERE f.parent_id = auth.uid() AND f.student_id = exam_results.student_id));

-- ⚠ ESKİ KALIP: "görevi olan öğretmen" ölçütü. ogrencim_mi() geldikten
-- sonra gereksizleşti ama daha geniş: bir kez görev atamış her
-- öğretmene açık. Canlıda var, bu yüzden korunuyor; kaldırılacaksa
-- önce hangi akışın buna dayandığı ölçülmeli.
DROP POLICY IF EXISTS "Öğretmen sınav sonuçlarını görür" ON public.exam_results;
CREATE POLICY "Öğretmen sınav sonuçlarını görür" ON public.exam_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.tasks t
     WHERE t.student_id = exam_results.student_id AND t.teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Öğretmen sınav sonucu ekleyebilir" ON public.exam_results;
CREATE POLICY "Öğretmen sınav sonucu ekleyebilir" ON public.exam_results
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.tasks t
     WHERE t.student_id = exam_results.student_id AND t.teacher_id = auth.uid()));

-- ------------------------------------------------------------
-- 5) test_sessions  — çözülen testler (dijital test de buraya yazıyor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.test_sessions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  subject        TEXT        NOT NULL,
  topic          TEXT,
  question_count INTEGER     NOT NULL DEFAULT 0,
  correct_count  INTEGER     NOT NULL DEFAULT 0,
  yanlis_count   INTEGER,
  task_id        UUID        REFERENCES public.tasks(id) ON DELETE SET NULL,
  blok_id        UUID        REFERENCES public.calisma_bloklari(id) ON DELETE SET NULL,
  dosyalar       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  file_url       TEXT,
  file_name      TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT test_dosyalar_dizi CHECK (jsonb_typeof(dosyalar) = 'array'),
  CONSTRAINT test_sayilari_tutarli CHECK (
    yanlis_count IS NULL
    OR (yanlis_count >= 0
        AND (COALESCE(correct_count, 0) + yanlis_count) <= COALESCE(question_count, 0)))
);

-- Bir plan bloğuna en fazla bir test bağlanabiliyor
CREATE UNIQUE INDEX IF NOT EXISTS idx_test_blok_tekil
  ON public.test_sessions (blok_id) WHERE blok_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_test_sessions_task
  ON public.test_sessions (task_id) WHERE task_id IS NOT NULL;

ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Öğrenci kendi testlerini görür" ON public.test_sessions;
CREATE POLICY "Öğrenci kendi testlerini görür" ON public.test_sessions
  FOR SELECT USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Öğrenci test ekleyebilir" ON public.test_sessions;
CREATE POLICY "Öğrenci test ekleyebilir" ON public.test_sessions
  FOR INSERT WITH CHECK (auth.uid() = student_id);

-- Koçun onayladığı test KİLİTLİ: iki yardımcı bunu denetliyor.
DROP POLICY IF EXISTS "Ogrenci kendi testini duzenler" ON public.test_sessions;
CREATE POLICY "Ogrenci kendi testini duzenler" ON public.test_sessions
  FOR UPDATE TO authenticated
  USING      (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id) AND test_blogu_acik_mi(blok_id))
  WITH CHECK (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id) AND test_blogu_acik_mi(blok_id));

DROP POLICY IF EXISTS "Ogrenci kendi testini siler" ON public.test_sessions;
CREATE POLICY "Ogrenci kendi testini siler" ON public.test_sessions
  FOR DELETE TO authenticated
  USING (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id) AND test_blogu_acik_mi(blok_id));

DROP POLICY IF EXISTS "Ogretmen kendi ogrencilerinin testlerini okur" ON public.test_sessions;
CREATE POLICY "Ogretmen kendi ogrencilerinin testlerini okur" ON public.test_sessions
  FOR SELECT USING (ogrencim_mi(student_id));

DROP POLICY IF EXISTS "Veli çocuğun testlerini görür" ON public.test_sessions;
CREATE POLICY "Veli çocuğun testlerini görür" ON public.test_sessions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.family_links f
     WHERE f.parent_id = auth.uid() AND f.student_id = test_sessions.student_id));

-- ⚠ ESKİ KALIP (exam_results'taki notun aynısı)
DROP POLICY IF EXISTS "Öğretmen öğrencinin testlerini görür" ON public.test_sessions;
CREATE POLICY "Öğretmen öğrencinin testlerini görür" ON public.test_sessions
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.tasks t
     WHERE t.student_id = test_sessions.student_id AND t.teacher_id = auth.uid()));

-- ------------------------------------------------------------
-- 6) messages  — mesajlaşma
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID      REFERENCES public.users(id),
  receiver_id UUID      REFERENCES public.users(id),
  content     TEXT      NOT NULL,
  dosyalar    JSONB     NOT NULL DEFAULT '[]'::jsonb,
  is_read     BOOLEAN   DEFAULT false,
  -- NOT: canlıda saat dilimsiz (timestamp without time zone). Diğer
  -- tablolar timestamptz kullanıyor; farkı korumak için aynen yazıldı,
  -- değiştirmek veri göçü gerektirir.
  created_at  TIMESTAMP DEFAULT now(),
  CONSTRAINT mesaj_dosyalar_dizi CHECK (jsonb_typeof(dosyalar) = 'array'),
  -- Ne metin ne dosya varsa mesaj yok demektir
  CONSTRAINT mesaj_bos_olamaz CHECK (
    COALESCE(btrim(content), '') <> '' OR jsonb_array_length(dosyalar) > 0)
);

CREATE INDEX IF NOT EXISTS idx_messages_alici
  ON public.messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_gonderen
  ON public.messages (sender_id, created_at DESC);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mesaji taraflar gorur" ON public.messages;
CREATE POLICY "Mesaji taraflar gorur" ON public.messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "Bagli kisiye mesaj gonderilir" ON public.messages;
CREATE POLICY "Bagli kisiye mesaj gonderilir" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND mesajlasabilir_mi(receiver_id));

DROP POLICY IF EXISTS "Alici okundu isaretler" ON public.messages;
CREATE POLICY "Alici okundu isaretler" ON public.messages
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid()) WITH CHECK (receiver_id = auth.uid());

DROP POLICY IF EXISTS "Gonderen kendi mesajini siler" ON public.messages;
CREATE POLICY "Gonderen kendi mesajini siler" ON public.messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

-- ------------------------------------------------------------
-- 7) İzinler
-- ------------------------------------------------------------
-- anon BİLEREK yok (dosya başındaki nota bakın).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_links  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_results  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_sessions TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages      TO authenticated, service_role;

-- ------------------------------------------------------------
-- 8) Tetikleyiciler — fonksiyon VARSA kuruluyor
-- ------------------------------------------------------------
-- Fonksiyonlar başka migration'larda. Koşulsuz yazılsaydı bu dosya
-- sıfırdan kurulumda hata verir ve zincir orada kopardı.
DO $$
DECLARE
  t RECORD;
  tetikler CONSTANT TEXT[][] := ARRAY[
    -- [tablo, tetikleyici adı, fonksiyon, zamanlama+olay]
    ['users',         'audit_users',            'audit_kaydet',               'AFTER UPDATE OF role'],
    ['users',         'users_rol_kilidi',       'users_rol_koru',             'BEFORE UPDATE OF role, onay_durumu, kurum_id, kurum_rolu'],
    ['tasks',         'audit_tasks',            'audit_kaydet',               'AFTER DELETE'],
    ['tasks',         'bildirim_gorev',         'trg_bildirim_gorev',         'AFTER INSERT'],
    ['tasks',         'gorev_onay_bildirimi',   'trg_bildirim_gorev_onayi',   'AFTER UPDATE OF ogretmen_onayi'],
    ['tasks',         'gorev_onay_kilidi',      'gorev_onayi_koru',           'BEFORE UPDATE OF ogretmen_onayi, onay_notu, onaylayan_id, onay_tarihi'],
    ['tasks',         'gorev_ozet_tazele',      'trg_ozet_tazele_gorev',      'AFTER INSERT OR DELETE OR UPDATE'],
    ['tasks',         'gorev_tamamlanma_kilidi','gorev_tamamlanma_zamani',    'BEFORE UPDATE OF is_done'],
    ['tasks',         'rozet_gorev',            'trg_rozet_tazele',           'AFTER UPDATE OF is_done'],
    ['exam_results',  'audit_exam_results',     'audit_kaydet',               'AFTER DELETE OR UPDATE'],
    ['exam_results',  'bildirim_sinav',         'trg_bildirim_sinav',         'AFTER INSERT'],
    ['exam_results',  'rozet_sinav',            'trg_rozet_tazele',           'AFTER INSERT'],
    ['exam_results',  'sinav_ozet_tazele',      'trg_ozet_tazele_sinav',      'AFTER INSERT OR DELETE OR UPDATE'],
    ['test_sessions', 'bildirim_test',          'trg_bildirim_test',          'AFTER INSERT'],
    ['test_sessions', 'gorev_testi_bildirimi',  'trg_bildirim_gorev_testi',   'AFTER INSERT'],
    ['test_sessions', 'rozet_test',             'trg_rozet_tazele',           'AFTER INSERT'],
    ['test_sessions', 'test_ozet_tazele',       'trg_haftalik_ozet_tazele',   'AFTER INSERT OR DELETE OR UPDATE'],
    ['test_sessions', 'test_gorev_bagi_kilidi', 'test_gorev_bagi_koru',       'BEFORE INSERT OR UPDATE OF task_id, student_id'],
    ['test_sessions', 'trg_test_blok_bagi',     'test_blok_bagi_denetle',     'BEFORE INSERT OR UPDATE'],
    ['messages',      'audit_messages',         'audit_kaydet',               'AFTER DELETE'],
    ['messages',      'bildirim_mesaj',         'trg_bildirim_mesaj',         'AFTER INSERT'],
    ['messages',      'mesaj_metin_kilidi',     'mesaj_metnini_koru',         'BEFORE UPDATE']
  ];
  i INTEGER;
BEGIN
  FOR i IN 1 .. array_length(tetikler, 1) LOOP
    IF to_regprocedure('public.' || tetikler[i][3] || '()') IS NULL THEN
      RAISE NOTICE 'fonksiyon yok, tetikleyici atlandi: %', tetikler[i][2];
      CONTINUE;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', tetikler[i][2], tetikler[i][1]);
    EXECUTE format('CREATE TRIGGER %I %s ON public.%I FOR EACH ROW EXECUTE FUNCTION %I()',
                   tetikler[i][2], tetikler[i][4], tetikler[i][1], tetikler[i][3]);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- DENETİM
-- ------------------------------------------------------------
-- Beş tablo da yerinde ve RLS açık mı?
SELECT t.tablename AS "tablo",
       c.relrowsecurity AS "rls_acik",
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS "politika",
       (SELECT count(*) FROM pg_trigger g
         WHERE g.tgrelid = ('public.' || quote_ident(t.tablename))::regclass
           AND NOT g.tgisinternal) AS "tetikleyici"
  FROM pg_tables t
  JOIN pg_class c ON c.oid = ('public.' || quote_ident(t.tablename))::regclass
 WHERE t.schemaname = 'public'
   AND t.tablename IN ('users','family_links','tasks','exam_results','test_sessions','messages')
 ORDER BY t.tablename;
