// Net hesabı: yanlışların doğruyu götürme oranı sınav türüne göre değişir.
// YKS (TYT/AYT): 4 yanlış 1 doğruyu götürür · LGS: 3 yanlış 1 doğruyu götürür
export const YANLIS_KATSAYI = { TYT: 4, AYT: 4, LGS: 3 };

export function netHesapla(dogru, yanlis, examType) {
  const d = parseFloat(dogru)  || 0;
  const y = parseFloat(yanlis) || 0;
  const k = YANLIS_KATSAYI[examType];
  const net = k ? d - y / k : d;          // Okul sınavı vb. için ceza yok
  return Math.round(net * 100) / 100;
}

// "4 yanlış 1 doğruyu götürür" gibi açıklama metni
export function netKuraliMetni(examType) {
  const k = YANLIS_KATSAYI[examType];
  return k ? `${k} yanlış 1 doğruyu götürür` : "Yanlışlar doğruyu götürmez";
}
