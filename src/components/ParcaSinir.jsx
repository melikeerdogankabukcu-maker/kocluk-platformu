import { Component } from "react";

// Tembel yüklenen parçalar için hata sınırı.
//
// ── NEDEN ŞART ──────────────────────────────────────────────────
// Paneller ayrı parçalara bölündü; bu ilk açılışta inen dosyayı
// yarıdan aza indirdi ama YENİ bir kırılma noktası açtı: parça
// inemezse React.lazy hata fırlatıyor ve uygulama bembeyaz kalıyor.
// Hiçbir mesaj, hiçbir çıkış yolu yok.
//
// Tam da zayıf bağlantıda yaşanan sorunu çözerken bunu açık bırakmak
// bir arızayı başkasıyla değiştirmek olurdu.
//
// ── YENİLEME DEĞİL, TEKRAR DENE ─────────────────────────────────
// Sayfayı yenilemek her şeyi baştan indiriyor. Burada yalnız durum
// sıfırlanıyor: React parçayı yeniden istiyor, ağ geri geldiyse
// uygulama olduğu yerden açılıyor.
export default class ParcaSinir extends Component {
  constructor(props) {
    super(props);
    this.state = { hata: null };
  }

  static getDerivedStateFromError(hata) {
    return { hata };
  }

  componentDidCatch(hata, bilgi) {
    // Sessiz kalmıyor: parça yükleme hatası ile gerçek bir çalışma
    // hatası konsolda ayırt edilebilmeli.
    console.error("[Parca yuklenemedi]", hata, bilgi?.componentStack);
  }

  render() {
    if (!this.state.hata) return this.props.children;

    return (
      <div style={{
        padding: "60px 20px", textAlign: "center",
        fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 8 }}>
          Bu bölüm yüklenemedi
        </div>
        <p style={{ fontSize: 13, color: "#777", lineHeight: 1.6, maxWidth: 300, margin: "0 auto 18px" }}>
          Bağlantı kopmuş olabilir. Bağlantınızı kontrol edip tekrar deneyin.
        </p>
        <button
          onClick={() => this.setState({ hata: null })}
          style={{
            padding: "10px 24px", borderRadius: 12, border: "none",
            background: "#0F6E56", color: "#fff", fontSize: 14,
            fontWeight: 700, cursor: "pointer",
          }}>Tekrar dene</button>
      </div>
    );
  }
}
