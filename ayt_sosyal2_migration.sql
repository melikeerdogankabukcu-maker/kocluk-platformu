-- ============================================================
-- AYT SOSYAL BİLİMLER-2 TESTİ — eksik dersler
--
-- AYT dört testten oluşuyor ama müfredatta üçü vardı:
--   1) Matematik (40)          Matematik + Geometri        ✓ vardı
--   2) Fen Bilimleri (40)      Fizik, Kimya, Biyoloji      ✓ vardı
--   3) Edebiyat–Sosyal-1 (40)  Edebiyat, Tarih, Coğrafya   ✓ vardı
--   4) Sosyal Bilimler-2 (40)  Tarih-2, Coğrafya-2,        ✗ YOKTU
--                              Felsefe Grubu, Din Kültürü
--
-- Dördüncü test SÖZEL alanın belkemiği; olmadığı için sözel öğrenci
-- AYT sonucunu tam giremiyor ve ÖSYM SÖZ puanı hesaplanamıyordu.
--
-- ── ADLANDIRMA ──────────────────────────────────────────────────
-- Mevcut AYT "Tarih" ve "Coğrafya" dersleri 3. testteki Tarih-1 ve
-- Coğrafya-1'dir. YENİDEN ADLANDIRILMADILAR: görevler, testler ve sınav
-- kayıtları bu adlarla yazılmış durumda, değiştirmek geçmiş veriyi
-- kopartırdı. Yeni dersler "Tarih-2" ve "Coğrafya-2" olarak ekleniyor.
--
-- İçerik doğruluğu size ait; Konu Yönetimi'nden düzeltilebilir.
-- TEKRAR ÇALIŞTIRILABİLİR: aynı üçlü varsa atlanır.
--
-- Supabase Dashboard > SQL Editor > yapıştır > Run
-- ============================================================

DO $$
DECLARE
  v_admin UUID;
  v_eklenen INT;
BEGIN
  SELECT id INTO v_admin FROM public.users WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'Admin hesabi bulunamadi';
  END IF;

  INSERT INTO public.exam_topics (exam_type, subject, topic, sira, aktif, sahip_id)
  SELECT v.exam_type, v.subject, v.topic, v.sira, true, v_admin
  FROM (VALUES

    -- ═══════ AYT · Tarih-2 (11 soru) ═══════
    ('AYT','Tarih-2','İlk Türk Devletleri',1),
    ('AYT','Tarih-2','İslam Tarihi ve Uygarlığı',2),
    ('AYT','Tarih-2','Türk-İslam Devletleri',3),
    ('AYT','Tarih-2','Anadolu Selçuklu Devleti',4),
    ('AYT','Tarih-2','Beylikten Devlete Osmanlı',5),
    ('AYT','Tarih-2','Dünya Gücü Osmanlı',6),
    ('AYT','Tarih-2','Arayış Yılları',7),
    ('AYT','Tarih-2','En Uzun Yüzyıl',8),
    ('AYT','Tarih-2','XX. Yüzyıl Başlarında Osmanlı',9),
    ('AYT','Tarih-2','Millî Mücadele',10),
    ('AYT','Tarih-2','Atatürkçülük ve İnkılaplar',11),
    ('AYT','Tarih-2','İki Savaş Arası Dönem',12),
    ('AYT','Tarih-2','II. Dünya Savaşı',13),
    ('AYT','Tarih-2','Soğuk Savaş Dönemi',14),
    ('AYT','Tarih-2','Küreselleşen Dünya',15),

    -- ═══════ AYT · Coğrafya-2 (11 soru) ═══════
    ('AYT','Coğrafya-2','Ekosistem ve Madde Döngüsü',1),
    ('AYT','Coğrafya-2','Nüfus Politikaları',2),
    ('AYT','Coğrafya-2','Şehirleşme ve Göç',3),
    ('AYT','Coğrafya-2','Ekonomik Faaliyet Türleri',4),
    ('AYT','Coğrafya-2','Doğal Kaynaklar ve Enerji',5),
    ('AYT','Coğrafya-2','Türkiye Ekonomisi',6),
    ('AYT','Coğrafya-2','Bölgesel Kalkınma Projeleri',7),
    ('AYT','Coğrafya-2','Ulaşım Ağları ve Ticaret',8),
    ('AYT','Coğrafya-2','Çevre Sorunları ve Yönetimi',9),
    ('AYT','Coğrafya-2','Küresel Ortam: Bölgeler ve Ülkeler',10),
    ('AYT','Coğrafya-2','Doğal Afetler',11),

    -- ═══════ AYT · Felsefe Grubu (12 soru) ═══════
    -- Felsefe + Psikoloji + Sosyoloji + Mantık tek test altında
    ('AYT','Felsefe Grubu','Felsefenin Konusu ve Alanları',1),
    ('AYT','Felsefe Grubu','Bilgi Felsefesi',2),
    ('AYT','Felsefe Grubu','Varlık Felsefesi',3),
    ('AYT','Felsefe Grubu','Ahlak Felsefesi',4),
    ('AYT','Felsefe Grubu','Sanat Felsefesi',5),
    ('AYT','Felsefe Grubu','Din Felsefesi',6),
    ('AYT','Felsefe Grubu','Siyaset Felsefesi',7),
    ('AYT','Felsefe Grubu','Bilim Felsefesi',8),
    ('AYT','Felsefe Grubu','Psikolojiye Giriş',9),
    ('AYT','Felsefe Grubu','Öğrenme, Bellek ve Güdü',10),
    ('AYT','Felsefe Grubu','Kişilik ve Ruh Sağlığı',11),
    ('AYT','Felsefe Grubu','Sosyolojiye Giriş',12),
    ('AYT','Felsefe Grubu','Toplumsal Yapı ve Değişme',13),
    ('AYT','Felsefe Grubu','Toplumsal Kurumlar',14),
    ('AYT','Felsefe Grubu','Mantığa Giriş',15),
    ('AYT','Felsefe Grubu','Klasik Mantık',16),
    ('AYT','Felsefe Grubu','Sembolik Mantık',17),

    -- ═══════ AYT · Din Kültürü (6 soru) ═══════
    ('AYT','Din Kültürü','İnsan ve Din',1),
    ('AYT','Din Kültürü','Ahlak ve Değerler',2),
    ('AYT','Din Kültürü','İslam Düşüncesinde Yorumlar',3),
    ('AYT','Din Kültürü','Din, Kültür ve Medeniyet',4),
    ('AYT','Din Kültürü','Din ve Bilim',5),
    ('AYT','Din Kültürü','Kur''an''dan Mesajlar',6),
    ('AYT','Din Kültürü','Hz. Muhammed ve Gençlik',7),
    ('AYT','Din Kültürü','İslam ve Sanat',8),
    ('AYT','Din Kültürü','Yaşayan Dinler',9)

  ) AS v(exam_type, subject, topic, sira)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_topics e
    WHERE e.exam_type = v.exam_type AND e.subject = v.subject AND e.topic = v.topic
  );

  GET DIAGNOSTICS v_eklenen = ROW_COUNT;
  RAISE NOTICE 'Eklenen konu sayisi: %', v_eklenen;
END $$;


-- ============================================================
-- DOĞRULAMA
--   SELECT subject, count(*) FROM exam_topics
--   WHERE exam_type = 'AYT' GROUP BY subject ORDER BY subject;
--
--   Beklenen 12 ders: Biyoloji, Coğrafya, Coğrafya-2, Din Kültürü,
--   Edebiyat, Felsefe Grubu, Fizik, Geometri, Kimya, Matematik,
--   Tarih, Tarih-2  (bu dosya 52 konu ekliyor)
-- ============================================================
