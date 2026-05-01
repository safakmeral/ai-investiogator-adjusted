// =====================================================================
// Metrik Hesaplama Formülleri (AI_Investigator_v4.md §5.2)
// =====================================================================

import type { Metrics, AdaptiveWeights } from './types';

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Çelişki skoru:
 *   yeni = önceki × 0.75 + ağırlık × 25
 *   Ağırlık 0..1 değerinden 0..100 ölçeğine taşınır.
 */
export function updateContradictionScore(prev: number, weight: number): number {
  return clamp(prev * 0.75 + weight * 25, 0, 100);
}

/** Kaçınma skoru: 0.80 / 0.20 */
export function updateAvoidanceScore(prev: number, weight: number): number {
  return clamp(prev * 0.8 + weight * 20, 0, 100);
}

/** Tutarsızlık skoru: 0.80 / 0.20 */
export function updateInconsistencyScore(prev: number, weight: number): number {
  return clamp(prev * 0.8 + weight * 20, 0, 100);
}

/**
 * Stres skoru: hibrit (polis + AI), adaptif ağırlıklı.
 * @param prev          önceki stres skoru (0-100)
 * @param policeRaw     polis ham stres (0-1)
 * @param aiRaw         AI ham stres (0-1)
 * @param weights       adaptif ağırlıklar (toplamı 1.0)
 */
export function updateStressScore(
  prev: number,
  policeRaw: number,
  aiRaw: number,
  weights: AdaptiveWeights,
): number {
  const blended = policeRaw * weights.police + aiRaw * weights.ai;
  // 0..1 -> 0..100 ölçeğinde, 0.70 / 0.30 düzleştirme
  return clamp(prev * 0.7 + blended * 30, 0, 100);
}

/**
 * Tek bir cevaptan tüm metrikleri güncelle.
 */
export function applyAllMetrics(
  prev: Metrics,
  inputs: {
    contradiction_weight: number;
    avoidance_weight: number;
    inconsistency_weight: number;
    police_stress_raw: number;   // 0-1
    ai_stress_raw: number;       // 0-1
    weights: AdaptiveWeights;
  },
): Metrics {
  return {
    contradiction_score: updateContradictionScore(
      prev.contradiction_score,
      inputs.contradiction_weight,
    ),
    avoidance_score: updateAvoidanceScore(
      prev.avoidance_score,
      inputs.avoidance_weight,
    ),
    inconsistency_score: updateInconsistencyScore(
      prev.inconsistency_score,
      inputs.inconsistency_weight,
    ),
    stress_score: updateStressScore(
      prev.stress_score,
      inputs.police_stress_raw,
      inputs.ai_stress_raw,
      inputs.weights,
    ),
  };
}

/**
 * Taktik etkinlik skoru (§5.7).
 * Hedef metriklerin değişim yönü doğru ise pozitif, ters ise negatif.
 */
export function calculateTacticScore(
  before: Metrics,
  after: Metrics,
  target: {
    metrics: Array<keyof Metrics>;
    direction: 'up' | 'down';
  },
): number {
  let total = 0;
  for (const m of target.metrics) {
    const delta = after[m] - before[m];
    total += target.direction === 'down' ? -delta : delta;
  }
  const avg = total / target.metrics.length;
  return clamp(avg, -100, 100);
}
