-- ============================================================
-- ÖĞRENCİ KENDİ TESTİNİ DÜZENLEYEBİLSİN
--
-- ── DURUM ───────────────────────────────────────────────────────
-- test_sessions'ta öğrenci için UPDATE/DELETE politikası yoktu: yanlış
-- girilen bir test kalıcıydı. Soru sayısını yanlış yazan öğrenci
-- düzeltemiyor, hatalı satır analize ve haftalık özete girmeye devam
-- ediyordu.
--
-- ── SINIR: KOÇ ONAYLADIYSA DEĞİŞMEZ ─────────────────────────────
-- Test bir görevin KANITI. Koç görevi doğruladıktan sonra öğrenci testi
-- değiştirebilseydi, onaylanan şeyle duran şey farklı olurdu — koç 18
-- doğruya bakıp onaylar, ardından sayı 12 yapılabilirdi. Silme de aynı
-- sebeple kapalı: kanıt onaydan sonra ortadan kaldırılamamalı.
--
-- Göreve bağlı OLMAYAN testlerde ve henüz onaylanmamış görevlerde
-- düzenleme serbest.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.test_duzenlenebilir_mi(p_task UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_task IS NULL
      OR NOT EXISTS (
           SELECT 1 FROM tasks
           WHERE id = p_task AND ogretmen_onayi = 'onaylandi'
         );
$$;

-- Politika içinden çağrılıyor: EXECUTE yetkisi olmayan bir rol için
-- politika değerlendirilemez ve sorgu boş sonuç yerine HATA döner.
GRANT EXECUTE ON FUNCTION public.test_duzenlenebilir_mi(UUID) TO authenticated;


-- Mevcut politikalara DOKUNULMUYOR (okuma ve ekleme yerinde kalıyor);
-- üzerine iki yeni politika ekleniyor.
DROP POLICY IF EXISTS "Ogrenci kendi testini duzenler" ON test_sessions;
CREATE POLICY "Ogrenci kendi testini duzenler" ON test_sessions
  FOR UPDATE TO authenticated
  USING      (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id))
  WITH CHECK (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id));

DROP POLICY IF EXISTS "Ogrenci kendi testini siler" ON test_sessions;
CREATE POLICY "Ogrenci kendi testini siler" ON test_sessions
  FOR DELETE TO authenticated
  USING (student_id = auth.uid() AND test_duzenlenebilir_mi(task_id));


-- ============================================================
-- DOĞRULAMA
--
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename = 'test_sessions' ORDER BY cmd, policyname;
--   -- UPDATE ve DELETE politikaları listede olmalı
--
-- Asıl test uygulamadan:
--   1) Göreve bağlı olmayan bir testi düzenleyin -> çalışmalı
--   2) Koçun ONAYLADIĞI bir göreve bağlı testi düzenlemeyi deneyin
--      -> arayüzde düğme çıkmamalı; doğrudan denenirse RLS reddeder
--
-- NOT: test_gorev_bagi_kilidi tetikleyicisi yerinde duruyor, yani
-- düzenlerken testin başkasının görevine bağlanması hâlâ engelleniyor.
-- ============================================================
