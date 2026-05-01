// =====================================================================
// Faz Geçiş Mantığı — Plandaki kararımız:
// Çok faktörlü hazırlık skoru + minimum soru koşulu.
// Strateji Katmanı bu sinyali alır ama nihai geçiş kararını AI verir.
// =====================================================================

import type { Metrics, Phase } from './types';

export interface PhaseReadiness {
  ready: boolean;
  confidence: number; // 0.0 - 1.0
  next_phase: Phase | null;
  reason: string;
}

const PHASE_MIN_QUESTIONS: Record<Phase, number> = {
  opening: 3,
  story_locking: 3,
  evidence_pressure: 4,
  confession_approach: Number.POSITIVE_INFINITY, // son faz
};

const NEXT_PHASE: Record<Phase, Phase | null> = {
  opening: 'story_locking',
  story_locking: 'evidence_pressure',
  evidence_pressure: 'confession_approach',
  confession_approach: null,
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function calculatePhaseReadiness(
  metrics: Metrics,
  currentPhase: Phase,
  questionsInPhase: number,
): PhaseReadiness {
  const next = NEXT_PHASE[currentPhase];
  if (!next) {
    return {
      ready: false,
      confidence: 0,
      next_phase: null,
      reason: 'Şüpheli zaten itiraf yaklaşımı fazında, ileri faz yok.',
    };
  }

  const min = PHASE_MIN_QUESTIONS[currentPhase];
  if (questionsInPhase < min) {
    return {
      ready: false,
      confidence: 0,
      next_phase: next,
      reason: `Bu fazda min ${min} soru tamamlanmadı (${questionsInPhase}).`,
    };
  }

  const { contradiction_score: c, avoidance_score: a, stress_score: s, inconsistency_score: i } = metrics;

  switch (currentPhase) {
    case 'opening': {
      const cond = (a > 35 || c > 25) && (a + c) / 2 > 20;
      return {
        ready: cond,
        confidence: clamp01((a + c) / 200 + 0.1),
        next_phase: next,
        reason: cond
          ? 'Şüpheli kaçınma veya çelişki belirtileri gösteriyor; hikayeye sabitleme zamanı.'
          : 'Henüz net kaçınma/çelişki yok; mevcut fazda devam.',
      };
    }
    case 'story_locking': {
      const cond = (c > 55 || i > 50) && c + i > 80;
      return {
        ready: cond,
        confidence: clamp01((c + i) / 200),
        next_phase: next,
        reason: cond
          ? 'Net çelişki ve tutarsızlık birikti; delil baskısı uygulama zamanı.'
          : 'Çelişkiler henüz delil baskısı için yeterli olgunlukta değil.',
      };
    }
    case 'evidence_pressure': {
      const cond = c > 75 && (s > 65 || a > 65) && (c + s) / 2 > 70;
      return {
        ready: cond,
        confidence: clamp01((c + s) / 200),
        next_phase: next,
        reason: cond
          ? 'Şüpheli köşeye sıkışmış ve stresli/kaçınmacı; itiraf yaklaşımı zamanı.'
          : 'Henüz itiraf yaklaşımı için yeterli stres + çelişki birikmemiş.',
      };
    }
    default:
      return { ready: false, confidence: 0, next_phase: null, reason: '' };
  }
}

/**
 * Strateji Katmanı promptuna gidecek özet metin.
 */
export function formatPhaseReadinessForPrompt(r: PhaseReadiness): string {
  if (!r.next_phase) return '[FAZ HAZIRLIĞI] Şu an son fazdasınız, geçiş yok.';
  const pct = Math.round(r.confidence * 100);
  return [
    '[FAZ HAZIRLIĞI]',
    `Sonraki faz: ${r.next_phase}`,
    `Geçiş hazırlığı: %${pct} (${r.ready ? 'KOŞULLAR HAZIR' : 'KOŞULLAR HENÜZ HAZIR DEĞİL'})`,
    `Gerekçe: ${r.reason}`,
    'NOT: Nihai karar senin (Strateji Katmanı). Bu sadece bir sinyal.',
  ].join('\n');
}

/**
 * Strateji çağrısı tetikleyicisi (§7.10):
 *  - Her 3 soruda bir, VEYA
 *  - Faz geçişi hazırsa, VEYA
 *  - Kırılma noktası bayrağı varsa.
 */
export function shouldTriggerStrategy(args: {
  questionCount: number;
  phaseReady: boolean;
  isBreakingPoint: boolean;
  hasStrategicPlan: boolean;
}): boolean {
  if (!args.hasStrategicPlan) return true;
  if (args.phaseReady) return true;
  if (args.isBreakingPoint) return true;
  if (args.questionCount % 3 === 0) return true;
  return false;
}
