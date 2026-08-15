-- ============================================================
-- KULLANICI SİLME — auth.users silinince profil de silinsin
--
-- BULGU: Supabase panelinden bir kullanıcı silindiğinde yalnızca
-- auth.users satırı gidiyor; public.users'taki profil satırı kalıyor.
-- Uygulama öğrenci listesini public.users'tan beslediği için silinen
-- kişi listede durmaya devam ediyor ve ona bağlantı teklifi bile
-- gönderilebiliyor.
--
-- Gözlenen: "yağmur erenler" auth tarafından silindi; public.users'ta
-- satırı ve 2 bildirimi kaldı. teacher_students kaydı silinmişti, yani
-- bazı tablolarda bağ var bazılarında yok.
--
-- ÇÖZÜM: public.users.id -> auth.users(id) ON DELETE CASCADE.
-- Bundan sonra panelden silme profili de götürür; profile bağlı
-- tabloların kendi cascade zincirleri de tetiklenir.
--
-- SIRA ÖNEMLİ: yabancı anahtar eklenebilmesi için önce öksüz satırlar
-- temizlenmeli, aksi halde ALTER TABLE hata verir.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) Ne temizleneceğini önce raporla (silmeden önce görün)
-- ------------------------------------------------------------
DO $$
DECLARE v_sayi INT;
BEGIN
  SELECT count(*) INTO v_sayi
  FROM public.users u
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);
  RAISE NOTICE 'auth karsiligi olmayan profil satiri: %', v_sayi;
END $$;

SELECT u.id, u.full_name, u.email, u.role
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);


-- ------------------------------------------------------------
-- 2) Öksüz kayıtları temizle
--    Önce profile bağlı yan kayıtlar, sonra profilin kendisi.
-- ------------------------------------------------------------
DELETE FROM public.notifications n
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = n.user_id);

DELETE FROM public.badges b
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = b.user_id);

DELETE FROM public.student_profiles s
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = s.id);

DELETE FROM public.teacher_students t
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.student_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.teacher_id);

DELETE FROM public.family_links f
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = f.student_id)
     OR NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = f.parent_id);

DELETE FROM public.tasks t
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.student_id);

DELETE FROM public.exam_results e
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = e.student_id);

DELETE FROM public.test_sessions t
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = t.student_id);

DELETE FROM public.homework_submissions h
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = h.student_id);

DELETE FROM public.program_atamalari p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p.student_id);

DELETE FROM public.progress p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = p.student_id);

-- Profilin kendisi en son
DELETE FROM public.users u
  WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);


-- ------------------------------------------------------------
-- 3) Bağı kur: auth.users silinince profil de gitsin
-- ------------------------------------------------------------
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_id_fkey;

ALTER TABLE public.users
  ADD CONSTRAINT users_id_fkey
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- ============================================================
-- Doğrulama:
--   SELECT count(*) FROM auth.users;     -- eşit olmalı
--   SELECT count(*) FROM public.users;
--
--   SELECT conname, confdeltype FROM pg_constraint
--   WHERE conrelid = 'public.users'::regclass AND contype = 'f';
--   -- confdeltype 'c' olmalı ('c' = cascade)
--
-- Bundan sonra Supabase paneli > Authentication > Users > sil
-- işlemi profili de kaldırır, kişi öğrenci listesinde görünmez.
--
-- NOT: Bu migration yalnızca auth karşılığı OLMAYAN satırları siler.
-- Gerçek kullanıcılarınızın verisine dokunmaz; 1. adımdaki SELECT
-- tam olarak neyin gideceğini çalıştırmadan önce gösterir.
-- ============================================================
