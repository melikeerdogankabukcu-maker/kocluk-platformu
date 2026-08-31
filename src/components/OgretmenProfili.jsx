import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { calistir } from "../lib/db";
import { BRANSLAR, UNVANLAR } from "../lib/branslar";
import Card from "./Card";
import SectionTitle from "./SectionTitle";

// Öğretmenin kendi mesleki profili. Öğrenciler koçlarının branşını
// buradan görüyor — birden fazla koçu olan öğrenci hangisine ne
// soracağını bilsin.
export default function OgretmenProfili({ userId, color: c }) {
  const [acik,    setAcik]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [islemde, setIslemde] = useState(false);
  const [kayitli, setKayitli] = useState(false);
  const [form,    setForm]    = useState({
    brans: "", unvan: "", hakkinda: "", deneyim_yili: "",
  });
  // Kart kapalıyken de başlıkta branş görünsün diye ayrı tutuluyor
  const [ozet, setOzet] = useState(null);

  const yukle = useCallback(async () => {
    const { veri } = await calistir(
      supabase.from("ogretmen_profilleri").select("*").eq("id", userId).maybeSingle(),
      "Ogretmen profili", { sessiz: true }
    );
    if (veri) {
      setForm({
        brans:        veri.brans        ?? "",
        unvan:        veri.unvan        ?? "",
        hakkinda:     veri.hakkinda     ?? "",
        // null'ı "" yapmak şart: input value={null} React'te uncontrolled'a düşer
        deneyim_yili: veri.deneyim_yili ?? "",
      });
      setOzet(veri);
    }
  }, [userId]);

  // Bir kez okunuyor: kart kapalıyken başlıkta branş görünsün diye zaten
  // gerekiyor, açılınca yeniden çekmenin anlamı yok — form aynı veriyle
  // dolu ve tek düzenleyen kişinin kendisi.
  useEffect(() => {
    setLoading(true);
    yukle().finally(() => setLoading(false));
  }, [yukle]);

  const kaydet = async () => {
    setIslemde(true);
    setKayitli(false);
    const satir = {
      id: userId,
      brans:    form.brans.trim()    || null,
      unvan:    form.unvan.trim()    || null,
      hakkinda: form.hakkinda.trim() || null,
      // Boş metin 0'a dönmesin: "" → null, girilmemiş demek
      deneyim_yili: form.deneyim_yili === "" ? null : Number(form.deneyim_yili),
    };
    // upsert: profil ilk kez yazılıyor olabilir de, güncelleniyor da
    const { hata } = await calistir(
      supabase.from("ogretmen_profilleri").upsert(satir, { onConflict: "id" }),
      "Profil kaydetme"
    );
    setIslemde(false);
    if (hata) return;
    setOzet(satir);
    setKayitli(true);
    setTimeout(() => setKayitli(false), 2500);
  };

  const inputStil = {
    width: "100%", padding: "9px 12px", borderRadius: 9, fontSize: 12.5,
    border: "1.5px solid #f0ede8", outline: "none", boxSizing: "border-box",
  };
  const etiketStil = {
    fontSize: 11.5, fontWeight: 600, color: "#555", display: "block", marginBottom: 5,
  };

  return (
    <Card id="bolum-ogretmen-profil">
      <SectionTitle
        title={`Profilim${ozet?.brans ? ` · ${ozet.brans}` : ""}`}
        color={c.mid}
        acik={acik} onToggle={() => setAcik(v => !v)} />

      {/* Branş uyarısı kapalıyken de görünüyor: eskiden kartı açan düğmenin
          üstünde duruyordu, düğme kalkınca eksik branşı hatırlatan hiçbir
          şey kalmazdı. Branş girilince satır kendiliğinden kayboluyor. */}
      {!acik && !loading && !ozet?.brans && (
        <div style={{
          marginTop: 8, padding: "8px 11px", borderRadius: 9,
          background: "#FFF7E6", color: "#854F0B", fontSize: 11.5, lineHeight: 1.45,
        }}>
          🎓 Branşınızı ekleyin — öğrencileriniz görebilsin.
        </div>
      )}

      {!acik ? null : loading ? (
        <div style={{ fontSize: 12.5, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
          Yükleniyor...
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={etiketStil}>Branş</label>
              <input list="brans-listesi" value={form.brans} style={inputStil}
                onChange={e => setForm(f => ({ ...f, brans: e.target.value }))}
                placeholder="Matematik" />
              <datalist id="brans-listesi">
                {BRANSLAR.map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
            <div style={{ width: 110 }}>
              <label style={etiketStil}>Deneyim (yıl)</label>
              <input type="number" min="0" max="70" value={form.deneyim_yili} style={inputStil}
                onChange={e => setForm(f => ({ ...f, deneyim_yili: e.target.value }))}
                placeholder="—" />
            </div>
          </div>

          <div>
            <label style={etiketStil}>Unvan</label>
            <input list="unvan-listesi" value={form.unvan} style={inputStil}
              onChange={e => setForm(f => ({ ...f, unvan: e.target.value }))}
              placeholder="Eğitim Koçu" />
            <datalist id="unvan-listesi">
              {UNVANLAR.map(u => <option key={u} value={u} />)}
            </datalist>
          </div>

          <div>
            <label style={etiketStil}>Hakkımda</label>
            <textarea value={form.hakkinda} rows={3}
              style={{ ...inputStil, resize: "vertical", fontFamily: "inherit" }}
              onChange={e => setForm(f => ({ ...f, hakkinda: e.target.value }))}
              placeholder="Öğrencilerinizin görebileceği kısa bir tanıtım" />
          </div>

          <div style={{ fontSize: 10.5, color: "#aaa", lineHeight: 1.5 }}>
            Bu bilgiler öğrencilerinize ve velilerine görünür. Kişisel
            iletişim bilgisi yazmayın — mesajlaşma uygulama içinden yapılıyor.
          </div>

          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <button onClick={kaydet} disabled={islemde} style={{
              flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
              background: c.bg, color: "#fff", fontSize: 12.5, fontWeight: 700,
              cursor: islemde ? "default" : "pointer", opacity: islemde ? 0.7 : 1,
            }}>{islemde ? "Kaydediliyor..." : "Kaydet"}</button>
          </div>

          {kayitli && (
            <div style={{
              fontSize: 11.5, color: "#1A6B3C", background: "#E8F9F0",
              padding: "8px 11px", borderRadius: 9, textAlign: "center", fontWeight: 600,
            }}>Profiliniz kaydedildi</div>
          )}
        </div>
      )}
    </Card>
  );
}
