-- ============================================================
-- Migration: müfredat yazım düzeltmesi
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================
--
-- AYT Fizik'te "Bir Boyutta Savit İvmeli Hareket" yazıyordu;
-- doğrusu "Sabit". Depodaki iki dosya da düzeltildi
-- (src/lib/examTopics.js, exam_topics_migration.sql).
--
-- ── NEDEN SİLİP YENİDEN EKLEMİYORUZ ─────────────────────────
-- Konu adı birçok yerde METİN olarak taşınıyor: görevlerin `topic`
-- alanı, sınav sonuçlarındaki yanlış/boş konu dizileri, soru
-- bankası bölümlerinin `konu` eşleşmesi, çalışma planı blokları.
-- Satırı silip yenisini eklemek bu bağları koparırdı; yerinde
-- güncelleme hepsini birden düzeltiyor.
--
-- Konuyu YAZIM HATASIYLA kaydetmiş kayıtlar da aynı anda
-- düzeltiliyor, yoksa onlar eşleşmeyen bir konu adıyla öksüz
-- kalırdı.

DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $duzelt$
DECLARE
  eski TEXT := 'Bir Boyutta Savit İvmeli Hareket';
  yeni TEXT := 'Bir Boyutta Sabit İvmeli Hareket';
  n_konu INTEGER := 0; n_gorev INTEGER := 0; n_bolum INTEGER := 0; n_blok INTEGER := 0;
BEGIN
  -- 1) Müfredat tablosu
  UPDATE exam_topics SET topic = yeni WHERE topic = eski;
  GET DIAGNOSTICS n_konu = ROW_COUNT;

  -- 2) Görevler
  UPDATE tasks SET topic = yeni WHERE topic = eski;
  GET DIAGNOSTICS n_gorev = ROW_COUNT;

  -- 3) Soru bankası bölümlerinin müfredat eşleşmesi
  UPDATE soru_bankasi_bolumleri SET konu = yeni WHERE konu = eski;
  GET DIAGNOSTICS n_bolum = ROW_COUNT;

  -- 4) Çalışma planı blokları (tablo yoksa atlanıyor)
  BEGIN
    UPDATE calisma_bloklari SET konu = yeni WHERE konu = eski;
    GET DIAGNOSTICS n_blok = ROW_COUNT;
  EXCEPTION WHEN undefined_table OR undefined_column THEN n_blok := -1;
  END;

  INSERT INTO _sinama_sonucu VALUES (format(
    'DUZELTILDI - mufredat:%s gorev:%s bolum:%s blok:%s',
    n_konu, n_gorev, n_bolum,
    CASE WHEN n_blok < 0 THEN 'tablo yok' ELSE n_blok::text END));
END $duzelt$;

-- Kalan var mı? Sınav sonuçlarındaki konu dizileri JSONB içinde
-- taşındığı için ayrıca gösteriliyor; varsa elle bakılması gerekir.
SELECT (SELECT sonuc FROM _sinama_sonucu) AS "sonuc",
       (SELECT count(*) FROM exam_results
         WHERE subject_details::text LIKE '%Savit İvmeli%') AS "sinav_kaydinda_kalan";
