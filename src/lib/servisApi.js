import { supabase } from "../supabase";
import { API_URL } from "./config";

// Python servisine yapılan çağrılar.
//
// Servis kimlik doğruluyor: her istek Supabase oturum token'ını taşımak
// zorunda. Token tek yerden ekleniyor ki yeni bir uç nokta eklendiğinde
// başlığı koymayı unutmak mümkün olmasın; çağrı yerlerine dağıtılsaydı
// unutulan yer sessizce 401 alır ve "backend çalışmıyor" gibi görünürdü.

async function token() {
  const { data: { session } } = await supabase.auth.getSession();
  const t = session?.access_token;
  // Oturum yoksa isteği hiç atmıyoruz: servis nasılsa 401 dönecek,
  // boşuna Render'ı uyandırmanın anlamı yok.
  if (!t) throw new Error("Oturum yok");
  return t;
}

export async function analizGetir(yol) {
  return fetch(`${API_URL}${yol}`, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
}

// Koç/yönetici bir kullanıcıya geçici şifre atar. Şifre değiştirmek
// service_role gerektiriyor ve o anahtar tarayıcıya asla verilemez;
// bu yüzden işlem servisten geçiyor.
//
// Dönen şifre EKRANDA GÖSTERİLİYOR, hiçbir yere kaydedilmiyor: koç onu
// kullanıcıya kendi iletiyor. Saklanması gereken bir sır değil, zaten
// ilk girişte değiştirilecek.
export async function sifreSifirla(kisiId) {
  const res = await fetch(`${API_URL}/sifre-sifirla/${kisiId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await token()}` },
  });
  const govde = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(govde.detail || `Şifre sıfırlanamadı (HTTP ${res.status})`);
  }
  return govde.gecici_sifre;
}
