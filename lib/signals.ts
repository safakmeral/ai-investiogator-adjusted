// =====================================================================
// Sinyal Yorumlama Katmanı
// Otomatik tespit edilen beden dili + ses tonu kombinasyonlarını anlamsal
// taktik önerisine çevirir.
// =====================================================================

import {
  BODY_LANGUAGE_MAP,
  VOICE_TONE_MAP,
  getSignalLabel,
} from './signalButtons';
import type { SignalInterpretation } from './types';

interface SignalMeaning {
  meaning: string;
  tactical_implication: string;
  suggested_tactic: string;
}

// Yeni otomatik sinyal kombinasyonları
export const signalMeaningMap: Record<string, SignalMeaning> = {
  'korku_ifadesi+göz_kaçırma': {
    meaning: 'Korku altında kaçınma. Şüpheli bu konuda savunmasız ve doğrudan göz temasından kaçınıyor.',
    tactical_implication: 'Baskıyı artır, bu konuya odaklan.',
    suggested_tactic: 'exploit_weakness',
  },
  'korku_ifadesi+sesi_titredi': {
    meaning: 'Korku kırılma noktası. Yüksek stres + ses titremesi açık zayıflık sinyali.',
    tactical_implication: 'Bu cevabın üzerine git, şüpheli kırılmak üzere.',
    suggested_tactic: 'exploit_weakness',
  },
  'öfke_ifadesi+kolları_kavuşturdu': {
    meaning: 'Savunmacı düşmanlık. Şüpheli kapanıyor, doğrudan baskı duvar örecek.',
    tactical_implication: 'Önce gerilimi düşür, sonra yumuşak baskı uygula.',
    suggested_tactic: 'tactical_break',
  },
  'kıpırdanma+yüze_el_götürme': {
    meaning: 'Aldatıcı huzursuzluk. Bilinçdışı engelleme refleksi + sürekli hareket.',
    tactical_implication: 'Doğrudan yüzleştir, detay sorularıyla sıkıştır.',
    suggested_tactic: 'cognitive_overload',
  },
  'üzgün_ifade+cevap_zorlandı': {
    meaning: 'Suçluluk + tereddüt. Vicdan azabı yüzeye çıkıyor, cevap aramakta zorlanıyor.',
    tactical_implication: 'Empati köprüsü kur, itirafı kolaylaştır.',
    suggested_tactic: 'minimization',
  },
  'göz_kaçırma+dudak_ısırma': {
    meaning: 'Gizleme girişimi. Bilgiyi tutuyor, dudak ısırma bilinçdışı engelleme refleksi.',
    tactical_implication: 'Spesifik detaylara odaklan, hazırlanmadığı noktayı zorla.',
    suggested_tactic: 'exploit_weakness',
  },
  'sesi_yükseldi+öne_eğilme': {
    meaning: 'Saldırgan savunma. Şüpheli köşeye sıkıştığını hissediyor.',
    tactical_implication: 'Sakin kal, soruyu tekrarla. Öfke geçtiğinde boşluktan gir.',
    suggested_tactic: 'tactical_break',
  },
  'fısıldadı+üzgün_ifade': {
    meaning: 'Duygusal çöküş. İçe çekilme + hüzün — itiraf eşiğine yaklaşıyor.',
    tactical_implication: 'Suçlamayı bırak, insani tarafına git.',
    suggested_tactic: 'minimization',
  },
  'eller_masada_sabit+arkasına_yaslanma': {
    meaning: 'Kontrollü cevap. Şüpheli duygularını bastırıyor, hikaye önceden hazırlanmış.',
    tactical_implication: 'Detay tuzağı kur, hazırlanmadığı noktalara gir.',
    suggested_tactic: 'story_locking',
  },
  'korku_ifadesi+cevap_zorlandı': {
    meaning: 'Yüksek stres altında bilgiye erişim zorluğu. Yalan üretmekte zorlanıyor.',
    tactical_implication: 'Sessizlikle bekle, cevabı düşünmesi için zaman bırakma.',
    suggested_tactic: 'silence_pressure',
  },
  'öfke_ifadesi+sesi_yükseldi': {
    meaning: 'Açık öfke patlaması. Kontrol kaybediyor, savunmacı.',
    tactical_implication: 'Provokasyona düşme, sakin tonla devam et.',
    suggested_tactic: 'tactical_break',
  },
};

// Yüksek stres kombinasyonları — kırılma noktası bayrağı
const BREAKING_POINT_PATTERNS: string[][] = [
  ['korku_ifadesi', 'sesi_titredi'],
  ['üzgün_ifade', 'cevap_zorlandı', 'göz_kaçırma'],
  ['kıpırdanma', 'yüze_el_götürme', 'sesi_titredi'],
  ['korku_ifadesi', 'cevap_zorlandı'],
];

function detectBreakingPoint(signals: string[]): boolean {
  for (const pat of BREAKING_POINT_PATTERNS) {
    if (pat.every((s) => signals.includes(s))) return true;
  }
  // 3+ yüksek ağırlıklı (≥0.65) sinyal
  const highCount = signals.filter((s) => {
    const w = BODY_LANGUAGE_MAP[s]?.weight ?? VOICE_TONE_MAP[s]?.weight ?? 0;
    return w >= 0.65;
  }).length;
  return highCount >= 3;
}

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
      meaning: `Belirgin stres sinyali: ${getSignalLabel(topKey)}. Şüpheli huzursuz.`,
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
    meaning: `Orta düzey gözlem: ${getSignalLabel(topKey)}.`,
    tactical_implication: 'Mevcut taktiğe devam et, sinyalleri izlemeye al.',
    suggested_tactic: 'funnel_technique',
    signals: all,
    is_breaking_point: false,
  };
}

/**
 * Polis stres ham skoru (0-1):
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
  return Math.max(0, Math.min(1, raw));
}

/**
 * Sinyal blokunu prompt'a koymak için metne dönüştürür.
 */
export function formatSignalBlockForPrompt(
  interpretation: SignalInterpretation | null,
  answerText: string,
): string {
  if (!interpretation) {
    return `[SİNYAL ANALİZİ]\nCevap: "${answerText}"\nGözlemlenen sinyal yok.`;
  }
  const labels = interpretation.signals.map(getSignalLabel).join(', ');
  return [
    '[SİNYAL ANALİZİ — bu cevaba özgü, otomatik tespit]',
    '',
    'Şüpheli şu cevabı verirken kamera + ses analizi şu sinyalleri tespit etti:',
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
