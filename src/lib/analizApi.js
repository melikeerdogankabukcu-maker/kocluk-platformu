import { supabase } from "../supabase";
import { API_URL } from "./config";

// Analiz servisine yapılan çağrılar.
//
// Servis artık kimlik doğruluyor: her istek Supabase oturum token'ını
// taşımak zorunda. Önceden hiçbir token gitmiyordu ve servis de
// sormuyordu — öğrenci id'sini bilen herkes o öğrencinin analizini
// çekebiliyordu.
//
// Token tek yerden ekleniyor ki yeni bir uç nokta eklendiğinde başlığı
// koymayı unutmak mümkün olmasın; çağrı yerlerine dağıtılsaydı
// unutulan yer sessizce 401 alır ve "backend çalışmıyor" gibi görünürdü.
export async function analizGetir(yol) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  // Oturum yoksa isteği hiç atmıyoruz: servis nasılsa 401 dönecek,
  // boşuna Render'ı uyandırmanın anlamı yok.
  if (!token) throw new Error("Oturum yok");

  return fetch(`${API_URL}${yol}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}
