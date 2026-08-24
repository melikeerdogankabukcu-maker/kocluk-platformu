-- ============================================================
-- TESTE YANLIŞ SAYISI
--
-- ── SORUN ───────────────────────────────────────────────────────
-- test_sessions yalnızca toplam soru ve doğru sayısını tutuyordu.
-- Yanlış ile BOŞ birbirine karışıyordu: 20 soruda 12 doğru varsa geri
-- kalan 8'in kaçının yanlış kaçının boş olduğu bilinmiyordu.
--
-- Bu fark önemli, çünkü TYT/AYT'de net = doğru − yanlış/4. Boş bırakılan
-- soru neti düşürmüyor, yanlış düşürüyor. İkisini aynı saymak öğrencinin
-- netini olduğundan farklı gösterir.
--
-- ── BOŞ SAYISI SAKLANMIYOR ──────────────────────────────────────
-- boş = toplam − doğru − yanlış. Üçü de saklansaydı birbiriyle çelişen
-- bir dördüncü sayı tutmuş olurduk; kısıt bozulduğunda hangisinin doğru
-- olduğu belirsiz kalırdı. Bu projede türetilebilir değer saklanmıyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE test_sessions
  ADD COLUMN IF NOT EXISTS yanlis_count INTEGER;

COMMENT ON COLUMN test_sessions.yanlis_count IS
  'Yanlış cevap sayısı. Boş = question_count - correct_count - yanlis_count. '
  'Eski kayıtlarda NULL: o zaman yanlış/boş ayrımı girilmemişti.';

-- Sayılar birbiriyle tutarlı olmalı. Eski kayıtlarda yanlis_count NULL
-- olduğu için karşılaştırma NULL döner ve kısıt onları ENGELLEMEZ —
-- geriye dönük veri bu yüzden bozulmuyor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.test_sessions'::regclass
      AND conname  = 'test_sayilari_tutarli'
  ) THEN
    ALTER TABLE test_sessions ADD CONSTRAINT test_sayilari_tutarli
      CHECK (
        yanlis_count IS NULL
        OR (yanlis_count >= 0
            AND COALESCE(correct_count, 0) + yanlis_count <= COALESCE(question_count, 0))
      );
  END IF;
END $$;


-- ============================================================
-- DOĞRULAMA
--
--   SELECT subject, question_count, correct_count, yanlis_count,
--          question_count - correct_count - yanlis_count AS bos
--   FROM test_sessions ORDER BY created_at DESC;
--   -- eski kayıtlarda yanlis_count NULL, bos da NULL (bilinmiyor)
--
-- Kısıt denemesi (reddedilmeli):
--   UPDATE test_sessions SET yanlis_count = 999 WHERE id = <bir id>;
-- ============================================================
