import { useState } from "react";

const programs = {
  yogun: {
    id: "yogun",
    title: "⚡ Yoğun Atılım",
    subtitle: "4 Haftalık Sprint Programı",
    description: "Sınava az zamanı olan veya hızlı net artırmak isteyen öğrenciler için. Sadece ÖSYM'nin en çok sorduğu konulara odaklanır.",
    color: "#e63946",
    accent: "#ff6b6b",
    bg: "#1a0a0a",
    card: "#2a0f0f",
    weeks: [
      {
        week: 1,
        title: "FİZİK TEMELİ",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "FİZİK", konu: "Hareket ve Kuvvet", sure: "2 sa", oncelik: "🔴", aciklama: "Newton yasaları, net kuvvet, sürtünme – Her yıl çıkıyor" },
            { ders: "FİZİK", konu: "Optik (Kırılma & Yansıma)", sure: "2 sa", oncelik: "🔴", aciklama: "Görünen konum, mercekler – 5 yılda 5 soru" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "KİMYA", konu: "Kimyasal Türler Arası Etkileşim", sure: "2 sa", oncelik: "🔴", aciklama: "TYT'de hiç atlanmamış konu" },
            { ders: "KİMYA", konu: "Atom ve Periyodik Sistem", sure: "2 sa", oncelik: "🔴", aciklama: "Periyodik özellikler, izotoplar" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "BİYOLOJİ", konu: "Hücre ve Organeller", sure: "2 sa", oncelik: "🔴", aciklama: "TYT'de temel, AYT'de detay sorular" },
            { ders: "BİYOLOJİ", konu: "Mitoz & Mayoz", sure: "2 sa", oncelik: "🔴", aciklama: "Her yıl en az 1 soru" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "FİZİK", konu: "Isı, Sıcaklık ve Genleşme", sure: "2 sa", oncelik: "🔴", aciklama: "Öz ısı, ısı sığası, hal değişimi" },
            { ders: "FİZİK", konu: "Elektrostatik", sure: "2 sa", oncelik: "🔴", aciklama: "Yüklenme, elektron alışverişi" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "KİMYA", konu: "Maddenin Halleri", sure: "2 sa", oncelik: "🔴", aciklama: "Hiç atlanmamış – Buhar basıncı, hal değişimi grafikleri" },
            { ders: "KİMYA", konu: "Karışımlar & Çözeltiler", sure: "2 sa", oncelik: "🔴", aciklama: "Molarite, derişim hesapları" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "📝 DENEME", konu: "TYT Fen Mini Deneme (20 soru)", sure: "25 dk", oncelik: "⚪", aciklama: "Haftalık performans ölçümü" },
            { ders: "🔁 TEKİ", konu: "Hatalı soruları tekrar çöz", sure: "1 sa", oncelik: "⚪", aciklama: "Yanlış konuları not al" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "BİYOLOJİ", konu: "Sindirim & Boşaltım Sistemleri", sure: "2 sa", oncelik: "🟠", aciklama: "İnsan fizyolojisi – AYT'de ağırlıklı alan" },
            { ders: "🔁 TEKİ", konu: "Hafta tekrarı – Formüller", sure: "1 sa", oncelik: "⚪", aciklama: "Tüm formülleri gözden geçir" },
          ]},
        ],
      },
      {
        week: 2,
        title: "KİMYA & BİYOLOJİ ATILIMI",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "KİMYA", konu: "Asit–Baz Dengesi (AYT)", sure: "3 sa", oncelik: "🔴", aciklama: "pH, pOH, tampon çözelti – 5 yılda 5 soru" },
            { ders: "KİMYA", konu: "Kimyasal Denge & Le Chatelier", sure: "2 sa", oncelik: "🔴", aciklama: "En çok soru gelen konu" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "BİYOLOJİ", konu: "Genetik (Kalıtım ve DNA)", sure: "3 sa", oncelik: "🔴", aciklama: "Her yıl 2-3 soru – AYT'de kritik" },
            { ders: "BİYOLOJİ", konu: "Protein Sentezi", sure: "2 sa", oncelik: "🔴", aciklama: "DNA→RNA→Protein" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "FİZİK", konu: "Mekanik – Atışlar (AYT)", sure: "2 sa", oncelik: "🔴", aciklama: "Eğik atış, yatay atış" },
            { ders: "FİZİK", konu: "Elektrik Alan ve Potansiyel", sure: "2 sa", oncelik: "🔴", aciklama: "Eşpotansiyel yüzeyler, iş hesabı" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "KİMYA", konu: "Organik Kimya (Fonksiyonel Gruplar)", sure: "3 sa", oncelik: "🔴", aciklama: "4-5 soru – AYT'de en ağırlıklı konu" },
            { ders: "KİMYA", konu: "Elektrokimya (Pil & Elektroliz)", sure: "2 sa", oncelik: "🔴", aciklama: "Her yıl 2-3 soru" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "BİYOLOJİ", konu: "Dolaşım ve Solunum Sistemi", sure: "2 sa", oncelik: "🟠", aciklama: "İnsan fizyolojisi grubu" },
            { ders: "BİYOLOJİ", konu: "Fotosentez & Solunum", sure: "2 sa", oncelik: "🔴", aciklama: "Enerji dönüşümleri – her yıl çıkıyor" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "📝 DENEME", konu: "AYT Fen Denemesi (40 soru)", sure: "50 dk", oncelik: "⚪", aciklama: "Tam test deneyimi" },
            { ders: "🔁 TEKİ", konu: "Deneme analizi", sure: "1 sa", oncelik: "⚪", aciklama: "Konu bazlı hata tablosu çıkar" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "FİZİK", konu: "Modern Fizik (Fotoelektrik)", sure: "2 sa", oncelik: "🟠", aciklama: "Son yıllarda artan trend" },
            { ders: "🔁 TEKİ", konu: "2. hafta genel tekrar", sure: "1.5 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 3,
        title: "İLERİ KONU & PEKIŞTIRME",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "FİZİK", konu: "Basit Harmonik Hareket", sure: "2 sa", oncelik: "🟠", aciklama: "Her yıl 1 soru" },
            { ders: "FİZİK", konu: "Manyetik Alan & İndüksiyon", sure: "2 sa", oncelik: "🟠", aciklama: "Lorentz kuvveti, solenoid" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "KİMYA", konu: "Gazlar (Gaz Yasaları)", sure: "2 sa", oncelik: "🟠", aciklama: "İdeal gaz, hacim-basınç-sıcaklık" },
            { ders: "KİMYA", konu: "Kimyasal Kinetik (Tepkime Hızı)", sure: "2 sa", oncelik: "🟠", aciklama: "Aktivasyon enerjisi, hız sabiti" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "BİYOLOJİ", konu: "Ekoloji & Çevre", sure: "2 sa", oncelik: "🟠", aciklama: "Popülasyon, enerji akışı" },
            { ders: "BİYOLOJİ", konu: "Evrim Teorisi", sure: "1.5 sa", oncelik: "🟡", aciklama: "Kavramsal sorular" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "FİZİK", konu: "Düzgün Çembersel Hareket", sure: "2 sa", oncelik: "🟠", aciklama: "Yörünge hızı, Kepler" },
            { ders: "FİZİK", konu: "Dalgalar & Optik (AYT)", sure: "2 sa", oncelik: "🟠", aciklama: "Tek yarık kırınım, EM spektrum" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "KİMYA", konu: "Sıvı Çözeltiler & Koligatif", sure: "2 sa", oncelik: "🟠", aciklama: "Kaynama noktası yükselmesi, donma noktası" },
            { ders: "BİYOLOJİ", konu: "Sinir Sistemi & Duyu Organları", sure: "2 sa", oncelik: "🟠", aciklama: "İmpuls iletimi" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "📝 DENEME", konu: "Karma Fen Denemesi", sure: "50 dk", oncelik: "⚪", aciklama: "Tüm dersleri tek seferde test et" },
            { ders: "🔁 TEKİ", konu: "Deneme analizi + zayıf konu tekrarı", sure: "1.5 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "🔁 TEKİ", konu: "1-3. hafta yoğun tekrar", sure: "3 sa", oncelik: "⚪", aciklama: "Tüm 🔴 konuları tekrar tara" },
          ]},
        ],
      },
      {
        week: 4,
        title: "DENEME & FİNAL",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "📝 DENEME", konu: "TYT Tam Deneme", sure: "135 dk", oncelik: "⚪", aciklama: "Gerçek sınav koşullarında" },
            { ders: "🔁 TEKİ", konu: "Fizik hataları analizi", sure: "1 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "🔁 TEKİ", konu: "Kimya yoğun tekrar (Denge + Organik)", sure: "3 sa", oncelik: "🔴", aciklama: "Son tekrar" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "📝 DENEME", konu: "AYT Tam Deneme", sure: "180 dk", oncelik: "⚪", aciklama: "Gerçek sınav koşullarında" },
            { ders: "🔁 TEKİ", konu: "Biyoloji hataları analizi", sure: "1 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "🔁 TEKİ", konu: "Biyoloji – Genetik final tekrarı", sure: "2 sa", oncelik: "🔴", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "Fizik – Mekanik + E&M formüller", sure: "2 sa", oncelik: "🔴", aciklama: "" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "🔁 TEKİ", konu: "Tüm ders formül özeti", sure: "2 sa", oncelik: "⚪", aciklama: "Fizik + Kimya + Biyoloji özet" },
            { ders: "🔁 TEKİ", konu: "Çıkmış sorular hızlı tarama", sure: "2 sa", oncelik: "⚪", aciklama: "ÖSYM 2021-2025 soruları" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "🔁 TEKİ", konu: "Hafif tekrar + dinlenme", sure: "2 sa", oncelik: "⚪", aciklama: "Strese girme, bildiklerini güven" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "😴 DİNLENME", konu: "Sınav öncesi tam dinlenme günü", sure: "—", oncelik: "⚪", aciklama: "Zihinsel hazırlık" },
          ]},
        ],
      },
    ],
  },
  dengeli: {
    id: "dengeli",
    title: "🌊 Dengeli Derinlik",
    subtitle: "8 Haftalık Tam Kapsam Programı",
    description: "Her konuya yeterli süre ayırmak isteyen, sağlam temel oluşturmak isteyen öğrenciler için. Konu bağlantısını öne çıkarır.",
    color: "#2d6a4f",
    accent: "#52b788",
    bg: "#0a1a12",
    card: "#0f2418",
    weeks: [
      {
        week: 1,
        title: "FİZİK TEMELİ (TYT)",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "FİZİK", konu: "Hareket – Kinematik (GLBB, Serbest Düşme)", sure: "2.5 sa", oncelik: "🔴", aciklama: "TYT + AYT temel taşı" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "FİZİK", konu: "Newton Yasaları & Net Kuvvet", sure: "2.5 sa", oncelik: "🔴", aciklama: "5 yıl boyunca çıktı" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "FİZİK", konu: "İş, Güç, Enerji & Verim", sure: "2 sa", oncelik: "🟠", aciklama: "" },
            { ders: "FİZİK", konu: "Problem çözme (20 soru)", sure: "1 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "FİZİK", konu: "Isı, Sıcaklık & Genleşme", sure: "2.5 sa", oncelik: "🔴", aciklama: "Öz ısı–ısı sığası ayrımı kritik" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "FİZİK", konu: "Basınç & Kaldırma Kuvveti", sure: "2.5 sa", oncelik: "🔴", aciklama: "Arşimet ilkesi" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "FİZİK", konu: "Dalgalar (Genlik–Periyot–Frekans)", sure: "2 sa", oncelik: "🟠", aciklama: "" },
            { ders: "FİZİK", konu: "Optik – Yansıma & Kırılma", sure: "2 sa", oncelik: "🔴", aciklama: "Her yıl çıkıyor" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "📝 DENEME", konu: "TYT Fizik Mini Test (7 soru)", sure: "15 dk", oncelik: "⚪", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "1. hafta tekrar + eksik konu tamamla", sure: "2 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 2,
        title: "KİMYA TEMELİ (TYT)",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "KİMYA", konu: "Atom Yapısı & Periyodik Tablo", sure: "2.5 sa", oncelik: "🔴", aciklama: "Proton, nötron, elektron; periyodik eğilimler" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "KİMYA", konu: "Kimyasal Türler Arası Etkileşim", sure: "2.5 sa", oncelik: "🔴", aciklama: "Lewis yapısı, H-bağı, Van der Waals" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "KİMYA", konu: "Maddenin Halleri & Hal Değişimi Grafikleri", sure: "2.5 sa", oncelik: "🔴", aciklama: "Hiç atlanmamış konu" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "KİMYA", konu: "Mol Kavramı & Kimyasal Hesaplamalar", sure: "3 sa", oncelik: "🔴", aciklama: "Stokiyometri, verim hesabı" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "KİMYA", konu: "Karışımlar & Çözünürlük", sure: "2.5 sa", oncelik: "🔴", aciklama: "Molarite, seyreltme, ayırma yöntemleri" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "KİMYA", konu: "Asit–Baz–Tuz (TYT düzeyi)", sure: "2 sa", oncelik: "🟠", aciklama: "Güçlü–zayıf ayrımı, nötrleşme" },
            { ders: "KİMYA", konu: "Problem çözme (20 soru)", sure: "1 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "📝 DENEME", konu: "TYT Kimya Mini Test (7 soru)", sure: "15 dk", oncelik: "⚪", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "2. hafta tekrar", sure: "2 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 3,
        title: "BİYOLOJİ TEMELİ (TYT)",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "BİYOLOJİ", konu: "Hücre Yapısı & Organeller", sure: "2.5 sa", oncelik: "🔴", aciklama: "Prokaryot–ökaryot, organel görevleri" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "BİYOLOJİ", konu: "Mitoz Bölünme", sure: "2.5 sa", oncelik: "🔴", aciklama: "Evreler, DNA miktarı değişimi" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "BİYOLOJİ", konu: "Mayoz Bölünme & Üreme", sure: "2.5 sa", oncelik: "🔴", aciklama: "Gamet oluşumu, genetik çeşitlilik" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "BİYOLOJİ", konu: "Canlıların Sınıflandırılması", sure: "2 sa", oncelik: "🟠", aciklama: "" },
            { ders: "BİYOLOJİ", konu: "Biyolojik Çeşitlilik", sure: "1.5 sa", oncelik: "🟡", aciklama: "" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "BİYOLOJİ", konu: "Bitki Biyolojisi (Yapı & Fonksiyon)", sure: "2 sa", oncelik: "🟠", aciklama: "" },
            { ders: "BİYOLOJİ", konu: "Problem çözme (15 soru)", sure: "1 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "📝 DENEME", konu: "TYT Fen Bilimleri Tam Testi (20 soru)", sure: "25 dk", oncelik: "⚪", aciklama: "Fizik + Kimya + Biyoloji birlikte" },
            { ders: "🔁 TEKİ", konu: "Deneme analizi", sure: "1.5 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "🔁 TEKİ", konu: "1-3. haftalar kapsamlı tekrar", sure: "3 sa", oncelik: "⚪", aciklama: "Zayıf konulara odaklan" },
          ]},
        ],
      },
      {
        week: 4,
        title: "AYT FİZİK – MEKANİK",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "FİZİK", konu: "Atışlar (Eğik & Yatay)", sure: "3 sa", oncelik: "🔴", aciklama: "2025'te çıktı – referans sistemi kritik" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "FİZİK", konu: "Momentum & İtme–Tepki", sure: "2.5 sa", oncelik: "🟠", aciklama: "Çarpışma türleri" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "FİZİK", konu: "Enerji (Yay, Elastik Potansiyel)", sure: "2.5 sa", oncelik: "🔴", aciklama: "Enerji dönüşümleri – 2025'te çıktı" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "FİZİK", konu: "Düzgün Çembersel Hareket", sure: "2.5 sa", oncelik: "🟠", aciklama: "Her yıl 1 soru" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "FİZİK", konu: "Basit Harmonik Hareket", sure: "2.5 sa", oncelik: "🟠", aciklama: "Sarkaç, yay sistemi" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "FİZİK", konu: "Çembersel + Yörünge Hareketi", sure: "2 sa", oncelik: "🟠", aciklama: "Kepler yorumlama" },
            { ders: "📝 DENEME", konu: "AYT Fizik Mini Test (14 soru)", sure: "20 dk", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "🔁 TEKİ", konu: "Mekanik genel tekrar", sure: "3 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 5,
        title: "AYT FİZİK – E&M & MODERN",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "FİZİK", konu: "Elektrik Alan & Potansiyel", sure: "3 sa", oncelik: "🔴", aciklama: "Eşpotansiyel yüzeyler, iş hesabı – 5 yıl soru" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "FİZİK", konu: "Manyetik Alan & Lorentz Kuvveti", sure: "2.5 sa", oncelik: "🔴", aciklama: "Yüklü parçacık hareketi" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "FİZİK", konu: "Elektromanyetik İndüksiyon", sure: "2.5 sa", oncelik: "🟠", aciklama: "Faraday yasası" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "FİZİK", konu: "Alternatif Akım (RLC)", sure: "2.5 sa", oncelik: "🟠", aciklama: "Ampul parlaklığı soruları" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "FİZİK", konu: "Modern Fizik (Fotoelektrik, Kuantum)", sure: "2.5 sa", oncelik: "🟠", aciklama: "2023'te 3 soruya çıktı" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "FİZİK", konu: "Dalgalar & Kırınım (AYT)", sure: "2 sa", oncelik: "🟠", aciklama: "Tek yarık, EM spektrum" },
            { ders: "📝 DENEME", konu: "AYT Fizik Tam Testi", sure: "25 dk", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "🔁 TEKİ", konu: "E&M + Modern Fizik tekrar", sure: "3 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 6,
        title: "AYT KİMYA – DENGE & ORGANİK",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "KİMYA", konu: "Modern Atom Teorisi & Orbitaller", sure: "2.5 sa", oncelik: "🟠", aciklama: "Kuantum sayıları, elektron dizilimi" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "KİMYA", konu: "Kimyasal Kinetik – Tepkime Hızı", sure: "2.5 sa", oncelik: "🟠", aciklama: "Aktivasyon enerjisi, katalizör" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "KİMYA", konu: "Kimyasal Denge & Le Chatelier İlkesi", sure: "3 sa", oncelik: "🔴", aciklama: "Kc, Kp, çözünürlük dengesi – en çok soru" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "KİMYA", konu: "Asit–Baz Dengesi & pH Hesabı", sure: "3 sa", oncelik: "🔴", aciklama: "Tampon, hidroliz, pH/pOH" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "KİMYA", konu: "Elektrokimya (Pil & Elektroliz)", sure: "2.5 sa", oncelik: "🔴", aciklama: "Anot–katot, Faraday, korozyon" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "KİMYA", konu: "Organik Kimya – Fonksiyonel Gruplar", sure: "3 sa", oncelik: "🔴", aciklama: "4-5 soru – en yüksek ağırlık" },
            { ders: "KİMYA", konu: "Organik Tepkimeler & Adlandırma", sure: "2 sa", oncelik: "🔴", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "📝 DENEME", konu: "AYT Kimya Tam Testi (13 soru)", sure: "20 dk", oncelik: "⚪", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "Kimya genel tekrar", sure: "2 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 7,
        title: "AYT BİYOLOJİ – GENETİK & SİSTEMLER",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "BİYOLOJİ", konu: "DNA & Protein Sentezi", sure: "3 sa", oncelik: "🔴", aciklama: "Transkripsiyon, translasyon" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "BİYOLOJİ", konu: "Kalıtım (Mendel Genetiği)", sure: "3 sa", oncelik: "🔴", aciklama: "Her yıl 2-3 soru" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "BİYOLOJİ", konu: "Genetik Mühendisliği & Biyoteknoloji", sure: "2 sa", oncelik: "🟠", aciklama: "" },
            { ders: "BİYOLOJİ", konu: "Fotosentez & Kemosentez", sure: "2 sa", oncelik: "🔴", aciklama: "Enerji dönüşümleri – kritik alan" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "BİYOLOJİ", konu: "Hücresel Solunum (ATP Üretimi)", sure: "2.5 sa", oncelik: "🔴", aciklama: "Glikoliz, krebs, ETS" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "BİYOLOJİ", konu: "İnsan Fizyolojisi – Sindirim & Boşaltım", sure: "2.5 sa", oncelik: "🟠", aciklama: "Sistemler grubu" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "BİYOLOJİ", konu: "Dolaşım & Sinir Sistemi", sure: "2.5 sa", oncelik: "🟠", aciklama: "" },
            { ders: "BİYOLOJİ", konu: "Ekoloji & Popülasyon", sure: "2 sa", oncelik: "🟠", aciklama: "" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "📝 DENEME", konu: "AYT Biyoloji Tam Testi (13 soru)", sure: "20 dk", oncelik: "⚪", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "Biyoloji genel tekrar", sure: "2 sa", oncelik: "⚪", aciklama: "" },
          ]},
        ],
      },
      {
        week: 8,
        title: "BÜTÜNLEŞME & FİNAL",
        days: [
          { gun: "PAZARTESİ", dersler: [
            { ders: "📝 DENEME", konu: "TYT Tam Deneme (120 soru)", sure: "135 dk", oncelik: "⚪", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "TYT fen analizi", sure: "1 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "SALI", dersler: [
            { ders: "🔁 TEKİ", konu: "TYT zayıf konuları sprint tekrar", sure: "4 sa", oncelik: "🔴", aciklama: "" },
          ]},
          { gun: "ÇARŞAMBA", dersler: [
            { ders: "📝 DENEME", konu: "AYT Fen Tam Testi (40 soru)", sure: "50 dk", oncelik: "⚪", aciklama: "" },
            { ders: "🔁 TEKİ", konu: "AYT fen analizi", sure: "1.5 sa", oncelik: "⚪", aciklama: "" },
          ]},
          { gun: "PERŞEMBE", dersler: [
            { ders: "🔁 TEKİ", konu: "AYT zayıf konuları sprint tekrar", sure: "4 sa", oncelik: "🔴", aciklama: "" },
          ]},
          { gun: "CUMA", dersler: [
            { ders: "🔁 TEKİ", konu: "Formül ve kavram özet kartları", sure: "3 sa", oncelik: "⚪", aciklama: "Tüm dersler" },
          ]},
          { gun: "CUMARTESİ", dersler: [
            { ders: "🔁 TEKİ", konu: "ÖSYM çıkmış soru hızlı tarama", sure: "3 sa", oncelik: "⚪", aciklama: "2021-2025 fen soruları" },
          ]},
          { gun: "PAZAR", dersler: [
            { ders: "😴 DİNLENME", konu: "Sınav öncesi tam dinlenme", sure: "—", oncelik: "⚪", aciklama: "Güven duy, çok çalıştın" },
          ]},
        ],
      },
    ],
  },
};

const dersRenkleri = {
  "FİZİK": { bg: "#1e3a5f", border: "#4a90e2", text: "#7ec8e3", icon: "⚛️" },
  "KİMYA": { bg: "#3a1e1e", border: "#e24a4a", text: "#e8a87c", icon: "🧪" },
  "BİYOLOJİ": { bg: "#1e3a1e", border: "#4ae24a", text: "#7ec87e", icon: "🧬" },
  "📝 DENEME": { bg: "#2a2a1e", border: "#e2e24a", text: "#f0e68c", icon: "" },
  "🔁 TEKİ": { bg: "#2a1e3a", border: "#9b4ae2", text: "#c8a8e8", icon: "" },
  "😴 DİNLENME": { bg: "#1e2a2a", border: "#4ae2e2", text: "#a8e8e8", icon: "" },
};

const oncelikRenkleri = {
  "🔴": { label: "Çok Yüksek", color: "#e63946" },
  "🟠": { label: "Yüksek", color: "#f4a261" },
  "🟡": { label: "Orta", color: "#e9c46a" },
  "⚪": { label: "Destek", color: "#adb5bd" },
};

export default function App() {
  const [aktifProgram, setAktifProgram] = useState("yogun");
  const [aktifHafta, setAktifHafta] = useState(0);
  const [aktifGun, setAktifGun] = useState(null);
  const [tamamlananlar, setTamamlananlar] = useState({});

  const program = programs[aktifProgram];
  const hafta = program.weeks[aktifHafta];

  const toggleTamamla = (key) => {
    setTamamlananlar(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const ilerlemeHesapla = () => {
    const tumDersler = program.weeks.flatMap((h, hi) =>
      h.days.flatMap((g, gi) =>
        g.dersler.map((_, di) => `${aktifProgram}-${hi}-${gi}-${di}`)
      )
    );
    const tamamlanan = tumDersler.filter(k => tamamlananlar[k]).length;
    return Math.round((tamamlanan / tumDersler.length) * 100);
  };

  const haftaIlerleme = () => {
    const haftaDersler = hafta.days.flatMap((g, gi) =>
      g.dersler.map((_, di) => `${aktifProgram}-${aktifHafta}-${gi}-${di}`)
    );
    const tamamlanan = haftaDersler.filter(k => tamamlananlar[k]).length;
    return Math.round((tamamlanan / haftaDersler.length) * 100);
  };

  const ilerleme = ilerlemeHesapla();
  const haftaIlerlemeYuzde = haftaIlerleme();

  return (
    <div style={{
      minHeight: "100vh",
      background: program.bg,
      fontFamily: "'Courier New', Courier, monospace",
      color: "#e0e0e0",
      transition: "background 0.4s ease",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: `2px solid ${program.color}`,
        padding: "20px 24px 16px",
        background: `${program.card}cc`,
        backdropFilter: "blur(10px)",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: program.accent, letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>
                ÖSYM Verilerine Dayalı
              </div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "#fff" }}>
                YKS Fen Bilimleri Tekrar Programı
              </h1>
            </div>
            {/* İlerleme */}
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#999", marginBottom: 4 }}>Toplam İlerleme</div>
              <div style={{ fontSize: 22, fontWeight: "bold", color: program.accent }}>{ilerleme}%</div>
              <div style={{ width: 120, height: 4, background: "#333", borderRadius: 2, marginTop: 4 }}>
                <div style={{ width: `${ilerleme}%`, height: "100%", background: program.accent, borderRadius: 2, transition: "width 0.3s" }} />
              </div>
            </div>
          </div>

          {/* Program seçici */}
          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            {Object.values(programs).map(p => (
              <button
                key={p.id}
                onClick={() => { setAktifProgram(p.id); setAktifHafta(0); setAktifGun(null); }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: `2px solid ${aktifProgram === p.id ? p.color : "#333"}`,
                  background: aktifProgram === p.id ? `${p.color}22` : "transparent",
                  color: aktifProgram === p.id ? p.accent : "#888",
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "inherit",
                  fontWeight: aktifProgram === p.id ? "bold" : "normal",
                  transition: "all 0.2s",
                }}
              >
                {p.title}
                <div style={{ fontSize: 10, opacity: 0.7 }}>{p.subtitle}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px" }}>
        {/* Program açıklama */}
        <div style={{
          background: `${program.card}88`,
          border: `1px solid ${program.color}44`,
          borderRadius: 10,
          padding: "14px 18px",
          marginBottom: 20,
          fontSize: 13,
          color: "#bbb",
          lineHeight: 1.6,
        }}>
          <span style={{ color: program.accent, fontWeight: "bold" }}>📋 Strateji: </span>
          {program.description}
        </div>

        {/* Ders Renk Göstergesi */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
          {Object.entries(dersRenkleri).slice(0, 3).map(([ders, stil]) => (
            <div key={ders} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: `${stil.bg}`, border: `1px solid ${stil.border}44`,
              borderRadius: 20, padding: "4px 10px", fontSize: 11,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: stil.border }} />
              <span style={{ color: stil.text }}>{stil.icon} {ders}</span>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {Object.entries(oncelikRenkleri).slice(0, 3).map(([emoji, { label, color }]) => (
              <div key={emoji} style={{
                display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#888",
              }}>
                <span style={{ color }}>{emoji}</span> {label}
              </div>
            ))}
          </div>
        </div>

        {/* Hafta navigasyonu */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {program.weeks.map((h, i) => {
            const haftaDersler = h.days.flatMap((g, gi) =>
              g.dersler.map((_, di) => `${aktifProgram}-${i}-${gi}-${di}`)
            );
            const tam = haftaDersler.filter(k => tamamlananlar[k]).length;
            const yuzde = Math.round((tam / haftaDersler.length) * 100);
            return (
              <button
                key={i}
                onClick={() => { setAktifHafta(i); setAktifGun(null); }}
                style={{
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `2px solid ${aktifHafta === i ? program.color : "#333"}`,
                  background: aktifHafta === i ? `${program.color}33` : "transparent",
                  color: aktifHafta === i ? "#fff" : "#888",
                  cursor: "pointer",
                  fontSize: 11,
                  fontFamily: "inherit",
                  position: "relative",
                  transition: "all 0.2s",
                  minWidth: 70,
                }}
              >
                <div style={{ fontWeight: "bold" }}>H{i + 1}</div>
                <div style={{ fontSize: 10, opacity: 0.8, marginTop: 2 }}>{yuzde}%</div>
                {yuzde === 100 && (
                  <div style={{
                    position: "absolute", top: -6, right: -6,
                    background: program.accent, color: "#000",
                    borderRadius: "50%", width: 16, height: 16,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 9, fontWeight: "bold",
                  }}>✓</div>
                )}
              </button>
            );
          })}
        </div>

        {/* Hafta başlığı */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 16, flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 11, color: program.accent, letterSpacing: 2, textTransform: "uppercase" }}>
              Hafta {aktifHafta + 1}
            </div>
            <h2 style={{ margin: "4px 0 0", fontSize: 18, color: "#fff" }}>{hafta.title}</h2>
          </div>
          <div style={{ fontSize: 13, color: "#888" }}>
            <span style={{ color: program.accent, fontWeight: "bold" }}>{haftaIlerlemeYuzde}%</span> tamamlandı
          </div>
        </div>

        {/* Günler */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {hafta.days.map((gun, gi) => {
            const acik = aktifGun === gi;
            return (
              <div key={gi} style={{
                background: program.card,
                border: `1px solid ${acik ? program.color : "#2a2a2a"}`,
                borderRadius: 10,
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}>
                {/* Gün başlığı */}
                <button
                  onClick={() => setAktifGun(acik ? null : gi)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "space-between", padding: "12px 16px",
                    background: "transparent", border: "none", cursor: "pointer",
                    color: "#e0e0e0", fontFamily: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 6,
                      background: acik ? `${program.color}44` : "#1a1a1a",
                      border: `1px solid ${acik ? program.color : "#333"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: "bold", color: acik ? program.accent : "#666",
                      letterSpacing: 0.5, transition: "all 0.2s",
                    }}>
                      {gi + 1}
                    </div>
                    <div style={{ textAlign: "left" }}>
                      <div style={{ fontSize: 12, fontWeight: "bold", color: acik ? "#fff" : "#ccc", letterSpacing: 1 }}>
                        {gun.gun}
                      </div>
                      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                        {gun.dersler.map(d => dersRenkleri[d.ders]?.icon || "📌").join(" ")} {gun.dersler.length} görev
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Mini tamamlanma göstergesi */}
                    <div style={{ display: "flex", gap: 3 }}>
                      {gun.dersler.map((_, di) => {
                        const key = `${aktifProgram}-${aktifHafta}-${gi}-${di}`;
                        return (
                          <div key={di} style={{
                            width: 6, height: 6, borderRadius: "50%",
                            background: tamamlananlar[key] ? program.accent : "#333",
                            transition: "background 0.2s",
                          }} />
                        );
                      })}
                    </div>
                    <span style={{ color: "#555", fontSize: 16, transform: acik ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                  </div>
                </button>

                {/* Görevler */}
                {acik && (
                  <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {gun.dersler.map((gorev, di) => {
                      const key = `${aktifProgram}-${aktifHafta}-${gi}-${di}`;
                      const tamam = tamamlananlar[key];
                      const stil = dersRenkleri[gorev.ders] || { bg: "#1a1a2a", border: "#555", text: "#aaa", icon: "📌" };
                      return (
                        <div
                          key={di}
                          onClick={() => toggleTamamla(key)}
                          style={{
                            background: tamam ? `${stil.bg}cc` : stil.bg,
                            border: `1px solid ${tamam ? program.accent : stil.border}44`,
                            borderRadius: 8, padding: "10px 14px",
                            cursor: "pointer", transition: "all 0.2s",
                            opacity: tamam ? 0.7 : 1,
                            display: "flex", alignItems: "flex-start", gap: 12,
                          }}
                        >
                          <div style={{
                            width: 22, height: 22, borderRadius: 4, flexShrink: 0, marginTop: 1,
                            border: `2px solid ${tamam ? program.accent : stil.border}66`,
                            background: tamam ? program.accent : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 12, color: "#000", transition: "all 0.2s",
                          }}>
                            {tamam ? "✓" : ""}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 4 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{
                                  fontSize: 10, padding: "2px 7px", borderRadius: 10,
                                  background: `${stil.border}22`, color: stil.text, letterSpacing: 1,
                                  textDecoration: tamam ? "line-through" : "none",
                                }}>
                                  {gorev.ders}
                                </span>
                                <span style={{ fontSize: 12, color: "#777" }}>{gorev.oncelik}</span>
                              </div>
                              <span style={{ fontSize: 11, color: "#555", background: "#1a1a1a", padding: "2px 8px", borderRadius: 4 }}>
                                ⏱ {gorev.sure}
                              </span>
                            </div>
                            <div style={{
                              fontSize: 13, fontWeight: "bold", color: tamam ? "#888" : "#e0e0e0",
                              marginTop: 4, textDecoration: tamam ? "line-through" : "none",
                            }}>
                              {gorev.konu}
                            </div>
                            {gorev.aciklama && (
                              <div style={{ fontSize: 11, color: "#666", marginTop: 3 }}>{gorev.aciklama}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Alt bilgi */}
        <div style={{
          marginTop: 28, padding: "14px 18px",
          background: "#0d0d0d", borderRadius: 10,
          border: "1px solid #1a1a1a", fontSize: 11, color: "#555",
          lineHeight: 1.8,
        }}>
          <div style={{ color: "#444", marginBottom: 6 }}>📊 ÖSYM 2021–2025 Verilerine Göre En Kritik Konular</div>
          <div>
            <span style={{ color: "#4a90e2" }}>FİZİK:</span> Hareket&Kuvvet · Optik · Isı-Sıcaklık · Elektrik Alan · Mekanik (AYT)
            &nbsp;|&nbsp;
            <span style={{ color: "#e24a4a" }}>KİMYA:</span> Kimyasal Denge · Organik · Elektrokimya · Asit-Baz
            &nbsp;|&nbsp;
            <span style={{ color: "#4ae24a" }}>BİYOLOJİ:</span> Genetik · Hücre · Enerji Dönüşümleri · İnsan Sistemleri
          </div>
          <div style={{ marginTop: 6, color: "#3a3a3a" }}>Görevlere tıklayarak tamamlandı olarak işaretleyebilirsin.</div>
        </div>
      </div>
    </div>
  );
}
