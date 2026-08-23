import { supabase } from "../supabase";

// Verilen öğretmen listesine branş ve unvanı ekler.
//
// Ayrı sorgu, gömülü ilişki (users?select=...ogretmen_profilleri(...))
// yerine: PostgREST ilişkiyi tanımazsa gömülü alan sessizce boş gelir ve
// branş hiç görünmezken hata da alınmaz. Ayrı sorgu ne aldığını söylüyor.
export async function branslariEkle(kisiler) {
  if (!kisiler?.length) return kisiler ?? [];
  const { data, error } = await supabase
    .from("ogretmen_profilleri").select("id, brans, unvan")
    .in("id", kisiler.map(k => k.id));
  if (error) {
    console.error("[Ogretmen branslari]", error);
    return kisiler;          // branş olmasın, liste yine de çalışsın
  }
  const harita = {};
  (data ?? []).forEach(p => { harita[p.id] = p; });
  return kisiler.map(k => ({ ...k, ...harita[k.id] }));
}

// Mesajlaşma listesinde görünen etiket: branşı varsa onu göster,
// yoksa genel "koç" etiketine düş.
export const kocEtiketi = (k) => (k.brans ? `· ${k.brans}` : "· koç");

// Branş önerileri. Serbest metin alanına datalist olarak veriliyor:
// listede olmayan bir branş (özel bir alan, yeni bir ders) yazılabilsin
// diye kapalı bir açılır liste yapılmadı.
export const BRANSLAR = [
  "Matematik",
  "Türkçe",
  "Türk Dili ve Edebiyatı",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Fen Bilimleri",
  "Tarih",
  "Coğrafya",
  "Felsefe",
  "Din Kültürü ve Ahlak Bilgisi",
  "Sosyal Bilgiler",
  "İngilizce",
  "Almanca",
  "Fransızca",
  "Rehberlik ve Psikolojik Danışmanlık",
  "Sınıf Öğretmenliği",
  "Bilişim Teknolojileri",
  "Geometri",
];

export const UNVANLAR = [
  "Öğretmen",
  "Rehber Öğretmen",
  "Eğitim Koçu",
  "Uzman Öğretmen",
  "Başöğretmen",
  "Okul Müdürü",
  "Müdür Yardımcısı",
];
