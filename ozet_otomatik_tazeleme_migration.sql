-- ============================================================
-- TEST DEĞİŞİNCE O HAFTANIN ÖZETİ KENDİLİĞİNDEN TAZELENSİN
--
-- ── NEDEN TETİKLEYİCİ ───────────────────────────────────────────
-- İstemciden yapılamazdı: haftalik_ozet_yenile yalnızca koç/yöneticiye
-- açık, testi kaydeden ise ÖĞRENCİ. Öğrenciye o yetkiyi vermek, tek bir
-- haftayı tazelemek için tüm seriyi yeniden yazma hakkı vermek olurdu.
--
-- Tetikleyici SECURITY DEFINER olduğu için hesaplama tablo sahibi
-- olarak çalışıyor; öğrencinin ogrenci_haftalik üzerinde hiçbir yazma
-- yetkisi olmadan satır güncelleniyor.
--
-- Ayrıca test birden fazla yoldan değişiyor (ekleme, düzenleme, silme).
-- Her çağrı yerinde tazelemeyi hatırlamak zorunda kalsaydık er ya da geç
-- biri unutulur ve özet sessizce eskimiş kalırdı.
--
-- ── ESKİ HAFTA DA TAZELENİYOR ───────────────────────────────────
-- Düzenleme testin tarihini ya da sahibini değiştirebilir. Yalnızca yeni
-- haftayı hesaplasaydık, ESKİ hafta o testi saymaya devam ederdi ve
-- toplam iki kez sayılırdı.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

CREATE OR REPLACE FUNCTION trg_haftalik_ozet_tazele()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.created_at::date);
    RETURN OLD;
  END IF;

  PERFORM haftalik_ozet_hesapla(NEW.student_id, NEW.created_at::date);

  -- Tarih ya da öğrenci değiştiyse eski hafta da yeniden hesaplanmalı
  IF TG_OP = 'UPDATE' AND (
       OLD.student_id IS DISTINCT FROM NEW.student_id
    OR date_trunc('week', OLD.created_at) IS DISTINCT FROM date_trunc('week', NEW.created_at)
  ) THEN
    PERFORM haftalik_ozet_hesapla(OLD.student_id, OLD.created_at::date);
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.trg_haftalik_ozet_tazele() FROM PUBLIC, anon, authenticated;

-- AFTER: satır yazıldıktan SONRA hesaplansın. BEFORE olsaydı hesaplama
-- henüz yazılmamış satırı görmez ve özet bir adım geriden gelirdi.
DROP TRIGGER IF EXISTS test_ozet_tazele ON test_sessions;
CREATE TRIGGER test_ozet_tazele
  AFTER INSERT OR UPDATE OR DELETE ON test_sessions
  FOR EACH ROW EXECUTE FUNCTION trg_haftalik_ozet_tazele();


-- ============================================================
-- DOĞRULAMA
--
--   -- Bir testin haftasındaki soru sayısını not edin:
--   SELECT hafta, soru_toplam, test_sayisi FROM ogrenci_haftalik
--   WHERE student_id = '<ogrenci>' ORDER BY hafta DESC LIMIT 3;
--
--   -- Uygulamadan bir test ekleyin, aynı sorguyu tekrar çalıştırın:
--   -- soru_toplam ve test_sayisi ELLE YENİLEMEDEN artmış olmalı.
--
-- NOT: yalnızca test_sessions bağlandı. Görev, sınav ve ders
-- değişiklikleri hâlâ elle yenileme istiyor.
-- ============================================================
