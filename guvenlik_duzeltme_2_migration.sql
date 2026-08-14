-- ============================================================
-- YAYIN ÖNCESİ GÜVENLİK DÜZELTMESİ — 2
--
-- İlk düzeltme (guvenlik_duzeltme_migration.sql) progress tablosunu kapattı.
-- Ardından yapılan tam denetimde iki açık daha çıktı. İkisinin de ortak
-- özelliği şu: RLS tabloların üzerinde doğru kurulmuş, ama RLS'i ATLAYAN
-- yollar açık kalmış.
--
-- ── BULGU 1: konu_gozlem görünümü ──────────────────────────────
-- Görünümler varsayılan olarak SAHİBİNİN yetkisiyle çalışır. exam_results
-- kilitli olmasına rağmen üzerine kurulu bu görünüm anon anahtarla
-- okunabiliyordu (38 satır).
--
-- Kolonlar kişi içermiyor (subject, topic, gozlem, sinav_sayisi) ama yine de
-- kapatılmalı: sistemde şu an tek öğrenci var, dolayısıyla "toplam" dediğimiz
-- satırlar pratikte o öğrencinin hangi konuları yanlış yaptığının listesi.
-- Ayrıca görünüme ileride bir kolon eklendiğinde sızıntı sessizce büyür.
--
-- ── BULGU 2: SECURITY DEFINER fonksiyonları anon'a açık ────────
-- KÖK NEDEN: PostgreSQL yeni bir fonksiyona EXECUTE yetkisini otomatik
-- olarak PUBLIC'e verir. Migration'larda "GRANT EXECUTE ... TO authenticated"
-- yazılmış, ama PUBLIC'in hazırdan gelen yetkisi hiç geri alınmamış. Bu
-- yüzden anon anahtarla şunlar yapılabiliyordu:
--
--   ogrenci_puan(uuid)     -> herhangi bir öğrencinin XP kırılımı okunuyor
--   kisi_adi(uuid)         -> herhangi bir kullanıcının adı okunuyor
--   rozet_ver(...)         -> UYDURMA ROZET YAZILABİLİYOR
--   bildirim_ekle(...)     -> SAHTE BİLDİRİM YAZILABİLİYOR (oltalama yolu)
--   rozetleri_guncelle(..) -> başkasının rozet hesabı tetiklenebiliyor
--
-- rozet_ver ve bildirim_ekle testte gerçekten satır yazdı; test satırları
-- silindi. Bunlar SECURITY DEFINER olduğu için RLS onları durdurmuyor.
--
-- ── NEDEN authenticated'dan da almak GÜVENLİ ──────────────────
-- rozet_ver, bildirim_ekle ve kisi_adi'yı istemci hiç çağırmıyor; yalnızca
-- tetikleyiciler çağırıyor (trg_bildirim_gorev, trg_rozet_tazele...). O
-- tetikleyicilerin kendisi de SECURITY DEFINER, yani iç çağrı tanımlayıcının
-- yetkisiyle yapılıyor — istemci rolünün EXECUTE yetkisine bakılmıyor.
-- Dolayısıyla yetkiyi almak bildirimleri ve rozetleri BOZMAZ.
--
-- Frontend'in RPC ile çağırdığı tek iki fonksiyon: ogrenci_puan ve
-- konu_yeniden_adlandir. İkisi de authenticated'da kalıyor.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================


-- ============================================================
-- 1) konu_gozlem görünümü
-- ============================================================

-- Görünüm çağıranın yetkisiyle çalışsın (PostgreSQL 15+), böylece
-- exam_results üzerindeki RLS görünüme de uygulanır.
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW public.konu_gozlem SET (security_invoker = on)';
    RAISE NOTICE 'konu_gozlem: security_invoker acildi';
  ELSE
    RAISE NOTICE 'konu_gozlem: PG15 oncesi, security_invoker atlandi (REVOKE yeterli)';
  END IF;
END $$;

-- Derinlemesine savunma: istemci rolleri görünüme hiç erişemesin.
-- Görünümü yalnızca Python analiz servisi okuyor (app/main.py), o da
-- service_role anahtarıyla — service_role bu kısıtlardan etkilenmez.
REVOKE ALL ON public.konu_gozlem FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2) Fonksiyon yetkileri — PUBLIC'in hazırdan gelen EXECUTE'u alınıyor
-- ============================================================

-- --- İstemcinin hiç çağırmadığı, yalnızca tetikleyicilerin kullandığı üçlü ---
REVOKE ALL ON FUNCTION public.rozet_ver(UUID, TEXT, TEXT)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bildirim_ekle(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.kisi_adi(UUID)                       FROM PUBLIC, anon, authenticated;

-- --- Frontend'in çağırdığı ikili: anon'dan al, authenticated'a geri ver ---
REVOKE ALL ON FUNCTION public.ogrenci_puan(UUID)                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ogrenci_puan(UUID)                TO authenticated;

REVOKE ALL ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.konu_yeniden_adlandir(TEXT, TEXT, TEXT) TO authenticated;

-- --- Tetikleyiciden çağrılıyor; istemci çağırmıyor ama zararsız (veriden
--     türetilen rozetleri yeniden hesaplar, uydurma rozet veremez) ---
REVOKE ALL ON FUNCTION public.rozetleri_guncelle(UUID)             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rozetleri_guncelle(UUID)          TO authenticated;

-- ogrencim_mi ve grubum_mu BİLEREK dokunulmadı: bunlar RLS politikalarının
-- içinden çağrılıyor. Sorguyu yapan rolün EXECUTE yetkisi olmazsa politika
-- değerlendirilemez ve sorgu "boş sonuç" yerine HATA döner. Sızıntı yolu da
-- değiller; auth.uid()'e bakıp boolean dönüyorlar, anon'a zaten false diyorlar.


-- ============================================================
-- 3) ogrenci_puan'a yetki denetimi ekleniyor
--
-- Yetkiyi anon'dan almak yetmiyor: fonksiyon SECURITY DEFINER ve içeride
-- hiçbir kontrol yoktu, yani GİRİŞ YAPMIŞ herhangi bir kullanıcı başka
-- herhangi bir öğrencinin XP kırılımını okuyabiliyordu. Gövde aynen
-- korunuyor, başına üç satırlık izin kontrolü ekleniyor.
-- ============================================================

CREATE OR REPLACE FUNCTION ogrenci_puan(p_user UUID)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gorev INT; v_test INT; v_odev INT; v_sinav INT;
  v_ders INT; v_adim INT; v_rozet INT; v_artis INT := 0;
  r RECORD; v_son NUMERIC; v_onceki NUMERIC;
  v_xp INT;
BEGIN
  -- YENİ: yalnızca öğrencinin kendisi, öğretmeni ya da velisi görebilir
  IF NOT (
       p_user = auth.uid()
    OR ogrencim_mi(p_user)
    OR EXISTS (SELECT 1 FROM family_links
               WHERE parent_id = auth.uid() AND student_id = p_user)
  ) THEN
    RAISE EXCEPTION 'Bu ogrencinin puanini goruntuleme yetkiniz yok';
  END IF;

  SELECT count(*) INTO v_gorev FROM tasks         WHERE student_id = p_user AND is_done;
  SELECT count(*) INTO v_test  FROM test_sessions WHERE student_id = p_user;
  SELECT count(*) INTO v_sinav FROM exam_results  WHERE student_id = p_user;
  SELECT count(*) INTO v_odev  FROM homework_submissions
    WHERE student_id = p_user AND status = 'onaylandi';
  SELECT count(*) INTO v_ders  FROM lessons
    WHERE student_id = p_user AND completed;
  SELECT count(*) INTO v_rozet FROM badges        WHERE user_id = p_user;
  SELECT COALESCE(sum(jsonb_array_length(tamamlananlar)), 0) INTO v_adim
    FROM program_atamalari WHERE student_id = p_user;

  -- Net artışı olan her sınav türü için bonus
  FOR r IN SELECT exam_type FROM exam_results
           WHERE student_id = p_user AND total_net IS NOT NULL
           GROUP BY exam_type HAVING count(*) >= 2 LOOP
    SELECT total_net INTO v_son FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC LIMIT 1;
    SELECT total_net INTO v_onceki FROM exam_results
      WHERE student_id = p_user AND exam_type = r.exam_type AND total_net IS NOT NULL
      ORDER BY exam_date DESC, created_at DESC OFFSET 1 LIMIT 1;
    IF COALESCE(v_son,0) > COALESCE(v_onceki,0) THEN v_artis := v_artis + 1; END IF;
  END LOOP;

  v_xp := v_gorev * 10 + v_test * 5 + v_odev * 15 + v_sinav * 20
        + v_ders * 10 + v_adim * 8 + v_rozet * 25 + v_artis * 30;

  RETURN jsonb_build_object(
    'xp', v_xp,
    'kirilim', jsonb_build_object(
      'gorev', v_gorev, 'test', v_test, 'odev', v_odev, 'sinav', v_sinav,
      'ders', v_ders, 'program_adimi', v_adim, 'rozet', v_rozet, 'net_artisi', v_artis
    )
  );
END; $$;

REVOKE ALL ON FUNCTION public.ogrenci_puan(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ogrenci_puan(UUID) TO authenticated;


-- ============================================================
-- DOĞRULAMA — çalıştırdıktan sonra anon anahtarla:
--   GET  /rest/v1/konu_gozlem            -> boş liste
--   POST /rest/v1/rpc/ogrenci_puan       -> 401/403/404
--   POST /rest/v1/rpc/rozet_ver          -> 401/403/404, badges'e satır YAZMAMALI
--   POST /rest/v1/rpc/bildirim_ekle      -> 401/403/404, notifications'a YAZMAMALI
-- Uygulamada bozulmaması gerekenler: öğrenci/veli seviye kartı, öğretmenin
-- konu yeniden adlandırma işlemi, bildirim zili, rozet kazanma.
-- ============================================================
