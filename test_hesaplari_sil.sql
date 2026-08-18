-- ============================================================
-- TEST HESAPLARINI SİL — geri alınamaz
--
-- Silinecek (kontrol amaçlı açılmış hesaplar):
--   yekabukcu@gmail.com        yavuz kabukcu      (veli)
--   yavuzegekabukcu@gmail.com  yavuz ege kabukcu  (öğrenci)
--
-- Bağlı veri sayımı (silmeden önce yapılan envanter):
--   notifications   1 kayıt
--   family_links    1 kayıt  <- sistemdeki TEK veli-çocuk bağı
--   diğer tabloların hiçbirinde kaydı yok
--
-- ETKİLENMEYECEK hesaplar:
--   melikeerdogan589@gmail.com    (öğretmen)
--   aziz@gmail.com                (öğrenci — görev/sınav verisi bunda)
--   yagmurerenler2008@gmail.com   (öğrenci)
--   m.yusufakpinar44@gmail.com    (öğrenci)
--
-- NOT: family_links silinince sistemde hiç veli-çocuk bağı kalmayacak.
-- Veli paneli test edilmek istenirse yeniden kurulması gerekir.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) ÖNCE GÖR: ne silinecek? (bu blok hiçbir şeyi değiştirmez)
--    Çıktı beklenenle uyuşmuyorsa DURUN, aşağısını çalıştırmayın.
-- ------------------------------------------------------------
SELECT
  u.email,
  u.full_name,
  u.role,
  (SELECT count(*) FROM notifications n WHERE n.user_id = u.id)                        AS bildirim,
  (SELECT count(*) FROM family_links f WHERE f.parent_id = u.id OR f.student_id = u.id) AS aile_bagi,
  (SELECT count(*) FROM tasks t WHERE t.student_id = u.id)                             AS gorev,
  (SELECT count(*) FROM exam_results e WHERE e.student_id = u.id)                      AS sinav
FROM public.users u
WHERE u.email IN ('yekabukcu@gmail.com', 'yavuzegekabukcu@gmail.com');


-- ------------------------------------------------------------
-- 2) SİL
--    auth.users -> public.users arasında ON DELETE CASCADE var
--    (kullanici_silme_migration.sql ile kuruldu), yani auth satırını
--    silmek profili de götürür. Ama alt tabloların hepsinde cascade
--    OLMADIĞI için önce onlar elle temizleniyor — aksi halde öksüz
--    kayıt kalır, daha önce tam olarak bu olmuştu.
-- ------------------------------------------------------------
DO $$
DECLARE v_idler UUID[];
BEGIN
  SELECT array_agg(id) INTO v_idler
  FROM auth.users
  WHERE email IN ('yekabukcu@gmail.com', 'yavuzegekabukcu@gmail.com');

  IF v_idler IS NULL THEN
    RAISE NOTICE 'Bu e-postalarla auth hesabi bulunamadi, silinecek bir sey yok.';
    RETURN;
  END IF;

  RAISE NOTICE 'Silinecek hesap sayisi: %', array_length(v_idler, 1);

  -- Alt tablolar
  DELETE FROM public.notifications        WHERE user_id     = ANY(v_idler);
  DELETE FROM public.badges               WHERE user_id     = ANY(v_idler);
  DELETE FROM public.family_links         WHERE parent_id   = ANY(v_idler)
                                             OR student_id  = ANY(v_idler);
  DELETE FROM public.teacher_students     WHERE teacher_id  = ANY(v_idler)
                                             OR student_id  = ANY(v_idler);
  DELETE FROM public.grup_ogrencileri     WHERE student_id  = ANY(v_idler);
  DELETE FROM public.homework_submissions WHERE student_id  = ANY(v_idler);
  DELETE FROM public.test_sessions        WHERE student_id  = ANY(v_idler);
  DELETE FROM public.exam_results         WHERE student_id  = ANY(v_idler);
  DELETE FROM public.tasks                WHERE student_id  = ANY(v_idler);
  DELETE FROM public.program_atamalari    WHERE student_id  = ANY(v_idler);
  DELETE FROM public.progress             WHERE student_id  = ANY(v_idler);
  DELETE FROM public.lessons              WHERE student_id  = ANY(v_idler)
                                             OR teacher_id  = ANY(v_idler);
  DELETE FROM public.student_profiles     WHERE id          = ANY(v_idler);

  -- Auth hesabı — cascade ile public.users satırı da gider
  DELETE FROM auth.users WHERE id = ANY(v_idler);

  RAISE NOTICE 'Silme tamamlandi.';
END $$;


-- ------------------------------------------------------------
-- 3) DOĞRULAMA
-- ------------------------------------------------------------
SELECT 'auth.users' AS tablo, count(*) AS kalan FROM auth.users
  WHERE email IN ('yekabukcu@gmail.com', 'yavuzegekabukcu@gmail.com')
UNION ALL
SELECT 'public.users', count(*) FROM public.users
  WHERE email IN ('yekabukcu@gmail.com', 'yavuzegekabukcu@gmail.com');
-- İkisi de 0 olmalı.

-- Kalan hesaplar:
SELECT email, full_name, role FROM public.users ORDER BY created_at;
