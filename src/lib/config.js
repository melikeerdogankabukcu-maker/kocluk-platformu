// Python (FastAPI) analiz backend'inin adresi.
// .env dosyasında VITE_API_URL tanımlanırsa onu kullanır, tanımlanmazsa
// yerel geliştirme ortamındaki varsayılan adrese (localhost:8000) düşer.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
