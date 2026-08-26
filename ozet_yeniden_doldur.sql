-- ============================================================
-- HAFTALIK ÖZETİ SIFIRDAN YENİDEN DOLDUR
--
-- ── NEDEN GEREKLİ ───────────────────────────────────────────────
-- Tetikleyiciler kurulmadan ÖNCE eklenen kayıtlar özete işlenmemişti.
-- Doğrulama yakaladı: özet 121 görev diyordu, kaynakta 137 vardı.
-- Tetikleyiciler bundan sonrasını hallediyor ama geçmişteki boşluğu
-- kapatmıyor — o yalnızca ilgili hafta bir daha değişirse düzelir.
--
-- Bu dosya tüm seriyi yeniden hesaplıyor. Tekrar çalıştırılabilir:
-- hesaplama kaynak tablolardan yapılıyor, üst üste eklemiyor.
--
-- ── SİLİNMİŞ KAYNAKLARIN ARTIK SATIRLARI ────────────────────────
-- Öğrencisi silinmiş ya da artık hiçbir etkinliği kalmamış haftalarda
-- eski satırlar durabilir. Bunlar sıfırlarla güncelleniyor, satır
-- silinmiyor: sıfır bir bilgi, "o hafta hiçbir şey yapılmadı" demek.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

DO $$
DECLARE
  ogr RECORD; h DATE; n INTEGER := 0;
  buHafta DATE := date_trunc('week', now())::date;
BEGIN
  FOR ogr IN
    SELECT u.id,
           LEAST(
             COALESCE((SELECT min(COALESCE(t.due_date, t.created_at::date)) FROM tasks t WHERE t.student_id = u.id), buHafta),
             COALESCE((SELECT min(x.created_at::date) FROM test_sessions x WHERE x.student_id = u.id), buHafta),
             COALESCE((SELECT min(e.exam_date)        FROM exam_results e  WHERE e.student_id = u.id), buHafta),
             COALESCE((SELECT min(l.lesson_date)      FROM lessons l       WHERE l.student_id = u.id), buHafta),
             -- Zaten var olan satırların haftası da kapsanmalı, yoksa
             -- kaynağı silinmiş bir hafta bayat kalırdı
             COALESCE((SELECT min(o.hafta) FROM ogrenci_haftalik o WHERE o.student_id = u.id), buHafta)
           ) AS basla,
           GREATEST(
             buHafta,
             COALESCE((SELECT max(t.due_date)    FROM tasks t   WHERE t.student_id = u.id), buHafta),
             COALESCE((SELECT max(l.lesson_date) FROM lessons l WHERE l.student_id = u.id), buHafta),
             COALESCE((SELECT max(o.hafta) FROM ogrenci_haftalik o WHERE o.student_id = u.id), buHafta)
           ) AS bitir
    FROM users u WHERE u.role = 'student'
  LOOP
    h := date_trunc('week', ogr.basla)::date;
    WHILE h <= date_trunc('week', ogr.bitir)::date LOOP
      PERFORM haftalik_ozet_hesapla(ogr.id, h);
      n := n + 1;
      h := h + 7;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Haftalik ozet yeniden hesaplandi: % satir.', n;
END $$;


-- ============================================================
-- DOĞRULAMA — bu sefer tutmalı
--
--   SELECT (SELECT sum(gorev_verilen) FROM ogrenci_haftalik) AS verilen,
--          (SELECT count(*)           FROM tasks)            AS gorev,
--          (SELECT sum(gorev_yapilan) FROM ogrenci_haftalik) AS yapilan,
--          (SELECT count(*) FROM tasks WHERE is_done)        AS yapilmis,
--          (SELECT sum(sinav_sayisi)  FROM ogrenci_haftalik) AS sinav,
--          (SELECT count(*)           FROM exam_results)     AS sinav_kaynak;
--   -- verilen=gorev, yapilan=yapilmis, sinav=sinav_kaynak
-- ============================================================
