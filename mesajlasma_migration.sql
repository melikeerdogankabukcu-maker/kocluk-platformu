-- ============================================================
-- MESAJLAŞMA
--
-- messages tablosu projenin başında oluşturulmuş ama hiç kullanılmamış:
-- kod tarafında tek bir referansı yok, içi boş. Şema uygun (sender_id,
-- receiver_id, content, is_read, created_at) — yeniden kurmak yerine
-- üzerine güvenlik ve bildirim katmanı ekleniyor.
--
-- ── KİM KİME YAZABİLİR ──────────────────────────────────────────
-- Serbest mesajlaşma YOK. Yalnızca aralarında onaylı bir bağ olanlar:
--   öğretmen ↔ onaylı öğrencisi
--   öğretmen ↔ öğrencisinin velisi
-- Öğrenci-öğrenci ve veli-veli kapalı; öğrenci-veli de kapalı (aynı evde,
-- uygulamaya ihtiyaç yok). Kural tek fonksiyonda toplandı ki ileride
-- genişletmek gerekirse tek yer değişsin.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION mesajlasabilir_mi(p_kisi UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_kisi IS NOT NULL AND p_kisi <> auth.uid() AND (
    EXISTS (
      -- öğretmen ↔ onaylı öğrencisi (iki yön de)
      SELECT 1 FROM teacher_students
      WHERE durum = 'onaylandi'
        AND ((teacher_id = auth.uid() AND student_id = p_kisi)
          OR (student_id  = auth.uid() AND teacher_id = p_kisi))
    )
    OR EXISTS (
      -- öğretmen ↔ öğrencisinin velisi (iki yön de)
      SELECT 1
      FROM teacher_students ts
      JOIN family_links fl ON fl.student_id = ts.student_id
      WHERE ts.durum = 'onaylandi'
        AND ((ts.teacher_id = auth.uid() AND fl.parent_id  = p_kisi)
          OR (fl.parent_id  = auth.uid() AND ts.teacher_id = p_kisi))
    )
  );
$$;

REVOKE ALL ON FUNCTION public.mesajlasabilir_mi(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mesajlasabilir_mi(UUID) TO authenticated;


-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'messages' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.messages', r.policyname);
  END LOOP;
END $$;

-- Yazışmayı yalnızca iki taraf görür
CREATE POLICY "Mesaji taraflar gorur" ON messages
  FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Gönderen kendini başkası yerine koyamaz, bağı olmayana yazamaz
CREATE POLICY "Bagli kisiye mesaj gonderilir" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND mesajlasabilir_mi(receiver_id));

-- Okundu işareti yalnızca alıcıda
CREATE POLICY "Alici okundu isaretler" ON messages
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid()) WITH CHECK (receiver_id = auth.uid());

-- Gönderen kendi mesajını silebilir (yanlış gönderim)
CREATE POLICY "Gonderen kendi mesajini siler" ON messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid());


-- ------------------------------------------------------------
-- Mesaj metni sonradan DEĞİŞTİRİLEMEZ
--
-- UPDATE politikası alıcıya satırı güncelleme izni veriyor (okundu
-- işareti için). Kolon bazlı izin RLS'te yok, dolayısıyla alıcı teknik
-- olarak içeriği de yeniden yazabilirdi — yani karşı tarafın söylediğini
-- değiştirebilirdi. Tetikleyici bunu kapatıyor: yalnızca is_read
-- değişebilir.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION mesaj_metnini_koru()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.content     IS DISTINCT FROM OLD.content
  OR NEW.sender_id   IS DISTINCT FROM OLD.sender_id
  OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id THEN
    RAISE EXCEPTION 'Gonderilmis mesaj degistirilemez';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.mesaj_metnini_koru() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mesaj_metin_kilidi ON messages;
CREATE TRIGGER mesaj_metin_kilidi
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION mesaj_metnini_koru();


-- ------------------------------------------------------------
-- Yeni mesaj → bildirim
-- Zil zaten notifications tablosunu dinliyor; mesajı da oraya bağlıyoruz
-- ki alıcı uygulamanın başka bir yerindeyken haberi olsun.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_bildirim_mesaj()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM bildirim_ekle(
    NEW.receiver_id,
    'mesaj',
    COALESCE(kisi_adi(NEW.sender_id), 'Yeni mesaj'),
    -- Bildirimde metnin başı yeter; tamamı mesaj ekranında
    left(NEW.content, 80) || CASE WHEN length(NEW.content) > 80 THEN '…' ELSE '' END,
    NEW.sender_id          -- ilgili_id: konuşmayı açacak kişi
  );
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_bildirim_mesaj() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS bildirim_mesaj ON messages;
CREATE TRIGGER bildirim_mesaj
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION trg_bildirim_mesaj();


-- ------------------------------------------------------------
-- Sorgu düzeni: bir kişinin tüm yazışmaları, en yeniden eskiye
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_alici ON messages (receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_gonderen ON messages (sender_id, created_at DESC);


-- ------------------------------------------------------------
-- Realtime: mesaj anında düşsün (bildirimlerde olduğu gibi)
-- Tablo zaten yayındaysa hata vermesin diye kontrollü ekleniyor.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    RAISE NOTICE 'messages realtime yayinina eklendi';
  ELSE
    RAISE NOTICE 'messages zaten realtime yayininda';
  END IF;
END $$;


-- ============================================================
-- DOĞRULAMA
--   SELECT count(*) FROM messages;                    -- 0
--   SELECT proname FROM pg_proc WHERE proname = 'mesajlasabilir_mi';
--
--   Öğretmen hesabıyla giriş yapıp öğrenciye mesaj atınca:
--     SELECT m.content, m.is_read, g.full_name AS gonderen, a.full_name AS alici
--     FROM messages m
--     JOIN users g ON g.id = m.sender_id
--     JOIN users a ON a.id = m.receiver_id;
--   Alıcıda ayrıca 'mesaj' türünde bir bildirim oluşmalı.
-- ============================================================
