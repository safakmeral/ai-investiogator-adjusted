// =====================================================================
// AI Investigator — Veritabanı ve domain tipleri
// =====================================================================

export type Phase =
  | 'opening'
  | 'story_locking'
  | 'evidence_pressure'
  | 'confession_approach';

export type MoveType =
  | 'question'
  | 'statement'
  | 'empathy'
  | 'bluff'
  | 'silence_prompt';

export type CaseStatus = 'open' | 'closed';
export type Gender = 'erkek' | 'kadın';

export interface Officer {
  id: string;
  badge_id: string;
  full_name: string;
  created_at: string;
}

export interface Case {
  id: string;
  case_code: string;
  officer_id: string;
  suspect_tc: string;
  suspect_name: string;
  suspect_surname: string;
  suspect_age: number;
  suspect_gender: Gender;
  suspect_photo_url: string | null;
  crime_type: string;
  initial_statement: string;
  crime_scene_notes: string;
  status: CaseStatus;
  created_at: string;
}

export interface Metrics {
  contradiction_score: number;
  avoidance_score: number;
  stress_score: number;
  inconsistency_score: number;
}

export interface PlannedMove {
  tactic: string;
  intent: string;
}

export interface StrategicPlan {
  phase_assessment: string;
  next_phase: Phase | null;
  strategic_goal: string;
  planned_moves: PlannedMove[];
  avoid: string | null;
}

export interface Session extends Metrics {
  id: string;
  case_id: string;
  current_phase: Phase;
  active_tactic: string | null;
  strategic_plan: StrategicPlan | null;
  question_count: number;
  questions_in_phase: number;
  created_at: string;
}

// Sinyal yorumlama çıktısı
export interface SignalInterpretation {
  meaning: string;
  tactical_implication: string;
  suggested_tactic: string;
  signals: string[];
  is_breaking_point: boolean;
}

// Analiz Katmanı (Gemini) çıktısı
export interface AnalysisResult {
  contradiction_weight: number;     // 0.0 | 0.2 | 0.5 | 1.0
  contradiction_detail: string | null;
  avoidance_weight: number;         // 0.0 | 0.5 | 0.7 | 0.8 | 1.0
  avoidance_type: string | null;
  inconsistency_weight: number;     // 0.0 | 0.2 | 0.5 | 0.7 | 0.8
  inconsistency_detail: string | null;
  ai_stress_score: number;          // 0.0 - 1.0
}

// Hamle Katmanı çıktısı
export interface MoveContradiction {
  type: 'contradiction' | 'inconsistency';
  message: string;
}

export interface MoveResult {
  analysis: {
    contradictions: MoveContradiction[];
    stress_interpretation: string;
    strategic_note: string;
  };
  move: {
    tactic_used: string;
    tactic_step: string;
    move_type: MoveType;
    content: string;
  };
  phase_update: Phase | null;
}

export interface Message {
  id: string;
  session_id: string;
  sequence_no: number;
  move_type: MoveType;
  tactic_used: string | null;
  question: string;
  answer: string | null;
  answer_audio_url: string | null;
  body_language_input: string[] | null;
  voice_tone_input: string[] | null;
  signal_interpretation: SignalInterpretation | null;
  analysis_notes: MoveResult['analysis'] | null;
  metrics_before: Metrics | null;
  metrics_after: Metrics | null;
  ai_stress_input: number | null;
  police_stress_input: number | null;
  created_at: string;
}

export interface AdaptiveWeights {
  ai: number;
  police: number;
}

export interface AdaptiveWeightsRow {
  id: string;
  ai_weight: number;
  police_weight: number;
  session_count: number;
  trigger_session: string | null;
  trigger_tactic_score: number | null;
  updated_at: string;
}

export interface SurveyResponse {
  question_quality: number;       // 1-5
  contradiction_accuracy: number; // 1-5
  helpfulness: number;            // 1-5
  is_guilty: 'suçlu' | 'suçsuz' | null;
  notes: string;
}
