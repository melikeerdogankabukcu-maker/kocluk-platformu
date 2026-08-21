import { useState } from "react";
import { useSinavAnalizi } from "../hooks/useSinavAnalizi";
import Card from "./Card";
import Modal from "./Modal";
import LineChart from "./LineChart";

// Sınav Analizi: net gelişim grafikleri (sınav türüne göre sekmeli) +
// sınav/test/görev verilerini çapraz eşleştiren konu bazlı odak listesi.
//
// variant="kart"  → öğrenci/veli panelinde tıklanabilir özet kartı
// variant="buton" → öğretmen panelinde, açılan öğrenci satırı içinde küçük buton
// hemenYukle=false → veri yalnızca modal açılınca çekilir (öğretmen listesi için)
export default function SinavAnalizi({
  studentId, color: c, variant = "kart", hemenYukle = true, baslik = "Sınav Analizi",
}) {
  const [acik, setAcik] = useState(false);
  const [secilenTur, setSecilenTur] = useState(null);
  const [acikDers, setAcikDers] = useState(null);
  const { veri, loading, hata } = useSinavAnalizi(studentId, hemenYukle || acik);

  const turler   = veri?.turler ?? {};
  const turAdlari = Object.keys(turler);

  // Varsayılan sekme: en güncel sınavı olan tür
  const enGuncelTur = turAdlari.reduce((iyi, t) => {
    const sonTarih = turler[t]?.seri?.at(-1)?.tarih ?? "";
    const iyiTarih = iyi ? (turler[iyi]?.seri?.at(-1)?.tarih ?? "") : "";
    return sonTarih > iyiTarih ? t : iyi;
  }, null);

  const aktifTur = (secilenTur && turAdlari.includes(secilenTur)) ? secilenTur : enGuncelTur;
  const aktif    = aktifTur ? turler[aktifTur] : null;
  const ozet     = aktif?.ozet;

  const odak      = veri?.odak_konular ?? [];
  const ihmal     = veri?.ihmal_edilen_dersler ?? [];
  const dersDetay = veri?.ders_detay ?? {};
  const osym      = veri?.osym_puan ?? {};
  const osymVar   = Object.keys(osym).length > 0;

  const degisimRozet = (d) => {
    if (d == null) return null;
    const artis = d > 0;
    const notr  = Math.abs(d) < 0.5;
    return {
      metin: `${artis ? "+" : ""}${d}`,
      ok:    notr ? "→" : artis ? "↑" : "↓",
      bg:    notr ? "#f5f2ee" : artis ? "#E8F9F0" : "#FFF0F0",
      renk:  notr ? "#888"    : artis ? "#1A6B3C" : "#A32D2D",
    };
  };

  // --- Tetikleyici ---
  const teaser = ozet
    ? `${aktifTur} · son ${ozet.son_net ?? "—"} net${ozet.degisim != null ? ` · ${ozet.degisim > 0 ? "+" : ""}${ozet.degisim}` : ""}`
    : hata ? "Analiz alınamadı — backend çalışıyor mu?"
    : loading ? "Yükleniyor..."
    : "Henüz sınav kaydı yok";

  const tetikleyici = variant === "buton" ? (
    <button onClick={() => setAcik(true)} style={{
      fontSize: 11, padding: "4px 12px", borderRadius: 99, fontWeight: 600,
      border: `1px solid ${c.mid}55`, background: "transparent", color: c.mid, cursor: "pointer",
    }}>📊 Sınav Analizi</button>
  ) : (
    <Card>
      <div onClick={() => setAcik(true)} style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>{baslik}</div>
          <div style={{ fontSize: 12, color: "#888", marginTop: 3 }}>{teaser}</div>
        </div>
        <span style={{ fontSize: 20, color: c.mid, fontWeight: 700 }}>›</span>
      </div>
    </Card>
  );

  return (
    <>
      {tetikleyici}

      {acik && (
        <Modal title={baslik} onClose={() => setAcik(false)}>
          {loading ? (
            <div style={{ fontSize: 13, color: "#aaa", padding: "16px 0", textAlign: "center" }}>Analiz yükleniyor...</div>
          ) : hata ? (
            <div style={{ fontSize: 13, color: "#aaa", padding: "16px 0", textAlign: "center" }}>
              Analiz alınamadı — analiz servisi çalışmıyor olabilir.
            </div>
          ) : turAdlari.length === 0 ? (
            <div style={{ padding: "16px 0", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: 13, color: "#666" }}>Henüz sınav kaydı yok</div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>
                Sınav sonucu ekledikçe net gelişimin burada grafiğe dönüşecek.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Sınav türü sekmeleri */}
              {turAdlari.length > 1 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {turAdlari.map(t => (
                    <button key={t} onClick={() => setSecilenTur(t)} style={{
                      flex: 1, minWidth: 70, padding: "7px 0", borderRadius: 10,
                      fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: `2px solid ${aktifTur === t ? c.bg : "#f0ede8"}`,
                      background: aktifTur === t ? c.bg : "#fff",
                      color: aktifTur === t ? "#fff" : "#888",
                    }}>{t}</button>
                  ))}
                </div>
              )}

              {/* Özet istatistikler */}
              {ozet && (
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    ["Sınav",     ozet.sinav_sayisi,          "kayıt"],
                    ["Son net",   ozet.son_net   ?? "—",      "güncel"],
                    ["En yüksek", ozet.en_yuksek ?? "—",      "rekor"],
                    ["Ortalama",  ozet.ortalama  ?? "—",      "genel"],
                  ].map(([etiket, deger, alt]) => (
                    <div key={etiket} style={{
                      flex: 1, background: "#fafaf8", borderRadius: 10,
                      padding: "9px 6px", textAlign: "center",
                    }}>
                      <div style={{ fontSize: 9.5, color: "#aaa", marginBottom: 2 }}>{etiket}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: c.text }}>{deger}</div>
                      <div style={{ fontSize: 9.5, color: "#bbb" }}>{alt}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ÖSYM ham puanları */}
              {osymVar && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>
                    ÖSYM PUANI{" "}
                    <span style={{ fontWeight: 500, color: "#bbb" }}>
                      (son denemelere göre
                      {{ sayisal: " · Sayısal", esit_agirlik: " · Eşit Ağırlık", sozel: " · Sözel" }[veri?.alan_tercihi] ?? ""})
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(osym).map(([alan, p]) => (
                      <div key={alan} style={{
                        padding: "10px 12px", borderRadius: 10,
                        background: "#fafaf8", border: "1px solid #f0ede8",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#333" }}>
                            {alan} <span style={{ fontWeight: 500, color: "#aaa", fontSize: 11 }}>ham puan</span>
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: c.text }}>{p.ham}</span>
                        </div>

                        {p.yerlestirme != null && (
                          <div style={{
                            display: "flex", justifyContent: "space-between", alignItems: "baseline",
                            marginTop: 5, paddingTop: 5, borderTop: "1px solid #f0ede8",
                          }}>
                            <span style={{ fontSize: 11.5, color: "#666" }}>
                              Yerleştirme <span style={{ color: "#bbb" }}>(TYT %40 + AYT %60)</span>
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: c.mid }}>{p.yerlestirme}</span>
                          </div>
                        )}

                        {/* Grup bazlı katkı dökümü */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
                          {Object.entries(p.gruplar).map(([g, d]) => (
                            <span key={g} style={{
                              fontSize: 10, padding: "2px 8px", borderRadius: 99,
                              background: "#fff", border: "1px solid #f0ede8", color: "#777",
                            }}>{g}: {d.net} net → {d.katki}</span>
                          ))}
                        </div>
                        {p.sinav && (
                          <div style={{ fontSize: 10, color: "#bbb", marginTop: 5 }}>{p.sinav}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Net gelişim grafiği */}
              {aktif?.seri?.length > 0 && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#888" }}>NET GELİŞİMİ</span>
                    {(() => {
                      const r = degisimRozet(ozet?.degisim);
                      return r && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 99,
                          background: r.bg, color: r.renk,
                        }}>{r.ok} {r.metin} net (ilk sınava göre)</span>
                      );
                    })()}
                  </div>
                  {aktif.seri.length === 1 ? (
                    <div style={{ fontSize: 12, color: "#aaa", padding: "12px 0", textAlign: "center" }}>
                      Trend görmek için en az 2 sınav gerekiyor
                    </div>
                  ) : (
                    <LineChart points={aktif.seri} color={c.bg} />
                  )}
                </div>
              )}

              {/* Ders bazlı gelişim */}
              {aktif?.ders_gelisim?.length > 0 && (() => {
                const enYuksek = Math.max(...aktif.ders_gelisim.map(g => g.son_net), 1);
                return (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>
                      DERS BAZLI ANALİZ <span style={{ fontWeight: 500, color: "#bbb" }}>(zayıftan güçlüye · detay için tıkla)</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                      {aktif.ders_gelisim.map(g => {
                        const r = degisimRozet(g.degisim);
                        const barRenk = g.trend === "dusus" ? "#E24B4A" : g.trend === "artis" ? c.mid : "#c9c4bc";
                        const dersAcik = acikDers === g.ders;
                        const d = dersDetay[g.ders];
                        return (
                          <div key={g.ders}>
                            {/* Özet satır — tıklanınca ders detayı açılır */}
                            <div onClick={() => setAcikDers(dersAcik ? null : g.ders)} style={{ cursor: "pointer" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                                <span style={{ fontSize: 12.5, fontWeight: 600, color: "#333" }}>
                                  <span style={{ color: c.mid, marginRight: 4, fontSize: 10 }}>{dersAcik ? "▾" : "▸"}</span>
                                  {g.ders}
                                </span>
                                <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: "#222" }}>{g.son_net}</span>
                                  {r && (
                                    <span style={{
                                      fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                                      background: r.bg, color: r.renk,
                                    }}>{r.ok} {r.metin}</span>
                                  )}
                                </span>
                              </div>
                              <div style={{ height: 5, borderRadius: 99, background: "#f0ede8", overflow: "hidden" }}>
                                <div style={{
                                  width: `${Math.max((g.son_net / enYuksek) * 100, 2)}%`,
                                  height: "100%", borderRadius: 99, background: barRenk,
                                  transition: "width .5s ease",
                                }} />
                              </div>
                            </div>

                            {/* Ders detayı: kendi net grafiği + test/görev + konu kırılımı */}
                            {dersAcik && (
                              <div style={{
                                marginTop: 8, padding: "12px 12px 10px", borderRadius: 10,
                                background: "#fafaf8", border: "1px solid #f0ede8",
                              }}>
                                {/* Ders özeti */}
                                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                                  {[
                                    ["İlk",      g.ilk_net],
                                    ["Ortalama", g.ortalama],
                                    ["En yüksek", g.en_yuksek],
                                    ["En düşük",  g.en_dusuk],
                                  ].map(([et, dg]) => (
                                    <div key={et} style={{ flex: 1, textAlign: "center" }}>
                                      <div style={{ fontSize: 9, color: "#aaa" }}>{et}</div>
                                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333" }}>{dg}</div>
                                    </div>
                                  ))}
                                </div>

                                {/* Dersin kendi net grafiği */}
                                {g.seri?.length > 1 ? (
                                  <div style={{ marginBottom: 10 }}>
                                    <LineChart points={g.seri} color={barRenk} height={150} />
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 11, color: "#bbb", textAlign: "center", padding: "6px 0 10px" }}>
                                    Bu derste trend için en az 2 sınav gerekiyor
                                  </div>
                                )}

                                {/* Sınav / test doğruluğu + görev tamamlama */}
                                <div style={{ display: "flex", gap: 6, marginBottom: d?.konular?.length ? 10 : 0 }}>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "7px 9px", border: "1px solid #f0ede8" }}>
                                    <div style={{ fontSize: 9, color: "#aaa" }}>SINAV DOĞRULUĞU</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>
                                      {d?.sinav?.dogruluk != null ? `%${d.sinav.dogruluk}` : "—"}
                                    </div>
                                    {d?.sinav?.dogruluk != null && (
                                      <div style={{ fontSize: 9.5, color: "#aaa" }}>
                                        {d.sinav.dogru}D · {d.sinav.yanlis}Y
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "7px 9px", border: "1px solid #f0ede8" }}>
                                    <div style={{ fontSize: 9, color: "#aaa" }}>TEST DOĞRULUĞU</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>
                                      {d?.test?.oran != null ? `%${d.test.oran}` : "—"}
                                    </div>
                                    {d?.test?.soru > 0 && (
                                      <div style={{ fontSize: 9.5, color: "#aaa" }}>{d.test.dogru}/{d.test.soru} soru</div>
                                    )}
                                  </div>
                                  <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "7px 9px", border: "1px solid #f0ede8" }}>
                                    <div style={{ fontSize: 9, color: "#aaa" }}>GÖREV</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>
                                      {d?.gorev?.oran != null ? `%${d.gorev.oran}` : "—"}
                                    </div>
                                    {d?.gorev?.toplam > 0 && (
                                      <div style={{ fontSize: 9.5, color: "#aaa" }}>{d.gorev.tamam}/{d.gorev.toplam} görev</div>
                                    )}
                                  </div>
                                </div>

                                {/* Konu kırılımı */}
                                {d?.konular?.length > 0 && (
                                  <>
                                    <div style={{ fontSize: 9.5, fontWeight: 700, color: "#aaa", marginBottom: 6 }}>
                                      KONULAR <span style={{ fontWeight: 500 }}>(zayıftan güçlüye)</span>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                      {d.konular.map(k => (
                                        <div key={k.konu} style={{
                                          display: "flex", justifyContent: "space-between", alignItems: "center",
                                          gap: 8, fontSize: 11.5,
                                        }}>
                                          <span style={{ color: "#444", minWidth: 0 }}>{k.konu}</span>
                                          <span style={{ display: "flex", gap: 5, flexShrink: 0, alignItems: "center" }}>
                                            {k.sinav_hata > 0 && (
                                              <span style={{
                                                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                                                background: "#FFF0F0", color: "#A32D2D",
                                              }}>
                                                {k.sinav_hata} yanlış
                                                {k.sinav_sayisi > 1 ? ` · ${k.sinav_sayisi} sınavda` : ""}
                                              </span>
                                            )}
                                            {k.sinav_bos > 0 && (
                                              <span style={{
                                                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                                                background: "#F1F4F9", color: "#4A5B73",
                                              }}>{k.sinav_bos} boş</span>
                                            )}
                                            {k.gorev_toplam > 0 && (
                                              <span style={{ fontSize: 10, color: "#888" }}>
                                                {k.gorev_tamam}/{k.gorev_toplam} görev
                                              </span>
                                            )}
                                            {k.test_oran != null && (
                                              <span style={{
                                                fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                                                background: k.test_oran >= 70 ? "#E8F9F0" : k.test_oran >= 50 ? "#FFF7E6" : "#FFF0F0",
                                                color:      k.test_oran >= 70 ? "#1A6B3C" : k.test_oran >= 50 ? "#854F0B" : "#A32D2D",
                                              }}>%{k.test_oran}</span>
                                            )}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </>
                                )}

                                {!d && (
                                  <div style={{ fontSize: 11, color: "#bbb", textAlign: "center", paddingTop: 4 }}>
                                    Bu derste henüz test veya görev kaydı yok
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Odak konular — sınav + test + görev çapraz analizi */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>
                  ODAKLANILACAK KONULAR
                </div>
                {odak.length === 0 ? (
                  <div style={{ fontSize: 12, color: "#bbb", padding: "8px 0", textAlign: "center" }}>
                    Şu an öne çıkan bir eksik konu yok 👍
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {odak.map((o, i) => {
                      const acil = o.oncelik === "yuksek";
                      return (
                        <div key={i} style={{
                          padding: "10px 12px", borderRadius: 10,
                          background: acil ? "#FFF7F7" : "#FFFCF5",
                          border: `1px solid ${acil ? "#F5DEDE" : "#F2E7CE"}`,
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#222" }}>
                                {o.ders} — {o.konu}
                              </div>
                              <div style={{ fontSize: 11, color: "#777", marginTop: 3, lineHeight: 1.5 }}>
                                {o.sinyaller.join(" · ")}
                              </div>
                              {/* Konu kaybı: soru sayısı × kaçırma oranı.
                                  "Sık soru çıkan konu" etiketinin yerini aldı —
                                  artık öğrenciye özel ve sayısı gösterilebiliyor. */}
                              {o.kayip > 0.15 && (
                                <div style={{ fontSize: 10, color: "#7B4FA0", marginTop: 4, fontWeight: 600 }}>
                                  ⬆ Sınav başına ~{o.kayip.toFixed(1)} net kaybı
                                  {o.sinav_sayisi > 0 && (
                                    <span style={{ fontWeight: 500 }}>
                                      {" "}· {o.sinav_sayisi} sınavın {o.kacirma}'inde kaçırdın
                                    </span>
                                  )}
                                  {o.agirlik_kaynak === "manuel" && (
                                    <span style={{ fontWeight: 500 }}> · öğretmen soru sayısı</span>
                                  )}
                                </div>
                              )}
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flexShrink: 0,
                              background: acil ? "#FFF0F0" : "#FFF7E6",
                              color:      acil ? "#A32D2D" : "#854F0B",
                            }}>{acil ? "Acil" : "Orta"}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sınavda zayıf ama hiç çalışma kaydı olmayan dersler */}
              {ihmal.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 8 }}>
                    ÇALIŞMA KAYDI OLMAYAN ZAYIF DERSLER
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {ihmal.map(d => (
                      <div key={d.ders} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 12px", borderRadius: 10, background: "#fafaf8",
                      }}>
                        <span style={{ fontSize: 12.5, color: "#333" }}>
                          {d.ders} <span style={{ color: "#aaa", fontSize: 11 }}>· {d.sinav_turu}</span>
                        </span>
                        <span style={{ fontSize: 11, color: "#888" }}>
                          {d.son_net} net · test/görev kaydı yok
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
