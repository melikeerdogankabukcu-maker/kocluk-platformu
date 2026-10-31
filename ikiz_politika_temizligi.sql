-- ============================================================
-- Migration: ikiz (tekrar eden) RLS politikalarını kaldır
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN ───────────────────────────────────────────────────
-- Geliştirme boyunca aynı işi yapan politikalar ikişer kez yazılmış.
-- Zararsızlar (politikalar VEYA'lanıyor, ikisi de aynı şeye izin
-- veriyor) ama iki sorun yaratıyorlar:
--   1) Depodaki tanım ile canlı veritabanı birbirini tutmuyor.
--      cekirdek_tablolar_migration.sql her çiftin BİRİNİ yazıyor;
--      sıfırdan kurulan şemada 4 politika eksik kalıyor (davranış
--      aynı ama "aynı mı" sorusu her seferinde yeniden inceleniyor).
--   2) Bir gün biri politikayı daraltmak istediğinde ikizini
--      görmezse, daraltma hiçbir işe yaramıyor — ikiz hâlâ izin
--      veriyor. Sessiz ve bulunması zor bir hata.
--
-- ── NEDEN GÜVENLİ ───────────────────────────────────────────
-- Silinenlerin her biri, KALAN bir politikayla aynı ölçütü taşıyor;
-- canlıdan çıkarılan dökümle tek tek karşılaştırıldı:
--
--   silinen                                      kalan (aynı ölçüt)
--   Ogrenci sinav sonuclarini okur            →  Öğrenci kendi sınav sonuçlarını görür
--     ikisi de: SELECT USING (auth.uid() = student_id)
--   Ogretmen kendi ogrencisinin sinavlarini   →  Ogretmen kendi ogrencilerinin sinavlarini
--     ikisi de: ALL USING/CHECK ogrencim_mi(student_id)
--   Veli çocuğun sınav sonuçlarını görür      →  Veli cocuk sinav sonuclarini okur
--     ikisi de: SELECT USING (EXISTS family_links ...)
--   Ogretmen kendi ogrencisinin testlerini    →  Ogretmen kendi ogrencilerinin testlerini
--     ikisi de: SELECT USING ogrencim_mi(student_id)
--
-- Yani hiçbir erişim kapanmıyor, yalnız tekrar kalkıyor.

DROP POLICY IF EXISTS "Ogrenci sinav sonuclarini okur"                 ON public.exam_results;
DROP POLICY IF EXISTS "Ogretmen kendi ogrencisinin sinavlarini yonetir" ON public.exam_results;
DROP POLICY IF EXISTS "Veli çocuğun sınav sonuçlarını görür"           ON public.exam_results;
DROP POLICY IF EXISTS "Ogretmen kendi ogrencisinin testlerini okur"     ON public.test_sessions;

-- family_links'te aynı çifti koruyan İKİ UNIQUE kısıt vardı.
-- Biri yeter; cekirdek_tablolar_migration.sql 'family_links_benzersiz'
-- adıyla yazıyor, diğeri kaldırılıyor.
ALTER TABLE public.family_links
  DROP CONSTRAINT IF EXISTS family_links_parent_id_student_id_key;

-- ------------------------------------------------------------
-- DENETİM: artık depodaki tanımla aynı mı?
-- ------------------------------------------------------------
-- Beklenen (bu dosya çalıştığı gün): exam_results 6, family_links 4,
-- tasks 3, messages 4, test_sessions 7, users 6 politika.
--
-- GÜNCEL DEĞİL: 31 Ekim 2026'da eski_kalip_politika_temizligi.sql
-- "görevi olan öğretmen" ölçütlü üç politikayı kaldırdı →
-- exam_results 4, test_sessions 6. Sayılar burada bilerek
-- değiştirilmedi; bu dosya kendi günündeki durumun kaydı.
SELECT t.tablename AS "tablo",
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS "politika",
       (SELECT count(*) FROM pg_constraint con
         WHERE con.conrelid = ('public.' || quote_ident(t.tablename))::regclass
           AND con.contype = 'u') AS "unique_kisit"
  FROM pg_tables t
 WHERE t.schemaname = 'public'
   AND t.tablename IN ('users','family_links','tasks','exam_results','test_sessions','messages')
 ORDER BY t.tablename;
