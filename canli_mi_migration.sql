-- ============================================================
-- Migration: canlı tutma yoklaması
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── NEDEN ───────────────────────────────────────────────────
-- Supabase ücretsiz katmanda 7 gün istek gelmeyen projeyi uykuya
-- alıyor (23 Ekim 2026'da başımıza geldi: proje duraklatıldı,
-- uygulama tamamen kapandı). Pilot başlayana kadar projeyi ayakta
-- tutmak için günde bir yoklama isteği atılacak.
--
-- ── NEDEN AYRI BİR FONKSİYON ────────────────────────────────
-- Yoklama olarak herhangi bir tabloyu okumak işe yaramıyor: anon
-- rolünün hiçbir tabloda izni YOK (bkz. grantlar_migration.sql) ve
-- olmaması doğru. İzinsiz bir isteğin "etkinlik" sayılıp sayılmadığı
-- da belirsiz. Bu yüzden anon'un çağırabildiği, veritabanına gerçekten
-- ulaşan, hiçbir şey açığa çıkarmayan küçük bir fonksiyon var.
--
-- Döndürdüğü tek şey sunucu saati. Veri sızdırmıyor, yazmıyor,
-- parametre almıyor.
--
-- ── BU BİR YAMA ─────────────────────────────────────────────
-- Uykuyu engelliyor, kapasiteyi büyütmüyor ve "kimse kullanmıyor"
-- sinyalini gizliyor. Gerçek çözüm ücretli plan; pilot öğrencilerle
-- başladığında bu görev kaldırılmalı.

CREATE OR REPLACE FUNCTION public.canli_mi()
RETURNS TIMESTAMPTZ
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT now();
$fn$;

COMMENT ON FUNCTION public.canli_mi() IS
  'Canli tutma yoklamasi. Yalnizca sunucu saatini doner; proje uykuya alinmasin diye gunde bir cagriliyor.';

-- anon'a AÇIKÇA veriliyor: yoklamayı yapan zamanlanmış görevin giriş
-- yapmış bir kullanıcısı yok. Verdiği tek şey saat.
REVOKE ALL ON FUNCTION public.canli_mi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canli_mi() TO anon, authenticated, service_role;

-- Doğrulama: çağrılabiliyor mu ve ne dönüyor?
SELECT public.canli_mi() AS "sunucu_saati",
       has_function_privilege('anon', 'public.canli_mi()', 'EXECUTE') AS "anon_cagirabiliyor";
