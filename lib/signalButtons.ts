// =====================================================================
// Otomatik Sinyal Tanımları
// Sinyaller artık kamera (DeepFace + MediaPipe) ve ses (librosa) ile
// Python microservice tarafından otomatik tespit edilir. Bu dosya yalnızca
// key → label ve key → ağırlık eşlemelerini sağlar.
// =====================================================================

export interface SignalDef {
  key: string;
  label: string;
  weight: number;       // -1.0 .. 1.0 — stres katkısı (negatif = sakinleştirici)
  rationale: string;
}

// Kameradan otomatik tespit edilen beden dili sinyalleri (DeepFace + MediaPipe)
export const BODY_LANGUAGE_SIGNALS: SignalDef[] = [
  { key: 'korku_ifadesi',       label: 'Korku ifadesi',         weight: 0.85, rationale: 'Yüksek stres göstergesi (DeepFace fear)' },
  { key: 'öfke_ifadesi',        label: 'Öfke ifadesi',          weight: 0.75, rationale: 'Savunmacı/saldırgan tutum (DeepFace angry)' },
  { key: 'üzgün_ifade',         label: 'Üzgün ifade',           weight: 0.60, rationale: 'Suçluluk/teslimiyet (DeepFace sad)' },
  { key: 'göz_kaçırma',         label: 'Göz kaçırma',           weight: 0.65, rationale: 'Kameradan yüz yön sapması' },
  { key: 'kolları_kavuşturdu',  label: 'Kolları kavuşturma',    weight: 0.50, rationale: 'Savunmacı pozisyon (MediaPipe Pose)' },
  { key: 'öne_eğilme',          label: 'Öne eğilme',            weight: 0.55, rationale: 'Saldırgan savunma' },
  { key: 'arkasına_yaslanma',   label: 'Arkaya yaslanma',       weight: 0.40, rationale: 'Mesafe koyma' },
  { key: 'kıpırdanma',          label: 'Kıpırdanma',            weight: 0.70, rationale: 'Frame-arası yüksek hareket' },
  { key: 'yüze_el_götürme',     label: 'Yüze / ağza el',        weight: 0.80, rationale: 'Bilinçdışı engelleme refleksi' },
  { key: 'eller_masada_sabit',  label: 'Eller masada sabit',    weight: -0.30, rationale: 'Kontrollü sakinlik (stres düşürür)' },
  { key: 'dudak_ısırma',        label: 'Dudak ısırma',          weight: 0.70, rationale: 'Dudak landmark deformasyonu' },
];

// Sesten otomatik tespit edilen ses tonu sinyalleri (librosa)
export const VOICE_TONE_SIGNALS: SignalDef[] = [
  { key: 'sesi_yükseldi',       label: 'Sesi yükseldi',         weight: 0.75, rationale: 'RMS enerji baseline üstünde' },
  { key: 'fısıldadı',           label: 'Fısıldadı',             weight: 0.60, rationale: 'RMS enerji baseline altında' },
  { key: 'sesi_titredi',        label: 'Sesi titredi',          weight: 0.80, rationale: 'F0 (pitch) yüksek varyans' },
  { key: 'cevap_zorlandı',      label: 'Cevap vermekte zorlandı', weight: 0.70, rationale: 'Sessizlik oranı yüksek' },
];

export const BODY_LANGUAGE_MAP: Record<string, SignalDef> = Object.fromEntries(
  BODY_LANGUAGE_SIGNALS.map((b) => [b.key, b]),
);

export const VOICE_TONE_MAP: Record<string, SignalDef> = Object.fromEntries(
  VOICE_TONE_SIGNALS.map((b) => [b.key, b]),
);

export function getSignalLabel(key: string): string {
  return BODY_LANGUAGE_MAP[key]?.label ?? VOICE_TONE_MAP[key]?.label ?? key;
}

export function getSignalWeight(key: string): number {
  return BODY_LANGUAGE_MAP[key]?.weight ?? VOICE_TONE_MAP[key]?.weight ?? 0;
}

// Geriye dönük uyumluluk — eski isimle çağıran kod varsa
export const getButtonLabel = getSignalLabel;
export const getButtonWeight = getSignalWeight;
