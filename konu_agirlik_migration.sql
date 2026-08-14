-- ============================================================
-- Migration: konu ağırlıkları — sistemin kendi kendine öğrenmesi
--
-- Amaç: sık soru çıkan konuları önceliklendirmek. Ağırlık iki kaynaktan gelir:
--   1) GÖZLEM (otomatik): girilen sınavlarda o konudan kaç soru kaçırıldığı
--      (yanlış + boş). Veri biriktikçe kendiliğinden isabetlenir.
--   2) MANUEL (isteğe bağlı): öğretmen bir konuya "ortalama soru sayısı"
--      girerse gözlem yerine o kullanılır.
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- Öğretmenin elle girebileceği ağırlık (ör. "bu konudan ortalama 4 soru çıkar")
ALTER TABLE exam_topics
  ADD COLUMN IF NOT EXISTS agirlik NUMERIC;

-- Tüm sınavlardaki konu gözlemleri: yanlış + boş listelerinden toplanır.
-- Öğrenci ayrımı yapılmaz; amaç konunun sınavlarda ne sıklıkla karşımıza
-- çıktığını ölçmek (tek öğrencinin zayıflığı değil).
CREATE OR REPLACE VIEW konu_gozlem AS
SELECT
  d.key                  AS subject,
  k.konu                 AS topic,
  count(*)::int          AS gozlem,
  count(DISTINCT er.id)::int AS sinav_sayisi
FROM exam_results er
CROSS JOIN LATERAL jsonb_each(er.subject_details) AS d
CROSS JOIN LATERAL jsonb_array_elements_text(
       COALESCE(d.value -> 'yanlis_konular', '[]'::jsonb)
     || COALESCE(d.value -> 'bos_konular',   '[]'::jsonb)
     ) AS k(konu)
WHERE er.subject_details IS NOT NULL
GROUP BY d.key, k.konu;

-- Doğrulama:
--   SELECT * FROM konu_gozlem ORDER BY gozlem DESC LIMIT 10;
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'exam_topics' AND column_name = 'agirlik';
