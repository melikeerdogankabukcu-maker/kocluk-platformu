-- ============================================================
-- ANALİZ SERVİSİ YETKİ DENETİMİ
--
-- ── AÇIK ────────────────────────────────────────────────────────
-- Python analiz servisi (Render) hiçbir kimlik doğrulaması yapmıyordu:
--     GET /analiz/{student_id}
-- öğrenci id'sini URL'den alıp service_role ile Supabase'i sorguluyor ve
-- sonucu ÇAĞIRAN KİM OLURSA OLSUN döndürüyordu. Token gerekmiyordu;
-- düz bir curl ile herhangi bir öğrencinin sınav analizi, görev durumu ve
-- ödev geçmişi okunabiliyordu. Doğrulandı: HTTP 200, 1479 bayt veri.
--
-- Bu, koç izolasyonu için yapılan RLS çalışmasının TAMAMINI geçersiz
-- kılıyordu: users tablosu giriş yapan herkese açık olduğu için koç B,
-- koç A'nın öğrencisinin UUID'sini oradan alıp bu kapıdan içeri
-- girebiliyordu. RLS'te kapattığımız yol, servis üzerinden dolanılıyordu.
--
-- CORS koruma değil: yalnızca tarayıcıyı bağlar, curl'ü bağlamaz.
--
-- ── ÇÖZÜM ───────────────────────────────────────────────────────
-- Kural buraya yazılıyor, backend'e değil. Aynı soruyu iki yerde iki
-- farklı şekilde cevaplamak, ikisi zamanla ayrışınca sessiz bir açık
-- doğurur; RLS politikaları da zaten bu tabloları kullanıyor.
--
-- Fonksiyon auth.uid() KULLANMIYOR, bakanın id'sini parametre olarak
-- alıyor: backend service_role ile bağlanıyor, orada oturum yok.
-- Bu yüzden YALNIZCA service_role çağırabilmeli — authenticated bir
-- kullanıcı çağırabilseydi p_bakan'a başkasının id'sini yazıp
-- "evet görebilir" cevabını kendi uydurabilirdi.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION public.analiz_gorebilir_mi(p_bakan UUID, p_ogrenci UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_bakan IS NOT NULL AND p_ogrenci IS NOT NULL AND (
    -- öğrencinin kendisi
    p_bakan = p_ogrenci
    -- yönetici
    OR EXISTS (
      SELECT 1 FROM users
      WHERE id = p_bakan AND role = 'admin' AND onay_durumu = 'onaylandi'
    )
    -- öğrencinin ONAYLI koçu
    OR EXISTS (
      SELECT 1 FROM teacher_students
      WHERE teacher_id = p_bakan AND student_id = p_ogrenci AND durum = 'onaylandi'
    )
    -- öğrencinin velisi
    OR EXISTS (
      SELECT 1 FROM family_links
      WHERE parent_id = p_bakan AND student_id = p_ogrenci
    )
  );
$$;

-- authenticated'tan da alınıyor: bu fonksiyon RLS politikalarından
-- çağrılmıyor, yalnızca backend kullanıyor. Politikadan çağrılsaydı
-- yetkiyi almak sorguyu hataya düşürürdü (ogrencim_mi'deki durum),
-- burada öyle bir bağ yok.
REVOKE ALL ON FUNCTION public.analiz_gorebilir_mi(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analiz_gorebilir_mi(UUID, UUID) TO service_role;


-- ============================================================
-- DOĞRULAMA
--
-- 1) authenticated çağıramamalı (anon anahtarla POST edilirse 401/42501):
--      POST /rest/v1/rpc/analiz_gorebilir_mi
--
-- 2) Kural tablosu — kendi id'lerinizle:
--      SELECT analiz_gorebilir_mi('<koç-id>', '<öğrenci-id>');
--    Kendi öğrencisi için true, başkasının öğrencisi için false dönmeli.
--
-- 3) Asıl test servis üzerinden:
--      curl https://kocluk-analiz.onrender.com/analiz/<id>
--    Tokensız artık 401 dönmeli (önce 200 + veri dönüyordu).
-- ============================================================
