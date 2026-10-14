-- ============================================================
-- Migration: kitaplığa ISBN alanı
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent.
-- ============================================================
--
-- ── ISBN NE İŞE YARIYOR ─────────────────────────────────────
-- Kitabın ADI değil KİMLİĞİ. Bugünkü faydası barkoddan hızlı ekleme;
-- asıl değeri sonra: "bu kitap zaten sistemde var mı" sorusuna
-- güvenilir cevap vermek. Ada göre eşleştirme çalışmıyor — aynı kitap
-- "TYT Matematik Soru Bankası", "Tyt matematik SB", "Matematik TYT"
-- diye üç ayrı kayıt olabiliyor.
--
-- ── BENZERSİZ DEĞİL ─────────────────────────────────────────
-- Aynı ISBN birden çok satırda durabilir, çünkü her koç kitabı KENDİ
-- kitaplığına ekliyor (sahip_id NOT NULL). Benzersiz kısıt koymak,
-- ikinci koçun aynı kitabı eklemesini engellerdi. Paylaşılan kütüphane
-- yapıldığında birleştirme bu alan üzerinden yapılacak.
--
-- ── BİÇİM DENETİMİ ──────────────────────────────────────────
-- 13 hane ve 978/979 ile başlıyor. Sağlama toplamı burada
-- denetlenmiyor: o hesap istemcide (src/lib/isbn.js, 12 sınama) ve
-- veritabanında tekrar yazmak aynı kuralı iki yerde tutmak olurdu.
-- Buradaki denetim kaba biçim denetimi — tamamen bozuk bir değerin
-- (ad, boşluk, 5 hane) girmesini engelliyor.

ALTER TABLE soru_bankalari
  ADD COLUMN IF NOT EXISTS isbn TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.soru_bankalari'::regclass
      AND conname = 'soru_bankalari_isbn_check'
  ) THEN
    ALTER TABLE soru_bankalari ADD CONSTRAINT soru_bankalari_isbn_check
      CHECK (isbn IS NULL OR isbn ~ '^(978|979)[0-9]{10}$');
  END IF;
END $$;

-- "Bu ISBN sistemde var mı" sorgusu için
CREATE INDEX IF NOT EXISTS idx_soru_bankalari_isbn
  ON soru_bankalari (isbn) WHERE isbn IS NOT NULL;

-- ------------------------------------------------------------
-- DAVRANIŞ SINAMASI
-- ------------------------------------------------------------
-- Sonuç SATIR olarak dönüyor: SQL Editor RAISE NOTICE göstermiyor.
DROP TABLE IF EXISTS _sinama_sonucu;
CREATE TEMP TABLE _sinama_sonucu (sonuc TEXT);

DO $test$
DECLARE
  koc UUID; kitap UUID; red BOOLEAN; gecen INTEGER := 0;
BEGIN
  SELECT id INTO koc FROM users WHERE role IN ('teacher', 'admin') LIMIT 1;
  IF koc IS NULL THEN
    INSERT INTO _sinama_sonucu VALUES ('ATLANDI - ogretmen yok, davranis sinanamadi');
    RETURN;
  END IF;

  -- a) gecerli ISBN kabul ediliyor
  INSERT INTO soru_bankalari (sahip_id, ad, isbn)
  VALUES (koc, 'ISBN sinama kitabi', '9786053324560') RETURNING id INTO kitap;
  gecen := gecen + 1;

  -- b) bozuk bicim reddediliyor
  red := false;
  BEGIN
    UPDATE soru_bankalari SET isbn = '12345' WHERE id = kitap;
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA b: bozuk ISBN kabul edildi'; END IF;
  gecen := gecen + 1;

  -- c) kitap barkodu olmayan EAN reddediliyor
  red := false;
  BEGIN
    UPDATE soru_bankalari SET isbn = '5901234123457' WHERE id = kitap;
  EXCEPTION WHEN check_violation THEN red := true; END;
  IF NOT red THEN RAISE EXCEPTION 'SINAMA c: kitap olmayan EAN kabul edildi'; END IF;
  gecen := gecen + 1;

  -- d) ISBN BOS birakilabiliyor (elle eklenen kitaplar)
  UPDATE soru_bankalari SET isbn = NULL WHERE id = kitap;
  gecen := gecen + 1;

  DELETE FROM soru_bankalari WHERE id = kitap;

  INSERT INTO _sinama_sonucu VALUES (format('GECTI - %s davranis sinamasi', gecen));
END $test$;

SELECT sonuc AS "kitaplik_isbn" FROM _sinama_sonucu;
