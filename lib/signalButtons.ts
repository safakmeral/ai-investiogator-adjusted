// =====================================================================
// Beden Dili ve Ses Tonu Buton Tanımları (AI_Investigator_v4.md §5.3-5.4)
// 11 beden dili + 8 ses tonu = 19 buton
// =====================================================================

export interface SignalButton {
  key: string;
  label: string;
  weight: number;       // -1.0 .. 1.0 — stres katkısı (negatif = sakinleştirici)
  rationale: string;
}

// Bölüm 5.3 — 11 beden dili butonu
export const BODY_LANGUAGE_BUTTONS: SignalButton[] = [
  { key: 'dudak_ısırma',           label: 'Dudak ısırma',          weight: 0.8,  rationale: 'Kaygı ve gerginlik belirtisi' },
  { key: 'yüze_el_götürme',        label: 'Yüze / ağza el',        weight: 0.9,  rationale: 'Bilinçdışı engelleme refleksi' },
  { key: 'göz_kaçırma',            label: 'Göz kaçırma',           weight: 0.6,  rationale: 'Rahatsızlık, kaçınma' },
  { key: 'gözleri_sık_kırpma',     label: 'Sık göz kırpma',        weight: 0.8,  rationale: 'Yüksek kaygı' },
  { key: 'çeneyi_sıkma',           label: 'Çeneyi / dişleri sıkma', weight: 0.7, rationale: 'Öfke, gerilim' },
  { key: 'kolları_kavuşturdu',     label: 'Kolları kavuşturma',    weight: 0.5,  rationale: 'Savunmacı pozisyon' },
  { key: 'öne_eğilme',             label: 'Öne eğilme',            weight: 0.6,  rationale: 'Saldırgan savunma' },
  { key: 'arkasına_yaslanma',      label: 'Arkaya yaslanma',       weight: 0.4,  rationale: 'Mesafe koyma' },
  { key: 'kıpırdanma',             label: 'Kıpırdanma',            weight: 0.7,  rationale: 'Kaygı, sabırsızlık' },
  { key: 'eller_masada_sabit',     label: 'Eller masada sabit',    weight: -0.3, rationale: 'Kontrollü sakinlik (düşürür)' },
  { key: 'titreme',                label: 'Titreme',               weight: 0.9,  rationale: 'Çok yüksek stres' },
];

// Bölüm 5.4 — 8 ses tonu butonu
export const VOICE_TONE_BUTTONS: SignalButton[] = [
  { key: 'normal',                 label: 'Normal',                weight: 0.0,  rationale: 'Stres yok' },
  { key: 'sinirlendi',             label: 'Sinirlendi',            weight: 0.7,  rationale: 'Savunmacı tepki' },
  { key: 'ani_sakinleşti',         label: 'Ani sakinleşti',        weight: 0.6,  rationale: 'Kontrol altına alma çabası' },
  { key: 'duygusallaştı',          label: 'Duygusallaştı / ağladı', weight: 0.5, rationale: 'Duygusal yük' },
  { key: 'sesi_titredi',           label: 'Sesi titredi',          weight: 0.8,  rationale: 'Yüksek stres' },
  { key: 'sesi_yükseldi',          label: 'Sesi yükseldi',         weight: 0.7,  rationale: 'Savunmacı, saldırgan' },
  { key: 'fısıldadı',              label: 'Fısıldadı / sesi kısıldı', weight: 0.6, rationale: 'İçe çekilme' },
  { key: 'cevap_zorlandı',         label: 'Cevap vermekte zorlandı', weight: 0.7, rationale: 'Kaçınma + stres' },
];

// Hızlı arama haritaları
export const BODY_LANGUAGE_MAP: Record<string, SignalButton> = Object.fromEntries(
  BODY_LANGUAGE_BUTTONS.map((b) => [b.key, b]),
);

export const VOICE_TONE_MAP: Record<string, SignalButton> = Object.fromEntries(
  VOICE_TONE_BUTTONS.map((b) => [b.key, b]),
);

export function getButtonLabel(key: string): string {
  return (
    BODY_LANGUAGE_MAP[key]?.label ?? VOICE_TONE_MAP[key]?.label ?? key
  );
}

export function getButtonWeight(key: string): number {
  return (
    BODY_LANGUAGE_MAP[key]?.weight ?? VOICE_TONE_MAP[key]?.weight ?? 0
  );
}
