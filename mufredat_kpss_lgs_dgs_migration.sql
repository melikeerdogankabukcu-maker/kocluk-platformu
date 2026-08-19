-- ============================================================
-- KPSS / LGS / DGS MÜFREDATLARI
--
-- Konular standart sınav müfredatlarına göre çıkarıldı. İçerik
-- doğruluğu size ait — sınavlar yıldan yıla değişiyor, gördüğünüz
-- eksik/fazlayı Konu Yönetimi ekranından düzeltebilirsiniz.
--
-- Hepsi admin hesabına bağlanıyor (ortak taban). Koçlar bu konuları
-- silemez, kendi konularını ekleyip yönetir.
--
-- TEKRAR ÇALIŞTIRILABİLİR: aynı (sınav, ders, konu) üçlüsü zaten
-- varsa atlanır. Böylece dosyayı düzenleyip yeniden çalıştırmak
-- kopya satır üretmez.
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
    RAISE EXCEPTION 'Admin hesabi bulunamadi — once admin_rolu_migration.sql calistirilmali';
  END IF;

  INSERT INTO public.exam_topics (exam_type, subject, topic, sira, aktif, sahip_id)
  SELECT v.exam_type, v.subject, v.topic, v.sira, true, v_admin
  FROM (VALUES

    -- ═══════════ LGS (8. sınıf) ═══════════
    ('LGS','Türkçe','Sözcükte Anlam',1),
    ('LGS','Türkçe','Cümlede Anlam',2),
    ('LGS','Türkçe','Paragrafta Anlam',3),
    ('LGS','Türkçe','Anlatım Biçimleri',4),
    ('LGS','Türkçe','Düşünceyi Geliştirme Yolları',5),
    ('LGS','Türkçe','Söz Sanatları',6),
    ('LGS','Türkçe','Fiilimsiler',7),
    ('LGS','Türkçe','Cümlenin Ögeleri',8),
    ('LGS','Türkçe','Fiilde Çatı',9),
    ('LGS','Türkçe','Cümle Türleri',10),
    ('LGS','Türkçe','Anlatım Bozuklukları',11),
    ('LGS','Türkçe','Yazım Kuralları',12),
    ('LGS','Türkçe','Noktalama İşaretleri',13),
    ('LGS','Türkçe','Metin Türleri',14),

    ('LGS','Matematik','Çarpanlar ve Katlar',1),
    ('LGS','Matematik','Üslü İfadeler',2),
    ('LGS','Matematik','Kareköklü İfadeler',3),
    ('LGS','Matematik','Veri Analizi',4),
    ('LGS','Matematik','Olasılık',5),
    ('LGS','Matematik','Cebirsel İfadeler ve Özdeşlikler',6),
    ('LGS','Matematik','Doğrusal Denklemler',7),
    ('LGS','Matematik','Eşitsizlikler',8),
    ('LGS','Matematik','Üçgenler',9),
    ('LGS','Matematik','Eşlik ve Benzerlik',10),
    ('LGS','Matematik','Dönüşüm Geometrisi',11),
    ('LGS','Matematik','Geometrik Cisimler',12),

    ('LGS','Fen Bilimleri','Mevsimler ve İklim',1),
    ('LGS','Fen Bilimleri','DNA ve Genetik Kod',2),
    ('LGS','Fen Bilimleri','Basınç',3),
    ('LGS','Fen Bilimleri','Madde ve Endüstri',4),
    ('LGS','Fen Bilimleri','Basit Makineler',5),
    ('LGS','Fen Bilimleri','Enerji Dönüşümleri ve Çevre Bilimi',6),
    ('LGS','Fen Bilimleri','Elektrik Yükleri ve Elektrik Enerjisi',7),

    ('LGS','İnkılap Tarihi','Bir Kahraman Doğuyor',1),
    ('LGS','İnkılap Tarihi','Millî Uyanış',2),
    ('LGS','İnkılap Tarihi','Millî Bir Destan: Ya İstiklal Ya Ölüm',3),
    ('LGS','İnkılap Tarihi','Atatürkçülük ve Çağdaşlaşan Türkiye',4),
    ('LGS','İnkılap Tarihi','Demokratikleşme Çabaları',5),
    ('LGS','İnkılap Tarihi','Atatürk Dönemi Dış Politika',6),
    ('LGS','İnkılap Tarihi','Atatürk''ün Ölümü ve Sonrası',7),

    ('LGS','Din Kültürü','Kader ve Kaza',1),
    ('LGS','Din Kültürü','Zekât ve Sadaka',2),
    ('LGS','Din Kültürü','Din ve Hayat',3),
    ('LGS','Din Kültürü','Hz. Muhammed''in Örnekliği',4),
    ('LGS','Din Kültürü','Kur''an-ı Kerim ve Özellikleri',5),

    ('LGS','İngilizce','Friendship',1),
    ('LGS','İngilizce','Teen Life',2),
    ('LGS','İngilizce','In the Kitchen',3),
    ('LGS','İngilizce','On the Phone',4),
    ('LGS','İngilizce','The Internet',5),
    ('LGS','İngilizce','Adventures',6),
    ('LGS','İngilizce','Tourism',7),
    ('LGS','İngilizce','Chores',8),
    ('LGS','İngilizce','Science',9),
    ('LGS','İngilizce','Natural Forces',10),

    -- ═══════════ DGS ═══════════
    ('DGS','Matematik','Sayılar',1),
    ('DGS','Matematik','Bölme ve Bölünebilme',2),
    ('DGS','Matematik','EBOB - EKOK',3),
    ('DGS','Matematik','Rasyonel Sayılar',4),
    ('DGS','Matematik','Basit Eşitsizlikler',5),
    ('DGS','Matematik','Mutlak Değer',6),
    ('DGS','Matematik','Üslü Sayılar',7),
    ('DGS','Matematik','Köklü Sayılar',8),
    ('DGS','Matematik','Çarpanlara Ayırma',9),
    ('DGS','Matematik','Oran - Orantı',10),
    ('DGS','Matematik','Denklem Çözme',11),
    ('DGS','Matematik','Sayı ve Kesir Problemleri',12),
    ('DGS','Matematik','Yaş Problemleri',13),
    ('DGS','Matematik','İşçi - Havuz Problemleri',14),
    ('DGS','Matematik','Hareket Problemleri',15),
    ('DGS','Matematik','Yüzde - Kâr - Zarar Problemleri',16),
    ('DGS','Matematik','Karışım Problemleri',17),
    ('DGS','Matematik','Kümeler',18),
    ('DGS','Matematik','Fonksiyonlar',19),
    ('DGS','Matematik','Permütasyon - Kombinasyon - Olasılık',20),
    ('DGS','Matematik','Veri - İstatistik',21),

    ('DGS','Geometri','Doğruda ve Üçgende Açılar',1),
    ('DGS','Geometri','Üçgende Alan ve Benzerlik',2),
    ('DGS','Geometri','Özel Üçgenler',3),
    ('DGS','Geometri','Dörtgenler ve Çokgenler',4),
    ('DGS','Geometri','Çember ve Daire',5),
    ('DGS','Geometri','Analitik Geometri',6),
    ('DGS','Geometri','Katı Cisimler',7),

    ('DGS','Türkçe','Sözcükte Anlam',1),
    ('DGS','Türkçe','Cümlede Anlam',2),
    ('DGS','Türkçe','Paragraf',3),
    ('DGS','Türkçe','Anlatım Biçimleri',4),
    ('DGS','Türkçe','Ses Bilgisi',5),
    ('DGS','Türkçe','Yapı Bilgisi',6),
    ('DGS','Türkçe','Sözcük Türleri',7),
    ('DGS','Türkçe','Cümlenin Ögeleri',8),
    ('DGS','Türkçe','Cümle Türleri',9),
    ('DGS','Türkçe','Anlatım Bozuklukları',10),
    ('DGS','Türkçe','Yazım Kuralları ve Noktalama',11),

    ('DGS','Mantık','Sayısal Mantık',1),
    ('DGS','Mantık','Sözel Mantık',2),
    ('DGS','Mantık','Tablo ve Grafik Yorumlama',3),

    -- ═══════════ KPSS — Genel Yetenek ═══════════
    ('KPSS','Türkçe','Sözcükte Anlam',1),
    ('KPSS','Türkçe','Cümlede Anlam',2),
    ('KPSS','Türkçe','Paragrafta Anlam',3),
    ('KPSS','Türkçe','Anlatım Biçimleri',4),
    ('KPSS','Türkçe','Ses Bilgisi',5),
    ('KPSS','Türkçe','Yapı Bilgisi',6),
    ('KPSS','Türkçe','Sözcük Türleri',7),
    ('KPSS','Türkçe','Cümlenin Ögeleri',8),
    ('KPSS','Türkçe','Cümle Türleri',9),
    ('KPSS','Türkçe','Anlatım Bozuklukları',10),
    ('KPSS','Türkçe','Yazım Kuralları',11),
    ('KPSS','Türkçe','Noktalama İşaretleri',12),

    ('KPSS','Matematik','Temel Kavramlar',1),
    ('KPSS','Matematik','Sayı Basamakları',2),
    ('KPSS','Matematik','Bölme ve Bölünebilme',3),
    ('KPSS','Matematik','EBOB - EKOK',4),
    ('KPSS','Matematik','Rasyonel Sayılar',5),
    ('KPSS','Matematik','Basit Eşitsizlikler',6),
    ('KPSS','Matematik','Mutlak Değer',7),
    ('KPSS','Matematik','Üslü ve Köklü Sayılar',8),
    ('KPSS','Matematik','Çarpanlara Ayırma',9),
    ('KPSS','Matematik','Oran - Orantı',10),
    ('KPSS','Matematik','Denklem Çözme',11),
    ('KPSS','Matematik','Problemler',12),
    ('KPSS','Matematik','Kümeler',13),
    ('KPSS','Matematik','Fonksiyonlar',14),
    ('KPSS','Matematik','Permütasyon - Kombinasyon - Olasılık',15),
    ('KPSS','Matematik','Sayısal Mantık',16),
    ('KPSS','Matematik','Tablo - Grafik Yorumlama',17),

    ('KPSS','Geometri','Açılar ve Üçgenler',1),
    ('KPSS','Geometri','Dörtgenler ve Çokgenler',2),
    ('KPSS','Geometri','Çember ve Daire',3),
    ('KPSS','Geometri','Analitik Geometri',4),
    ('KPSS','Geometri','Katı Cisimler',5),

    -- ═══════════ KPSS — Genel Kültür ═══════════
    ('KPSS','Tarih','İslamiyet Öncesi Türk Tarihi',1),
    ('KPSS','Tarih','İlk Türk İslam Devletleri',2),
    ('KPSS','Tarih','Osmanlı Kuruluş ve Yükselme',3),
    ('KPSS','Tarih','Osmanlı Duraklama ve Gerileme',4),
    ('KPSS','Tarih','Osmanlı Kültür ve Medeniyeti',5),
    ('KPSS','Tarih','XX. Yüzyıl Başlarında Osmanlı',6),
    ('KPSS','Tarih','Kurtuluş Savaşı Hazırlık Dönemi',7),
    ('KPSS','Tarih','Kurtuluş Savaşı Muharebeler',8),
    ('KPSS','Tarih','İnkılaplar',9),
    ('KPSS','Tarih','Atatürk İlkeleri',10),
    ('KPSS','Tarih','Atatürk Dönemi Dış Politika',11),
    ('KPSS','Tarih','Çağdaş Türk ve Dünya Tarihi',12),

    ('KPSS','Coğrafya','Türkiye''nin Coğrafi Konumu',1),
    ('KPSS','Coğrafya','Yer Şekilleri',2),
    ('KPSS','Coğrafya','İklim ve Bitki Örtüsü',3),
    ('KPSS','Coğrafya','Nüfus ve Yerleşme',4),
    ('KPSS','Coğrafya','Tarım ve Hayvancılık',5),
    ('KPSS','Coğrafya','Madenler ve Enerji Kaynakları',6),
    ('KPSS','Coğrafya','Sanayi',7),
    ('KPSS','Coğrafya','Ulaşım ve Ticaret',8),
    ('KPSS','Coğrafya','Turizm',9),
    ('KPSS','Coğrafya','Bölgeler',10),

    ('KPSS','Vatandaşlık','Hukukun Temel Kavramları',1),
    ('KPSS','Vatandaşlık','Anayasa Hukukuna Giriş',2),
    ('KPSS','Vatandaşlık','1982 Anayasası Temel İlkeler',3),
    ('KPSS','Vatandaşlık','Temel Hak ve Ödevler',4),
    ('KPSS','Vatandaşlık','Yasama',5),
    ('KPSS','Vatandaşlık','Yürütme',6),
    ('KPSS','Vatandaşlık','Yargı',7),
    ('KPSS','Vatandaşlık','İdare Hukuku',8),
    ('KPSS','Vatandaşlık','Güncel Bilgiler',9),

    -- ═══════════ KPSS — Eğitim Bilimleri ═══════════
    ('KPSS','Eğitim Bilimleri','Gelişim Psikolojisi',1),
    ('KPSS','Eğitim Bilimleri','Öğrenme Psikolojisi',2),
    ('KPSS','Eğitim Bilimleri','Rehberlik ve Özel Eğitim',3),
    ('KPSS','Eğitim Bilimleri','Program Geliştirme',4),
    ('KPSS','Eğitim Bilimleri','Öğretim Yöntem ve Teknikleri',5),
    ('KPSS','Eğitim Bilimleri','Ölçme ve Değerlendirme',6),
    ('KPSS','Eğitim Bilimleri','Sınıf Yönetimi',7),
    ('KPSS','Eğitim Bilimleri','Öğretim Teknolojileri ve Materyal Tasarımı',8)

  ) AS v(exam_type, subject, topic, sira)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_topics e
    WHERE e.exam_type = v.exam_type
      AND e.subject   = v.subject
      AND e.topic     = v.topic
  );

  GET DIAGNOSTICS v_eklenen = ROW_COUNT;
  RAISE NOTICE 'Eklenen konu sayisi: %', v_eklenen;
END $$;


-- ============================================================
-- DOĞRULAMA
--   SELECT exam_type, count(DISTINCT subject) AS ders, count(*) AS konu
--   FROM exam_topics GROUP BY exam_type ORDER BY exam_type;
--
--   Beklenen:  AYT 8/128 · DGS 4/42 · KPSS 7/73 · LGS 6/55 · TYT 10/185
--   (bu dosya 170 konu ekliyor: LGS 55, KPSS 73, DGS 42)
--
--   SELECT exam_type, subject, count(*) FROM exam_topics
--   WHERE exam_type IN ('KPSS','LGS','DGS')
--   GROUP BY 1,2 ORDER BY 1,2;
--
-- NOT: Bu konular arayüzde görünmesi için SONRAKİ ADIM gerekiyor —
-- sınav türü düğmeleri şu an kodda TYT/AYT olarak sabit (4 yerde).
-- Veri hazır, arayüz henüz değil.
-- ============================================================
