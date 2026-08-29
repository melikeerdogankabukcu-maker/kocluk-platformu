-- ============================================================
-- MESAJA DOSYA / GÖRSEL EKLEME
--
-- Koç çalışma kâğıdı yollayamıyor, öğrenci takıldığı sorunun fotoğrafını
-- atamıyordu. Ödev ve testlerde kullanılan biçimin aynısı: dosyalar
-- JSONB dizisi [{url, ad}]. Aynı yardımcılar (odevDosyalari,
-- yeniDosyaYolu) tekrar kullanılıyor, ikinci bir dosya biçimi
-- çıkarılmıyor.
--
-- ── METİN BOŞ OLABİLİYOR ────────────────────────────────────────
-- Yalnızca görsel gönderilebilmeli ("şu soruya bak" diye bir şey
-- yazmadan fotoğraf atmak). content NOT NULL ise boş metin yazılır;
-- kısıt metin VE dosya birlikte boş olamasın diye kuruluyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS dosyalar JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN messages.dosyalar IS
  'Mesaja eklenen dosyalar: [{"url": ..., "ad": ...}]. Ödev ve '
  'testlerdeki biçimin aynısı.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass AND conname = 'mesaj_dosyalar_dizi'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT mesaj_dosyalar_dizi
      CHECK (jsonb_typeof(dosyalar) = 'array');
  END IF;

  -- Boş mesaj gönderilemesin: ya metin ya dosya olmalı
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.messages'::regclass AND conname = 'mesaj_bos_olamaz'
  ) THEN
    ALTER TABLE messages ADD CONSTRAINT mesaj_bos_olamaz
      CHECK (
        COALESCE(btrim(content), '') <> ''
        OR jsonb_array_length(dosyalar) > 0
      );
  END IF;
END $$;


-- ------------------------------------------------------------
-- Metin kilidi dosyaları da kapsasın
--
-- mesajlasma_migration'daki tetikleyici, alıcının "okundu" işaretlerken
-- mesaj METNİNİ değiştirememesini sağlıyordu. Dosyalar da aynı korumaya
-- muhtaç: korunmasaydı alıcı, karşı tarafın gönderdiği eki silebilir ya
-- da değiştirebilirdi.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mesaj_metnini_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    RAISE EXCEPTION 'Gonderilmis mesajin metni degistirilemez.';
  END IF;
  IF NEW.dosyalar IS DISTINCT FROM OLD.dosyalar THEN
    RAISE EXCEPTION 'Gonderilmis mesajin ekleri degistirilemez.';
  END IF;
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'Mesajin taraflari degistirilemez.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mesaj_metin_kilidi ON messages;
CREATE TRIGGER mesaj_metin_kilidi
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION mesaj_metnini_koru();


-- ------------------------------------------------------------
-- Bildirim metni: yalnızca dosya gönderildiyse "dosya gönderdi" desin
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bildirim_mesaj()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM bildirim_ekle(
    NEW.receiver_id,
    'mesaj',
    kisi_adi(NEW.sender_id) || ' mesaj gönderdi',
    CASE
      WHEN COALESCE(btrim(NEW.content), '') <> ''
        THEN left(NEW.content, 90)
      ELSE jsonb_array_length(NEW.dosyalar) || ' dosya gönderdi'
    END,
    NEW.sender_id
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_bildirim_mesaj() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- DOĞRULAMA
--
--   SELECT content, jsonb_array_length(dosyalar) FROM messages;
--   -- mevcut 5 mesajda dosya sayısı 0 olmalı
--
-- Kısıt denemeleri (ikisi de REDDEDİLMELİ):
--   INSERT ... (content, dosyalar) VALUES ('', '[]');   -- boş mesaj
--   UPDATE messages SET dosyalar = '[]' WHERE id = ...; -- ek değiştirme
-- ============================================================
