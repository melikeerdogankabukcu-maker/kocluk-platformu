// Hazır çalışma programları — ÖSYM 2021–2025 soru dağılımı analizine göre
// hazırlanmış, sınav öncesi tekrar odaklı programlar.
// Kaynak: src/fen-tekrar-programi.jsx (kullanıcının hazırladığı özgün içerik).
// Buraya yalnızca VERİ taşındı; özgün dosyadaki arayüz olduğu gibi duruyor.
//
// Yapı: program → haftalar → günler → ders satırları
// Bir satırın anahtarı "hafta-günIndex-satırIndex" biçimindedir (ör. "2-0-1");
// tamamlama kayıtları bu anahtarla tutulur.
export const STUDY_PROGRAMS = {
    "yogun": {
      "id": "yogun",
      "title": "⚡ Yoğun Atılım",
      "subtitle": "4 Haftalık Sprint Programı",
      "description": "Sınava az zamanı olan veya hızlı net artırmak isteyen öğrenciler için. Sadece ÖSYM'nin en çok sorduğu konulara odaklanır.",
      "weeks": [
        {
          "week": 1,
          "title": "FİZİK TEMELİ",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Hareket ve Kuvvet",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Newton yasaları, net kuvvet, sürtünme – Her yıl çıkıyor"
                },
                {
                  "ders": "FİZİK",
                  "konu": "Optik (Kırılma & Yansıma)",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Görünen konum, mercekler – 5 yılda 5 soru"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Kimyasal Türler Arası Etkileşim",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "TYT'de hiç atlanmamış konu"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Atom ve Periyodik Sistem",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Periyodik özellikler, izotoplar"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Hücre ve Organeller",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "TYT'de temel, AYT'de detay sorular"
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Mitoz & Mayoz",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Her yıl en az 1 soru"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Isı, Sıcaklık ve Genleşme",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Öz ısı, ısı sığası, hal değişimi"
                },
                {
                  "ders": "FİZİK",
                  "konu": "Elektrostatik",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Yüklenme, elektron alışverişi"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Maddenin Halleri",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Hiç atlanmamış – Buhar basıncı, hal değişimi grafikleri"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Karışımlar & Çözeltiler",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Molarite, derişim hesapları"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "TYT Fen Mini Deneme (20 soru)",
                  "sure": "25 dk",
                  "oncelik": "⚪",
                  "aciklama": "Haftalık performans ölçümü"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Hatalı soruları tekrar çöz",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": "Yanlış konuları not al"
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Sindirim & Boşaltım Sistemleri",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "İnsan fizyolojisi – AYT'de ağırlıklı alan"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Hafta tekrarı – Formüller",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": "Tüm formülleri gözden geçir"
                }
              ]
            }
          ]
        },
        {
          "week": 2,
          "title": "KİMYA & BİYOLOJİ ATILIMI",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Asit–Baz Dengesi (AYT)",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "pH, pOH, tampon çözelti – 5 yılda 5 soru"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Kimyasal Denge & Le Chatelier",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "En çok soru gelen konu"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Genetik (Kalıtım ve DNA)",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Her yıl 2-3 soru – AYT'de kritik"
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Protein Sentezi",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "DNA→RNA→Protein"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Mekanik – Atışlar (AYT)",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Eğik atış, yatay atış"
                },
                {
                  "ders": "FİZİK",
                  "konu": "Elektrik Alan ve Potansiyel",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Eşpotansiyel yüzeyler, iş hesabı"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Organik Kimya (Fonksiyonel Gruplar)",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "4-5 soru – AYT'de en ağırlıklı konu"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Elektrokimya (Pil & Elektroliz)",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Her yıl 2-3 soru"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Dolaşım ve Solunum Sistemi",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "İnsan fizyolojisi grubu"
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Fotosentez & Solunum",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Enerji dönüşümleri – her yıl çıkıyor"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Fen Denemesi (40 soru)",
                  "sure": "50 dk",
                  "oncelik": "⚪",
                  "aciklama": "Tam test deneyimi"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Deneme analizi",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": "Konu bazlı hata tablosu çıkar"
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Modern Fizik (Fotoelektrik)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Son yıllarda artan trend"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "2. hafta genel tekrar",
                  "sure": "1.5 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 3,
          "title": "İLERİ KONU & PEKIŞTIRME",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Basit Harmonik Hareket",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Her yıl 1 soru"
                },
                {
                  "ders": "FİZİK",
                  "konu": "Manyetik Alan & İndüksiyon",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Lorentz kuvveti, solenoid"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Gazlar (Gaz Yasaları)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "İdeal gaz, hacim-basınç-sıcaklık"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Kimyasal Kinetik (Tepkime Hızı)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Aktivasyon enerjisi, hız sabiti"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Ekoloji & Çevre",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Popülasyon, enerji akışı"
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Evrim Teorisi",
                  "sure": "1.5 sa",
                  "oncelik": "🟡",
                  "aciklama": "Kavramsal sorular"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Düzgün Çembersel Hareket",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Yörünge hızı, Kepler"
                },
                {
                  "ders": "FİZİK",
                  "konu": "Dalgalar & Optik (AYT)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Tek yarık kırınım, EM spektrum"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Sıvı Çözeltiler & Koligatif",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Kaynama noktası yükselmesi, donma noktası"
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Sinir Sistemi & Duyu Organları",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "İmpuls iletimi"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "Karma Fen Denemesi",
                  "sure": "50 dk",
                  "oncelik": "⚪",
                  "aciklama": "Tüm dersleri tek seferde test et"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Deneme analizi + zayıf konu tekrarı",
                  "sure": "1.5 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "1-3. hafta yoğun tekrar",
                  "sure": "3 sa",
                  "oncelik": "⚪",
                  "aciklama": "Tüm 🔴 konuları tekrar tara"
                }
              ]
            }
          ]
        },
        {
          "week": 4,
          "title": "DENEME & FİNAL",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "TYT Tam Deneme",
                  "sure": "135 dk",
                  "oncelik": "⚪",
                  "aciklama": "Gerçek sınav koşullarında"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Fizik hataları analizi",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Kimya yoğun tekrar (Denge + Organik)",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Son tekrar"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Tam Deneme",
                  "sure": "180 dk",
                  "oncelik": "⚪",
                  "aciklama": "Gerçek sınav koşullarında"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Biyoloji hataları analizi",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Biyoloji – Genetik final tekrarı",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Fizik – Mekanik + E&M formüller",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Tüm ders formül özeti",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": "Fizik + Kimya + Biyoloji özet"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Çıkmış sorular hızlı tarama",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": "ÖSYM 2021-2025 soruları"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Hafif tekrar + dinlenme",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": "Strese girme, bildiklerini güven"
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "😴 DİNLENME",
                  "konu": "Sınav öncesi tam dinlenme günü",
                  "sure": "—",
                  "oncelik": "⚪",
                  "aciklama": "Zihinsel hazırlık"
                }
              ]
            }
          ]
        }
      ]
    },
    "dengeli": {
      "id": "dengeli",
      "title": "🌊 Dengeli Derinlik",
      "subtitle": "8 Haftalık Tam Kapsam Programı",
      "description": "Her konuya yeterli süre ayırmak isteyen, sağlam temel oluşturmak isteyen öğrenciler için. Konu bağlantısını öne çıkarır.",
      "weeks": [
        {
          "week": 1,
          "title": "FİZİK TEMELİ (TYT)",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Hareket – Kinematik (GLBB, Serbest Düşme)",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "TYT + AYT temel taşı"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Newton Yasaları & Net Kuvvet",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "5 yıl boyunca çıktı"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "İş, Güç, Enerji & Verim",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                },
                {
                  "ders": "FİZİK",
                  "konu": "Problem çözme (20 soru)",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Isı, Sıcaklık & Genleşme",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Öz ısı–ısı sığası ayrımı kritik"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Basınç & Kaldırma Kuvveti",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Arşimet ilkesi"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Dalgalar (Genlik–Periyot–Frekans)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                },
                {
                  "ders": "FİZİK",
                  "konu": "Optik – Yansıma & Kırılma",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Her yıl çıkıyor"
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "TYT Fizik Mini Test (7 soru)",
                  "sure": "15 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "1. hafta tekrar + eksik konu tamamla",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 2,
          "title": "KİMYA TEMELİ (TYT)",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Atom Yapısı & Periyodik Tablo",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Proton, nötron, elektron; periyodik eğilimler"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Kimyasal Türler Arası Etkileşim",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Lewis yapısı, H-bağı, Van der Waals"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Maddenin Halleri & Hal Değişimi Grafikleri",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Hiç atlanmamış konu"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Mol Kavramı & Kimyasal Hesaplamalar",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Stokiyometri, verim hesabı"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Karışımlar & Çözünürlük",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Molarite, seyreltme, ayırma yöntemleri"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Asit–Baz–Tuz (TYT düzeyi)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Güçlü–zayıf ayrımı, nötrleşme"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Problem çözme (20 soru)",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "TYT Kimya Mini Test (7 soru)",
                  "sure": "15 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "2. hafta tekrar",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 3,
          "title": "BİYOLOJİ TEMELİ (TYT)",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Hücre Yapısı & Organeller",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Prokaryot–ökaryot, organel görevleri"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Mitoz Bölünme",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Evreler, DNA miktarı değişimi"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Mayoz Bölünme & Üreme",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Gamet oluşumu, genetik çeşitlilik"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Canlıların Sınıflandırılması",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Biyolojik Çeşitlilik",
                  "sure": "1.5 sa",
                  "oncelik": "🟡",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Bitki Biyolojisi (Yapı & Fonksiyon)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Problem çözme (15 soru)",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "TYT Fen Bilimleri Tam Testi (20 soru)",
                  "sure": "25 dk",
                  "oncelik": "⚪",
                  "aciklama": "Fizik + Kimya + Biyoloji birlikte"
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Deneme analizi",
                  "sure": "1.5 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "1-3. haftalar kapsamlı tekrar",
                  "sure": "3 sa",
                  "oncelik": "⚪",
                  "aciklama": "Zayıf konulara odaklan"
                }
              ]
            }
          ]
        },
        {
          "week": 4,
          "title": "AYT FİZİK – MEKANİK",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Atışlar (Eğik & Yatay)",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "2025'te çıktı – referans sistemi kritik"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Momentum & İtme–Tepki",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Çarpışma türleri"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Enerji (Yay, Elastik Potansiyel)",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Enerji dönüşümleri – 2025'te çıktı"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Düzgün Çembersel Hareket",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Her yıl 1 soru"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Basit Harmonik Hareket",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Sarkaç, yay sistemi"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Çembersel + Yörünge Hareketi",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Kepler yorumlama"
                },
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Fizik Mini Test (14 soru)",
                  "sure": "20 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Mekanik genel tekrar",
                  "sure": "3 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 5,
          "title": "AYT FİZİK – E&M & MODERN",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Elektrik Alan & Potansiyel",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Eşpotansiyel yüzeyler, iş hesabı – 5 yıl soru"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Manyetik Alan & Lorentz Kuvveti",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Yüklü parçacık hareketi"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Elektromanyetik İndüksiyon",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Faraday yasası"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Alternatif Akım (RLC)",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Ampul parlaklığı soruları"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Modern Fizik (Fotoelektrik, Kuantum)",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "2023'te 3 soruya çıktı"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "FİZİK",
                  "konu": "Dalgalar & Kırınım (AYT)",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": "Tek yarık, EM spektrum"
                },
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Fizik Tam Testi",
                  "sure": "25 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "E&M + Modern Fizik tekrar",
                  "sure": "3 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 6,
          "title": "AYT KİMYA – DENGE & ORGANİK",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Modern Atom Teorisi & Orbitaller",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Kuantum sayıları, elektron dizilimi"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Kimyasal Kinetik – Tepkime Hızı",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Aktivasyon enerjisi, katalizör"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Kimyasal Denge & Le Chatelier İlkesi",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Kc, Kp, çözünürlük dengesi – en çok soru"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Asit–Baz Dengesi & pH Hesabı",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Tampon, hidroliz, pH/pOH"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Elektrokimya (Pil & Elektroliz)",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Anot–katot, Faraday, korozyon"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "KİMYA",
                  "konu": "Organik Kimya – Fonksiyonel Gruplar",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "4-5 soru – en yüksek ağırlık"
                },
                {
                  "ders": "KİMYA",
                  "konu": "Organik Tepkimeler & Adlandırma",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Kimya Tam Testi (13 soru)",
                  "sure": "20 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Kimya genel tekrar",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 7,
          "title": "AYT BİYOLOJİ – GENETİK & SİSTEMLER",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "DNA & Protein Sentezi",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Transkripsiyon, translasyon"
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Kalıtım (Mendel Genetiği)",
                  "sure": "3 sa",
                  "oncelik": "🔴",
                  "aciklama": "Her yıl 2-3 soru"
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Genetik Mühendisliği & Biyoteknoloji",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Fotosentez & Kemosentez",
                  "sure": "2 sa",
                  "oncelik": "🔴",
                  "aciklama": "Enerji dönüşümleri – kritik alan"
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Hücresel Solunum (ATP Üretimi)",
                  "sure": "2.5 sa",
                  "oncelik": "🔴",
                  "aciklama": "Glikoliz, krebs, ETS"
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "İnsan Fizyolojisi – Sindirim & Boşaltım",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": "Sistemler grubu"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Dolaşım & Sinir Sistemi",
                  "sure": "2.5 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                },
                {
                  "ders": "BİYOLOJİ",
                  "konu": "Ekoloji & Popülasyon",
                  "sure": "2 sa",
                  "oncelik": "🟠",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Biyoloji Tam Testi (13 soru)",
                  "sure": "20 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Biyoloji genel tekrar",
                  "sure": "2 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            }
          ]
        },
        {
          "week": 8,
          "title": "BÜTÜNLEŞME & FİNAL",
          "days": [
            {
              "gun": "PAZARTESİ",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "TYT Tam Deneme (120 soru)",
                  "sure": "135 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "TYT fen analizi",
                  "sure": "1 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "SALI",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "TYT zayıf konuları sprint tekrar",
                  "sure": "4 sa",
                  "oncelik": "🔴",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "ÇARŞAMBA",
              "dersler": [
                {
                  "ders": "📝 DENEME",
                  "konu": "AYT Fen Tam Testi (40 soru)",
                  "sure": "50 dk",
                  "oncelik": "⚪",
                  "aciklama": ""
                },
                {
                  "ders": "🔁 TEKİ",
                  "konu": "AYT fen analizi",
                  "sure": "1.5 sa",
                  "oncelik": "⚪",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "PERŞEMBE",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "AYT zayıf konuları sprint tekrar",
                  "sure": "4 sa",
                  "oncelik": "🔴",
                  "aciklama": ""
                }
              ]
            },
            {
              "gun": "CUMA",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "Formül ve kavram özet kartları",
                  "sure": "3 sa",
                  "oncelik": "⚪",
                  "aciklama": "Tüm dersler"
                }
              ]
            },
            {
              "gun": "CUMARTESİ",
              "dersler": [
                {
                  "ders": "🔁 TEKİ",
                  "konu": "ÖSYM çıkmış soru hızlı tarama",
                  "sure": "3 sa",
                  "oncelik": "⚪",
                  "aciklama": "2021-2025 fen soruları"
                }
              ]
            },
            {
              "gun": "PAZAR",
              "dersler": [
                {
                  "ders": "😴 DİNLENME",
                  "konu": "Sınav öncesi tam dinlenme",
                  "sure": "—",
                  "oncelik": "⚪",
                  "aciklama": "Güven duy, çok çalıştın"
                }
              ]
            }
          ]
        }
      ]
    }
  };

export const programListesi = () => Object.values(STUDY_PROGRAMS);
export const programGetir = (id) => STUDY_PROGRAMS[id] ?? null;

// Bir programdaki toplam ders satırı sayısı
export const programSatirSayisi = (id) => {
  const p = programGetir(id);
  if (!p) return 0;
  return p.weeks.reduce((s, w) => s + w.days.reduce((a, g) => a + g.dersler.length, 0), 0);
};

// Bir haftadaki satır anahtarları
export function haftaAnahtarlari(programId, hafta) {
  const p = programGetir(programId);
  const w = p?.weeks.find(x => x.week === hafta);
  if (!w) return [];
  return w.days.flatMap((g, gi) => g.dersler.map((_, si) => `${hafta}-${gi}-${si}`));
}

// Bir ders satırının benzersiz anahtarı
export const satirAnahtari = (hafta, gunIndex, satirIndex) => `${hafta}-${gunIndex}-${satirIndex}`;

// Programın başlangıç tarihine göre bir haftanın tarih aralığı
export function haftaTarihAraligi(baslangic, hafta) {
  const bas = new Date(baslangic);
  bas.setDate(bas.getDate() + (hafta - 1) * 7);
  const son = new Date(bas);
  son.setDate(son.getDate() + 6);
  return { bas, son };
}

// --- Takvim entegrasyonu ---
// Program adımlarının tarihi atamanın başlangıcından türetilir:
// tarih = baslangic + (hafta-1)*7 + günIndex. Bu yüzden adımların ayrıca
// tarih alanı tutulmasına gerek yok.
const _tarihStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Atamanın dayandığı program içeriği. Atama anında kopyalanan program_icerik
// önceliklidir — öğretmen kütüphanedeki programı sonradan düzenlese bile
// devam eden öğrencinin planı kaymaz. Eski atamalarda kopya yoksa koddaki
// hazır programa düşülür.
export const atamaProgrami = (atama) =>
  atama?.program_icerik ?? programGetir(atama?.program_id);

export function programTakvimOgeleri(atama) {
  if (!atama) return [];
  const p = atamaProgrami(atama);
  if (!p?.weeks) return [];
  const tamam = new Set(atama.tamamlananlar ?? []);
  const bas = new Date(atama.baslangic);
  const ogeler = [];

  p.weeks.forEach(w => {
    w.days.forEach((g, gi) => {
      const gun = new Date(bas);
      gun.setDate(gun.getDate() + (w.week - 1) * 7 + gi);
      const tarih = _tarihStr(gun);
      g.dersler.forEach((x, si) => {
        const anahtar = satirAnahtari(w.week, gi, si);
        ogeler.push({
          ...x, tarih, anahtar, hafta: w.week,
          id: `${atama.id}-${anahtar}`,
          tamamlandi: tamam.has(anahtar),
        });
      });
    });
  });
  return ogeler;
}
