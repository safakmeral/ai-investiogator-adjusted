// =====================================================================
// Adaptif Ağırlık Sistemi — Plandaki kararımıza göre düzeltilmiş B Seçeneği
// Hangi kaynak (AI / polis) yüksek tahmin yapıp taktik işe yaradıysa o
// kaynağı ödüllendir; aksi halde hafif cezalandır.
// Seans arası kalıcı (adaptive_weights tablosunda saklanır).
// =====================================================================

import type { AdaptiveWeights, AdaptiveWeightsRow } from './types';

const MIN = 0.25;
const MAX = 0.75;

export function clampWeight(w: number): number {
  return Math.max(MIN, Math.min(MAX, w));
}

/**
 * Tek bir taktik gözlemine göre ağırlıkları güncelle.
 *
 * @param tacticScore   Hesaplanan taktik etkinlik skoru (-100..100)
 * @param aiInput       O hamlenin tetiklendiği cevaptaki AI ham stres skoru (0..1)
 * @param policeInput   O hamlenin tetiklendiği cevaptaki polis ham stres skoru (0..1)
 * @param current       Mevcut ağırlıklar
 */
export function updateAdaptiveWeights(
  tacticScore: number,
  aiInput: number,
  policeInput: number,
  current: AdaptiveWeights,
): AdaptiveWeights {
  // Etkisiz hamleler için minik bir nötr bölge
  if (Math.abs(tacticScore) < 5) return current;

  const step = tacticScore > 0 ? 0.02 : -0.01;
  const dominant: 'ai' | 'police' = aiInput >= policeInput ? 'ai' : 'police';

  let { ai, police } = current;
  if (dominant === 'ai') {
    ai = clampWeight(ai + step);
  } else {
    police = clampWeight(police + step);
  }

  // Toplam = 1 olacak şekilde normalize et
  const total = ai + police;
  return { ai: ai / total, police: police / total };
}

/** O hamleye damgasını vuran kaynağı belirle. */
export function dominantSource(
  aiInput: number,
  policeInput: number,
): 'ai' | 'police' {
  return aiInput >= policeInput ? 'ai' : 'police';
}

/**
 * adaptive_weights tablosundan en güncel satırı domain tipine çevir.
 */
export function rowToWeights(row: AdaptiveWeightsRow): AdaptiveWeights {
  return { ai: row.ai_weight, police: row.police_weight };
}

export const DEFAULT_WEIGHTS: AdaptiveWeights = { ai: 0.5, police: 0.5 };
