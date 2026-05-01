// =====================================================================
// Sinyal Yorumlama Katmanı (AI_Investigator_v4.md §5.6)
// Beden dili + ses tonu kombinasyonlarını anlamsal taktik önerisine çevirir.
// 3 hatalı taktik referansı düzeltildi:
//   empathy_switch → feigned_sympathy
//   detail_trap    → story_locking
//   exploit_weakness → kalır (15. taktik olarak eklendi)
// =====================================================================

import {
  BODY_LANGUAGE_MAP,
  VOICE_TONE_MAP,
  getButtonLabel,
} from './signalButtons';
import type { SignalInterpretation } from './types';

interface SignalMeaning {
  meaning: string;
  tactical_implication: string;
  suggested_tactic: string;
}

// Spesifik kombinasyon haritası
export const signalMeaningMap: Record<string, SignalMeaning> = {
  'dudak_ısırma+sesi_titredi': {
    meaning:
      'Yüksek korku + bilgi gizleme refleksi. Şüpheli bu spesifik noktada kırılıyor.',
    tactical_implication: 'Bu cevabın üzerine git. Şüpheli bu konuda savunmasız.',
    suggested_tactic: 'exploit_weakness',
  },
  'ani_sakinleşti+eller_masada_sabit': {
    meaning:
      'Kontrollü yanıltma. Şüpheli duygularını bastırıyor, hikaye önceden hazırlanmış.',
    tactical_implication:
      'Sakinlik gerçek değil. Detay tuzağı kur, hazırlanmadığı noktalara gir.',
    suggested_tactic: 'story_locking',
  },
  'kolları_kavuşturdu+göz_kaçırma': {
    meaning: 'Savunmaya çekildi. Doğrudan baskı şu an işe yaramaz, duvar örüyor.',
    tactical_implication: 'Baskıyı bırak. Empati köprüsü kur, güven oluştur.',
    suggested_tactic: 'feigned_sympathy',
  },
  'duygusallaştı+sesi_titredi': {
    meaning: 'Duygusal kırılma. Vicdan azabı veya korku yüzeye çıkıyor.',
    tactical_implication: 'Suçlamayı bırak. Şüphelinin insani tarafına git, itirafı kolaylaştır.',
    suggested_tactic: 'minimization',
  },
  'sinirlendi+sesi_yükseldi': {
    meaning: 'Savunmacı saldırı. Köşeye sıkıştığını hissediyor, kontrol kaybediyor.',
    tactical_implication: 'Sakin kal, baskıyı düşür. Öfke geçince boşluktan gir.',
    suggested_tactic: 'tactical_break',
  },
};

// Bölüm 5.5 — yüksek stres kombinasyonları (kırılma noktası bayrağı)
const BREAKING_POINT_PATTERNS: string[][] = [
  ['dudak_ısırma', 'sesi_yükseldi', 'kıpırdanma'],
  ['yüze_el_götürme', 'sesi_titredi'],
  ['gözleri_sık_kırpma', 'titreme'],
];

function detectBreakingPoint(signals: string[]): boolean {
  // Spesifik desenler
  for (const pat of BREAKING_POINT_PATTERNS) {
    if (pat.every((s) => signals.includes(s))) return true;
  }
  // 3+ yüksek ağırlıklı (≥0.7) sinyal
  const highCount = signals.filter((s) => {
    const w = BODY_LANGUAGE_MAP[s]?.weight ?? VOICE_TONE_MAP[s]?.weight ?? 0;
    return w >= 0.7;
  }).length;
  return highCount >= 3;
}

/**
 * Kombinasyon eşleşmesi için tüm beden dili x ses tonu permütasyonlarını dener.
 * Bulamazsa ilk yüksek ağırlıklı sinyale göre genel yorum üretir.
 */
export function interpretSignals(
  bodyLanguage: string[],
  voiceTone: string[],
): SignalInterpretation | null {
  const all = [...bodyLanguage, ...voiceTone];
  if (all.length === 0) return null;

  const isBreaking = detectBreakingPoint(all);

  // Spesifik kombinasyon ara (bl+vt çapraz)
  for (const bl of bodyLanguage) {
    for (const vt of voiceTone) {
      const k = `${bl}+${vt}`;
      const match = signalMeaningMap[k];
      if (match) {
        return {
          ...match,
          signals: all,
          is_breaking_point: isBreaking,
        };
      }
    }
  }
  // Sadece beden dili veya sadece ses tonu içinde de ara
  const keys = [
    ...bodyLanguage.flatMap((a) => bodyLanguage.filter((b) => b !== a).map((b) => `${a}+${b}`)),
    ...voiceTone.flatMap((a) => voiceTone.filter((b) => b !== a).map((b) => `${a}+${b}`)),
  ];
  for (const k of keys) {
    const m = signalMeaningMap[k];
    if (m) return { ...m, signals: all, is_breaking_point: isBreaking };
  }

  // Genel yorum: en yüksek ağırlıklı sinyale göre
  let topKey = all[0];
  let topWeight = -Infinity;
  for (const s of all) {
    const w = BODY_LANGUAGE_MAP[s]?.weight ?? VOICE_TONE_MAP[s]?.weight ?? 0;
    if (w > topWeight) {
      topWeight = w;
      topKey = s;
    }
  }

  if (topWeight >= 0.7) {
    return {
      meaning: `Belirgin stres sinyali: ${getButtonLabel(topKey)}. Şüpheli huzursuz.`,
      tactical_implication:
        'Konuyu bırakma, baskıyı koru ama analitik sorularla derinleştir.',
      suggested_tactic: isBreaking ? 'exploit_weakness' : 'cognitive_overload',
      signals: all,
      is_breaking_point: isBreaking,
    };
  }

  if (topWeight <= 0) {
    return {
      meaning: 'Şüpheli sakin ve kontrollü görünüyor.',
      tactical_implication:
        'Doğrudan baskı işe yaramaz. Aptala yatma veya huni tekniğiyle veri topla.',
      suggested_tactic: 'columbo_method',
      signals: all,
      is_breaking_point: false,
    };
  }

  return {
    meaning: `Orta düzey gözlem: ${getButtonLabel(topKey)}.`,
    tactical_implication: 'Mevcut taktiğe devam et, sinyalleri izlemeye al.',
    suggested_tactic: 'funnel_technique',
    signals: all,
    is_breaking_point: false,
  };
}

/**
 * Polis stres ham skoru (0-1) — Bölüm 5.2 formülü:
 *   max(weights) * 0.6 + mean(weights) * 0.4
 * Negatif ağırlıklar (eller masada sabit) skoru düşürür.
 */
export function computePoliceStress(signals: string[]): number {
  if (signals.length === 0) return 0;
  const weights = signals.map(
    (s) => BODY_LANGUAGE_MAP[s]?.weight ?? VOICE_TONE_MAP[s]?.weight ?? 0,
  );
  const max = Math.max(...weights);
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  const raw = max * 0.6 + mean * 0.4;
  // 0..1 aralığına sıkıştır
  return Math.max(0, Math.min(1, raw));
}

/**
 * Sinyal blokunu prompt'a koymak için metne dönüştürür (§5.6).
 */
export function formatSignalBlockForPrompt(
  interpretation: SignalInterpretation | null,
  answerText: string,
): string {
  if (!interpretation) {
    return `[SİNYAL ANALİZİ]\nCevap: "${answerText}"\nGözlemlenen sinyal yok.`;
  }
  const labels = interpretation.signals.map(getButtonLabel).join(', ');
  return [
    '[SİNYAL ANALİZİ — bu cevaba özgü]',
    '',
    'Şüpheli şu cevabı verirken bu sinyaller gözlemlendi:',
    `Cevap: "${answerText}"`,
    `Gözlemlenen sinyaller: ${labels}`,
    `Kombinasyon anlamı: ${interpretation.meaning}`,
    `Taktik yönlendirme: ${interpretation.tactical_implication} — ${interpretation.suggested_tactic}`,
    interpretation.is_breaking_point
      ? 'KIRILMA NOKTASI BAYRAĞI: Bu noktada şüpheli kırılma eşiğinde.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
