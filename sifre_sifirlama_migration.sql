-- ============================================================
-- ŞİFRE SIFIRLAMA (koç eliyle, e-postasız)
--
-- ── NEDEN E-POSTASIZ ────────────────────────────────────────────
-- Supabase'in kendi sıfırlama akışı e-posta gönderir; dahili servis
-- 2 mesaj/saat'te kilitli ve yükseltilemiyor, SMTP de kurulmadı.
-- Bu yüzden sıfırlamayı koç yapıyor: geçici şifre üretiliyor, koç
-- kullanıcıya kendi iletiyor.
--
-- ── İKİ PARÇA ───────────────────────────────────────────────────
-- 1) Kim kimin şifresini sıfırlayabilir — kural burada, backend'de değil
-- 2) sifre_degistirmeli işareti — geçici şifre kalıcı olmasın
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

-- Geçici şifreyle giren kullanıcı, panele geçmeden önce kendi şifresini
-- belirlemek zorunda. Aksi halde koçun bildiği bir şifre süresiz geçerli
-- kalırdı.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sifre_degistirmeli BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.sifre_degistirmeli IS
  'Koç geçici şifre atadığında true olur; kullanıcı kendi şifresini '
  'belirleyince false''a döner.';


-- ------------------------------------------------------------
-- Yetki: kim kimin şifresini sıfırlayabilir
--
-- analiz_gorebilir_mi ile aynı desen: bakanın id'si parametre olarak
-- geliyor (backend'de oturum yok, service_role ile bağlanıyor), bu
-- yüzden YALNIZCA service_role çağırabilmeli. authenticated
-- çağırabilseydi p_bakan'a başkasının id'sini yazıp "evet yetkisi var"
-- cevabını kendi uydurabilirdi.
--
-- YÖNETİCİ HESABI SIFIRLANAMAZ. Bir yönetici diğerinin şifresini
-- sıfırlayabilseydi bu doğrudan hesap devralma olurdu. Yöneticinin
-- şifresi Supabase panelinden değiştirilir — bilinçli bir sınır.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sifre_sifirlama_yetkim_var(p_bakan UUID, p_kisi UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_bakan IS NOT NULL AND p_kisi IS NOT NULL AND p_bakan <> p_kisi
    AND NOT EXISTS (SELECT 1 FROM users WHERE id = p_kisi AND role = 'admin')
    AND (
      -- yönetici: yönetici olmayan herkesi
      EXISTS (
        SELECT 1 FROM users
        WHERE id = p_bakan AND role = 'admin' AND onay_durumu = 'onaylandi'
      )
      -- koç: kendi onaylı öğrencisini
      OR EXISTS (
        SELECT 1 FROM teacher_students
        WHERE teacher_id = p_bakan AND student_id = p_kisi AND durum = 'onaylandi'
      )
      -- koç: öğrencisinin velisini (aileyle muhatap olan koç)
      OR EXISTS (
        SELECT 1 FROM teacher_students ts
        JOIN family_links fl ON fl.student_id = ts.student_id
        WHERE ts.teacher_id = p_bakan AND ts.durum = 'onaylandi'
          AND fl.parent_id = p_kisi
      )
    );
$$;

REVOKE ALL ON FUNCTION public.sifre_sifirlama_yetkim_var(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sifre_sifirlama_yetkim_var(UUID, UUID) TO service_role;


-- ------------------------------------------------------------
-- sifre_degistirmeli'yi kullanıcı kendi kapatabilir
--
-- Kullanıcı kendi satırını zaten güncelleyebiliyor (profil düzenleme),
-- bu yüzden ek politika gerekmiyor. Ancak rol kilidi tetikleyicisinin
-- bu kolonu ENGELLEMEDİĞİNDEN emin olmak gerekiyor: tetikleyici
-- yalnızca role ve onay_durumu'nu dinliyor, bu kolon listede yok.
--
-- Bilinçli sınır: işareti kapatmak için şifrenin GERÇEKTEN değiştiğini
-- veritabanından doğrulayamıyoruz. Kararlı bir kullanıcı arayüzü atlayıp
-- işareti kapatabilir — ama bunu yapınca yalnızca kendi zararına olur,
-- çünkü koçun bildiği geçici şifre geçerli kalır. Bu bir güvenlik duvarı
-- değil, kullanıcıyı doğru davranışa yönlendiren bir kapı.
-- ------------------------------------------------------------


-- ============================================================
-- DOĞRULAMA
--
-- 1) authenticated çağıramamalı (anon anahtarla POST -> 401/42501):
--      POST /rest/v1/rpc/sifre_sifirlama_yetkim_var
--
-- 2) Kural tablosu:
--      SELECT sifre_sifirlama_yetkim_var('<koç-id>', '<öğrenci-id>');
--    kendi öğrencisi -> true, başkasının öğrencisi -> false,
--    herhangi biri -> yönetici -> false
--
-- 3) Kolon:
--      SELECT email, sifre_degistirmeli FROM users;
--    hepsi false olmalı (kimse geçici şifreyle giriyor değil)
-- ============================================================
