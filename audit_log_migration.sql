-- ============================================================
-- DENETİM KAYDI (audit log)
--
-- Amaç: "bu kayıt neden değişti / kim sildi" sorusunun cevabı kalsın.
-- İkinci koç geldiğinde ve ileride ücretli üyelikte bu bir zorunluluk:
-- silinen bir ders ödeme anlaşmazlığı, değişen bir sınav sonucu itiraz
-- konusu olabiliyor.
--
-- Kayıt VERİTABANI TETİKLEYİCİSİYLE tutuluyor, uygulama katmanında değil.
-- İstemciden yazılan bir günlük atlanabilir; tetikleyici atlanamaz.
--
-- ── NE KAYDEDİLİYOR ─────────────────────────────────────────────
-- Hepsi değil — bilerek seçici. Görev eklemek gibi toplu işlemler
-- günlüğü boğar (tek program ataması 73 satır açabiliyor). Kaydedilenler
-- güvenlik ya da anlaşmazlık değeri olanlar:
--
--   users             rol değişikliği (en hassas)
--   teacher_students  kime erişimi olduğu değişiyor
--   exam_results      öğrencinin sınav verisi (itiraz)
--   lessons           SİLME (ödeme anlaşmazlığı)
--   tasks             SİLME (toplu ekleme kaydedilmiyor)
--   messages          SİLME (yazışma kaydı kayboluyor)
--   exam_topics       müfredat değişikliği herkesi etkiliyor
--
-- Kaydedilmeyenler: test_sessions, notifications, badges, progress —
-- ya türetilmiş ya da anlaşmazlık değeri yok.
--
-- ── KİM OKUYABİLİR ──────────────────────────────────────────────
-- Yalnızca admin. Koçların birbirinin işlemlerini görmesi gerekmiyor;
-- denetim kaydının anlamı da bağımsız bir gözde olması.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  tablo      TEXT        NOT NULL,
  kayit_id   UUID,                    -- bileşik anahtarlı tablolarda NULL
  islem      TEXT        NOT NULL,    -- INSERT | UPDATE | DELETE
  kim        UUID,                    -- NULL = SQL Editor / service_role
  eski_veri  JSONB,
  yeni_veri  JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_zaman ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tablo ON audit_log (tablo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_kim   ON audit_log (kim, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'audit_log' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_log', r.policyname);
  END LOOP;
END $$;

-- Yalnızca okuma, yalnızca admin. INSERT/UPDATE/DELETE politikası
-- BİLEREK YOK: kaydı tetikleyici yazıyor (SECURITY DEFINER, RLS'i
-- atlıyor) ve hiç kimse elle ekleyemiyor, düzeltemiyor, silemiyor.
-- Denetim kaydının değiştirilebilmesi onu anlamsız kılardı.
CREATE POLICY "Denetim kaydini admin okur" ON audit_log
  FOR SELECT TO authenticated
  USING (admin_mi());


-- ------------------------------------------------------------
-- Genel tetikleyici — her tabloda çalışır
--
-- NEW.id yerine to_jsonb(NEW)->>'id' kullanılıyor: teacher_students'ta
-- id kolonu YOK (bileşik anahtar) ve NEW.id orada çalışma anında hata
-- verirdi. jsonb üzerinden okumak alan yoksa sessizce NULL döndürüyor;
-- satırın tamamı zaten eski_veri/yeni_veri içinde duruyor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_kaydet()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_eski JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_yeni JSONB := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  v_id   TEXT  := COALESCE(v_yeni->>'id', v_eski->>'id');
BEGIN
  -- Hiçbir alan değişmediyse kayıt tutma (tetikleyici zincirleri
  -- bazen aynı satırı yeniden yazıyor; günlüğü gereksiz şişirmesin)
  IF TG_OP = 'UPDATE' AND v_eski = v_yeni THEN
    RETURN NEW;
  END IF;

  INSERT INTO audit_log (tablo, kayit_id, islem, kim, eski_veri, yeni_veri)
  VALUES (
    TG_TABLE_NAME,
    CASE WHEN v_id ~ '^[0-9a-fA-F-]{36}$' THEN v_id::uuid END,
    TG_OP,
    auth.uid(),
    v_eski,
    v_yeni
  );
  RETURN COALESCE(NEW, OLD);
END $$;

REVOKE ALL ON FUNCTION public.audit_kaydet() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- Tetikleyicileri bağla
-- ------------------------------------------------------------

-- Rol değişikliği — en hassas olan
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users
  AFTER UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();

-- Kimin kime erişimi olduğu
DROP TRIGGER IF EXISTS audit_teacher_students ON teacher_students;
CREATE TRIGGER audit_teacher_students
  AFTER INSERT OR UPDATE OR DELETE ON teacher_students
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();

-- Sınav verisi: değişiklik ve silme (ekleme normal akış, kaydedilmiyor)
DROP TRIGGER IF EXISTS audit_exam_results ON exam_results;
CREATE TRIGGER audit_exam_results
  AFTER UPDATE OR DELETE ON exam_results
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();

-- Ders silme — ödeme anlaşmazlığı
DROP TRIGGER IF EXISTS audit_lessons ON lessons;
CREATE TRIGGER audit_lessons
  AFTER DELETE ON lessons
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();

-- Görev silme (toplu ekleme kaydedilmiyor — günlüğü boğardı)
DROP TRIGGER IF EXISTS audit_tasks ON tasks;
CREATE TRIGGER audit_tasks
  AFTER DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();

-- Mesaj silme
DROP TRIGGER IF EXISTS audit_messages ON messages;
CREATE TRIGGER audit_messages
  AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();

-- Müfredat: değişiklik ve silme herkesi etkiliyor
DROP TRIGGER IF EXISTS audit_exam_topics ON exam_topics;
CREATE TRIGGER audit_exam_topics
  AFTER UPDATE OR DELETE ON exam_topics
  FOR EACH ROW EXECUTE FUNCTION audit_kaydet();


-- ============================================================
-- DOĞRULAMA
--   SELECT count(*) FROM audit_log;        -- 0 (henüz işlem yok)
--
--   Bir görev silip:
--   SELECT tablo, islem, kim, created_at,
--          eski_veri->>'title' AS baslik
--   FROM audit_log ORDER BY created_at DESC LIMIT 5;
--
--   Admin dışı bir hesapla okumaya çalışınca boş dönmeli.
--
-- ── SAKLAMA SÜRESİ ──────────────────────────────────────────────
-- Otomatik temizlik BİLEREK YOK: denetim kaydının kendiliğinden
-- silinmesi amacına aykırı. Tablo çok büyürse eski kayıtlar elle
-- arşivlenebilir:
--   DELETE FROM audit_log WHERE created_at < now() - interval '2 years';
-- ============================================================
