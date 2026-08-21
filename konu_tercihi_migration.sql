-- ============================================================
-- ÖĞRETMEN KONU TERCİHLERİ — aktif/agirlik artık koç bazlı
--
-- SORUN: exam_topics.aktif ve exam_topics.agirlik GLOBAL kolonlar.
-- Bir koç konuyu pasife alınca diğer koçta da pasifleşiyor; elle
-- ağırlık verince o ağırlık herkesin analizine giriyor. Tek koçluk
-- prototipte fark etmiyordu, ikinci koç gelince doğrudan çakışma.
--
-- ÇÖZÜM: tercihler ayrı tabloda, (öğretmen, konu) çiftine bağlı.
-- exam_topics'teki kolonlar KALIYOR ve TABAN değer olarak işliyor:
--
--   etkin aktif   = tercih.aktif   ?? exam_topics.aktif
--   etkin agirlik = tercih.agirlik ?? exam_topics.agirlik
--
-- Böylece admin bir konuyu global olarak emekliye ayırabiliyor
-- (exam_topics.aktif = false), koç ise yalnızca kendi görünümünü
-- düzenliyor. Bugün 483 konunun 0'ı pasif ve 0'ında ağırlık var,
-- yani taşınacak veri yok.
--
-- ── KAPSAM KARARI ──────────────────────────────────────────────
-- Tercihler ÖĞRETMENİN KENDİ EKRANLARINA uygulanır; öğrenci tam
-- müfredatı görmeye devam eder. İki gerekçe:
--   1) Konuyu gizlemek koçun kendi listesini sadeleştirmesi içindir;
--      öğrenci test girerken çalıştığı konuyu seçemez hale gelmemeli.
--   2) Bir öğrencinin birden fazla öğretmeni olabiliyor; "hangisinin
--      tercihi geçerli" sorusunun temiz bir cevabı yok.
-- Analizdeki ağırlık ise öğrencinin ONAYLI ÖĞRETMENLERİNİN tercihinden
-- gelir (aşağıdaki görünüm); birden fazla koç aynı konuya ağırlık
-- verdiyse en YÜKSEĞİ alınır — koçlardan birine göre önemliyse önemlidir.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE TABLE IF NOT EXISTS ogretmen_konu_tercihi (
  teacher_id    UUID NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  exam_topic_id UUID NOT NULL REFERENCES exam_topics(id) ON DELETE CASCADE,
  aktif         BOOLEAN,     -- NULL → exam_topics.aktif geçerli
  agirlik       NUMERIC,     -- NULL → exam_topics.agirlik geçerli
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, exam_topic_id)
);

CREATE INDEX IF NOT EXISTS idx_konu_tercihi_ogretmen
  ON ogretmen_konu_tercihi (teacher_id);

ALTER TABLE ogretmen_konu_tercihi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ogretmen kendi tercihlerini yonetir" ON ogretmen_konu_tercihi;
CREATE POLICY "Ogretmen kendi tercihlerini yonetir" ON ogretmen_konu_tercihi
  FOR ALL TO authenticated
  USING      (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid() AND ogretmen_mi());


-- ------------------------------------------------------------
-- Analiz servisi için: öğrenci bazında etkin konu ağırlığı
--
-- Python tarafı bugün exam_topics.agirlik okuyor (main.py:867).
-- Bu görünüm aynı bilgiyi öğrenciye göre veriyor: öğrencinin onaylı
-- öğretmenlerinin tercihi varsa o, yoksa exam_topics'teki taban.
--
-- security_invoker AÇIK: görünüm çağıranın yetkisiyle çalışsın,
-- altındaki tabloların RLS'ini atlamasın. (konu_gozlem'de tam bu
-- yüzden sızıntı yaşanmıştı.) Analiz servisi service_role ile
-- bağlandığı için etkilenmiyor.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW ogrenci_konu_agirligi AS
SELECT
  ts.student_id,
  et.subject,
  et.topic,
  COALESCE(max(tk.agirlik), max(et.agirlik)) AS agirlik
FROM teacher_students ts
JOIN ogretmen_konu_tercihi tk ON tk.teacher_id = ts.teacher_id
JOIN exam_topics et           ON et.id = tk.exam_topic_id
WHERE ts.durum = 'onaylandi'
GROUP BY ts.student_id, et.subject, et.topic
HAVING COALESCE(max(tk.agirlik), max(et.agirlik)) IS NOT NULL;

DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW public.ogrenci_konu_agirligi SET (security_invoker = on)';
  END IF;
END $$;

REVOKE ALL ON public.ogrenci_konu_agirligi FROM PUBLIC, anon;
GRANT SELECT ON public.ogrenci_konu_agirligi TO authenticated;


-- ============================================================
-- DOĞRULAMA
--   SELECT count(*) FROM ogretmen_konu_tercihi;        -- 0 (henüz tercih yok)
--   SELECT count(*) FROM ogrenci_konu_agirligi;        -- 0
--
--   Konu Yönetimi'nden bir konu pasife alınınca:
--   SELECT u.email, et.subject, et.topic, tk.aktif
--   FROM ogretmen_konu_tercihi tk
--   JOIN users u ON u.id = tk.teacher_id
--   JOIN exam_topics et ON et.id = tk.exam_topic_id;
--
-- NOT: exam_topics.aktif / agirlik kolonlarına DOKUNULMADI. Global
-- taban olarak duruyorlar; yalnızca admin'in genel emekliye ayırma
-- yolu olarak kullanılmalı.
-- ============================================================
