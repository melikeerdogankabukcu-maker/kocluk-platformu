-- ============================================================
-- Migration: Data API izinlerini AÇIK hale getir
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- Yalnız public şema, idempotent, mevcut davranışı DEĞİŞTİRMEZ.
-- ============================================================
--
-- ── NEDEN ───────────────────────────────────────────────────
-- Supabase 30 Ekim 2026'dan itibaren `public` şemasında YENİ açılan
-- tablolara Data API iznini kendiliğinden vermeyi bırakıyor. Var olan
-- tablolar etkilenmiyor — yani bugün çalışan hiçbir şey bozulmuyor.
--
-- Asıl risk ŞEMAYI YENİDEN KURMAKTA: yeni bir proje, önizleme dalı ya
-- da `supabase db reset`. O zaman migration dosyalarımızdaki tablolar
-- izinsiz oluşur ve uygulama "permission denied" alır. Depodaki 28
-- tablodan yalnız 6'sında açık GRANT vardı (son yazılanlar); 22'si
-- Supabase'in otomatik iznine güveniyordu.
--
-- Bu dosya o güveni açık izne çeviriyor. Bugün çalıştırmak bir şeyi
-- değiştirmiyor (zaten verilmiş izni yeniden vermek etkisiz), ama
-- bundan sonra şema her kurulduğunda doğru kuruluyor.
--
-- ── anon'a İZİN VERİLMİYOR (bilerek) ────────────────────────
-- Supabase'in örneğinde `anon` rolüne de select veriliyor. Burada
-- VERİLMİYOR: bu uygulamada girişsiz erişilen hiçbir tablo yok,
-- bütün politikalar `TO authenticated`. Yeniden kurulan bir şemada
-- anon'a izin vermek, bugün olmayan bir kapıyı açmak olurdu.
--
-- Not: satır güvenliğini GRANT sağlamıyor. GRANT "bu rol tabloya
-- erişebilir" der; hangi SATIRI göreceğini RLS politikaları söyler.
-- İkisi ayrı katman ve ikisi de gerekli.

DO $$
DECLARE
  t TEXT;
  -- Tablolar ELLE yazılı, `information_schema`dan toplanmıyor: amaç
  -- Supabase'in kaldırdığı "ne gelirse ona izin ver" davranışını
  -- taklit etmek değil, neye izin verdiğimizi bilerek söylemek.
  tablolar TEXT[] := ARRAY[
    -- Çekirdek (ilk kurulumda panelden açılmış, migration dosyası YOK)
    'users', 'student_profiles', 'teacher_students', 'family_links',
    'messages', 'notifications', 'audit_log',
    -- Görev, ödev, ders
    'homework_submissions', 'lessons',
    -- Sınav ve test
    'exam_results', 'exam_topics', 'test_sessions',
    -- Çalışma planı
    'calisma_planlari', 'calisma_bloklari',
    -- Programlar ve oyunlaştırma
    'study_programs', 'program_atamalari', 'badges', 'ogrenci_haftalik',
    -- Kitaplık ve dijital test
    'soru_bankalari', 'soru_bankasi_bolumleri', 'soru_bankasi_atamalari',
    'sorular', 'test_oturumlari', 'oturum_cevaplari',
    'cevap_anahtarlari', 'cevap_kagitlari',
    -- Gruplar, kurum, tercihler, öğretmen
    'ogrenci_gruplari', 'grup_ogrencileri', 'kurumlar',
    'kullanici_tercihleri', 'ogretmen_profilleri', 'ogretmen_konu_tercihi',
    'oneri_kararlari'
  ];
BEGIN
  FOREACH t IN ARRAY tablolar LOOP
    -- Tablo yoksa atla: bu dosya farklı yaşlardaki kurulumlarda da
    -- çalışabilmeli (bir migration henüz uygulanmamış olabilir).
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      RAISE NOTICE 'tablo yok, atlandi: %', t;
      CONTINUE;
    END IF;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    -- service_role: analiz servisi (kocluk-backend) PostgREST'e bu
    -- rolle bağlanıyor. İzni olmazsa yeniden kurulan şemada analiz
    -- sessizce boş döner.
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Dizilerden (serial/identity) üreten tablolar için: INSERT, dizinin
-- kendisine de izin ister. Hangi tablonun dizisi olduğunu tek tek
-- aramaktansa şema geneli veriliyor — dizi gizli bir bilgi taşımıyor.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- ------------------------------------------------------------
-- DENETİM: hâlâ izni olmayan tablo var mı?
-- ------------------------------------------------------------
-- Sonuç SATIR olarak dönüyor (SQL Editor NOTICE göstermiyor).
-- Boş dönerse her şey yolunda; satır dönerse o tablolar Data API'den
-- erişilemez durumda demektir.
SELECT t.tablename AS "izni_eksik_tablo",
       NOT has_table_privilege('authenticated', 'public.' || t.tablename, 'SELECT') AS "authenticated_yok",
       NOT has_table_privilege('service_role',  'public.' || t.tablename, 'SELECT') AS "service_role_yok",
       NOT c.relrowsecurity AS "rls_kapali"
  FROM pg_tables t
  JOIN pg_class c ON c.oid = ('public.' || quote_ident(t.tablename))::regclass
 WHERE t.schemaname = 'public'
   AND t.tablename NOT LIKE '\_%'
   AND (
     NOT has_table_privilege('authenticated', 'public.' || t.tablename, 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.' || t.tablename, 'SELECT')
     OR NOT c.relrowsecurity
   )
 ORDER BY t.tablename;
