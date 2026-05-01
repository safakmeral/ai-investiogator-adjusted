// =====================================================================
// Sorgu Seansı API'si — sessions, messages, tactic_performance,
// adaptive_weights tablolarını kapsar.
// =====================================================================

import { supabase, callEdgeFunction } from './supabase';
import { useAuthStore } from './store';
import {
  applyAllMetrics,
  calculateTacticScore,
} from './metrics';
import {
  DEFAULT_WEIGHTS,
  dominantSource,
  rowToWeights,
  updateAdaptiveWeights,
} from './adaptiveWeights';
import { TACTIC_MAP } from './tactics';
import { computePoliceStress, interpretSignals } from './signals';
import { calculatePhaseReadiness, shouldTriggerStrategy } from './phaseTransition';
import type {
  AdaptiveWeights,
  AdaptiveWeightsRow,
  AnalysisResult,
  Message,
  Metrics,
  MoveResult,
  Session,
  StrategicPlan,
  SignalInterpretation,
} from './types';

// ---------------------------------------------------------------------
// Seans CRUD
// ---------------------------------------------------------------------

export async function createSession(caseId: string): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ case_id: caseId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Session;
}

export async function getActiveSessionForCase(caseId: string): Promise<Session | null> {
  // Bir vaka için en güncel açık seansı getir; yoksa yarat
  const { data: existing, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (existing as Session | null) ?? null;
}

export async function getOrCreateSession(caseId: string): Promise<Session> {
  const existing = await getActiveSessionForCase(caseId);
  if (existing) return existing;
  return await createSession(caseId);
}

export async function getMessages(sessionId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_no', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

// ---------------------------------------------------------------------
// Adaptif ağırlık tablosu
// ---------------------------------------------------------------------

export async function getLatestAdaptiveWeights(): Promise<AdaptiveWeights> {
  const { data, error } = await supabase
    .from('adaptive_weights')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_WEIGHTS;
  return rowToWeights(data as AdaptiveWeightsRow);
}

async function insertAdaptiveWeightsRow(
  next: AdaptiveWeights,
  triggerSession: string,
  triggerScore: number,
): Promise<void> {
  const { data: latest } = await supabase
    .from('adaptive_weights')
    .select('session_count')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from('adaptive_weights').insert({
    ai_weight: next.ai,
    police_weight: next.police,
    session_count: ((latest as { session_count?: number } | null)?.session_count ?? 0) + 1,
    trigger_session: triggerSession,
    trigger_tactic_score: triggerScore,
  });
}

// ---------------------------------------------------------------------
// İlk hamle (sorgu açılışında AI'dan ilk soruyu üret)
// ---------------------------------------------------------------------

export async function generateOpeningMove(sessionId: string): Promise<{
  message: Message;
  move: MoveResult;
}> {
  const jwt = useAuthStore.getState().jwt;
  if (!jwt) throw new Error('Oturum açık değil');

  // İlk hamlede henüz cevap yok; doğrudan move'u tetikle
  const move = await callEdgeFunction<MoveResult>(
    'move',
    { session_id: sessionId, signal_interpretation: null },
    jwt,
  );

  // Sequence 0
  const { data: existing } = await supabase
    .from('messages')
    .select('sequence_no')
    .eq('session_id', sessionId)
    .order('sequence_no', { ascending: false })
    .limit(1);
  const nextSeq = ((existing?.[0]?.sequence_no as number | undefined) ?? -1) + 1;

  const { data: msgRow, error } = await supabase
    .from('messages')
    .insert({
      session_id: sessionId,
      sequence_no: nextSeq,
      move_type: move.move.move_type,
      tactic_used: move.move.tactic_used,
      question: move.move.content,
      analysis_notes: move.analysis,
      metrics_before: null,
      metrics_after: null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  // İlk ifade ⇄ olay yeri tutanağı arasında çelişki tespit edildiyse
  // (cevap olmadığı için sadece çelişki skoru güncellenir, diğer metrikler 0 kalır)
  const initialContradictions = (move.analysis?.contradictions ?? []).filter(
    (c) => c.type === 'contradiction',
  );
  let openingContradictionScore = 0;
  if (initialContradictions.length > 0) {
    // 1 çelişki → 0.5 ağırlık, 2+ → 1.0 (spec'teki ayrık değerler)
    const weight = initialContradictions.length >= 2 ? 1.0 : 0.5;
    openingContradictionScore = Math.min(100, weight * 25); // updateContradictionScore(0, w)
  }

  // question_count + questions_in_phase + (varsa) çelişki skoru güncelle
  const sessionUpdate: Record<string, unknown> = {
    question_count: 1,
    questions_in_phase: 1,
    active_tactic: move.move.tactic_used,
  };
  if (openingContradictionScore > 0) {
    sessionUpdate.contradiction_score = openingContradictionScore;
  }
  await supabase.from('sessions').update(sessionUpdate).eq('id', sessionId);

  return { message: msgRow as Message, move };
}

// ---------------------------------------------------------------------
// Cevap geldikten sonra tüm pipeline:
//   1) messages.answer + signal'ı kaydet
//   2) Analiz Katmanı çağır → ağırlıklar
//   3) Adaptif ağırlıkları oku
//   4) Metrikleri güncelle, sessions tablosuna yaz
//   5) Önceki mesajın metrics_after + tactic_performance'ı hesapla
//   6) adaptive_weights tablosunu güncelle
//   7) Faz hazırlığı + Strateji Katmanı (gerekirse)
//   8) Hamle Katmanı çağır → yeni AI mesajı
// ---------------------------------------------------------------------

export interface ProcessAnswerInput {
  sessionId: string;
  previousMessageId: string;       // cevabı verilen AI mesajının id'si
  answerText: string;
  answerAudioUrl: string | null;
  bodyLanguage: string[];
  voiceTone: string[];
}

export interface ProcessAnswerResult {
  analysis: AnalysisResult;
  signal: SignalInterpretation | null;
  newMetrics: Metrics;
  newSession: Session;
  newAiMessage: Message;
  newMove: MoveResult;
  tacticScore: number | null;
  phaseChanged: boolean;
}

export async function processAnswer(
  input: ProcessAnswerInput,
): Promise<ProcessAnswerResult> {
  const jwt = useAuthStore.getState().jwt;
  if (!jwt) throw new Error('Oturum açık değil');

  // Mevcut seans
  const { data: sessionRow, error: sErr } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', input.sessionId)
    .single();
  if (sErr || !sessionRow) throw new Error('Seans bulunamadı');
  const session = sessionRow as Session;

  // Önceki mesajı (AI'ın sorduğu soru) getir
  const { data: prevMsgRow } = await supabase
    .from('messages')
    .select('*')
    .eq('id', input.previousMessageId)
    .single();
  const prevMsg = prevMsgRow as Message | null;
  if (!prevMsg) throw new Error('Önceki mesaj bulunamadı');

  // Sinyal yorumu
  const signal = interpretSignals(input.bodyLanguage, input.voiceTone);
  const policeStressRaw = computePoliceStress([
    ...input.bodyLanguage,
    ...input.voiceTone,
  ]);

  // 1) Önceki mesaja cevabı + sinyali işle (metrics_before snapshot'ı bu mesaja ait)
  const metricsBefore: Metrics = {
    contradiction_score: session.contradiction_score,
    avoidance_score: session.avoidance_score,
    stress_score: session.stress_score,
    inconsistency_score: session.inconsistency_score,
  };

  await supabase
    .from('messages')
    .update({
      answer: input.answerText,
      answer_audio_url: input.answerAudioUrl,
      body_language_input: input.bodyLanguage,
      voice_tone_input: input.voiceTone,
      signal_interpretation: signal,
      metrics_before: metricsBefore,
      police_stress_input: policeStressRaw,
    })
    .eq('id', input.previousMessageId);

  // 2) Analiz Katmanı
  const analysis = await callEdgeFunction<AnalysisResult>(
    'analyze',
    {
      session_id: input.sessionId,
      last_question: prevMsg.question,
      last_answer: input.answerText,
    },
    jwt,
  );

  // ai_stress_input alanını da güncelle (önceki mesajda)
  await supabase
    .from('messages')
    .update({ ai_stress_input: analysis.ai_stress_score })
    .eq('id', input.previousMessageId);

  // 3) Adaptif ağırlıklar
  const weights = await getLatestAdaptiveWeights();

  // 4) Metrikleri güncelle
  const newMetrics = applyAllMetrics(metricsBefore, {
    contradiction_weight: analysis.contradiction_weight,
    avoidance_weight: analysis.avoidance_weight,
    inconsistency_weight: analysis.inconsistency_weight,
    police_stress_raw: policeStressRaw,
    ai_stress_raw: analysis.ai_stress_score,
    weights,
  });

  // 5) Önceki mesajın metrics_after + tactic_performance
  let tacticScore: number | null = null;
  if (prevMsg.tactic_used) {
    const tactic = TACTIC_MAP[prevMsg.tactic_used];
    if (tactic) {
      tacticScore = calculateTacticScore(metricsBefore, newMetrics, tactic.target);

      await supabase
        .from('messages')
        .update({ metrics_after: newMetrics })
        .eq('id', input.previousMessageId);

      await supabase.from('tactic_performance').insert({
        tactic_id: prevMsg.tactic_used,
        score: tacticScore,
        session_id: input.sessionId,
        message_id: input.previousMessageId,
        ai_input: analysis.ai_stress_score,
        police_input: policeStressRaw,
        dominant_source: dominantSource(analysis.ai_stress_score, policeStressRaw),
      });

      // 6) adaptive_weights güncelle (anlamlı taktik skoru için)
      const next = updateAdaptiveWeights(
        tacticScore,
        analysis.ai_stress_score,
        policeStressRaw,
        weights,
      );
      if (next.ai !== weights.ai || next.police !== weights.police) {
        await insertAdaptiveWeightsRow(next, input.sessionId, tacticScore);
      }
    }
  }

  // Seans metriklerini güncelle (faz / counter sonradan strategy ile değişebilir)
  await supabase
    .from('sessions')
    .update({
      contradiction_score: newMetrics.contradiction_score,
      avoidance_score: newMetrics.avoidance_score,
      stress_score: newMetrics.stress_score,
      inconsistency_score: newMetrics.inconsistency_score,
    })
    .eq('id', input.sessionId);

  // 7) Faz hazırlığı + strateji
  const readiness = calculatePhaseReadiness(
    newMetrics,
    session.current_phase,
    session.questions_in_phase,
  );

  const wantsStrategy = shouldTriggerStrategy({
    questionCount: session.question_count,
    phaseReady: readiness.ready,
    isBreakingPoint: signal?.is_breaking_point ?? false,
    hasStrategicPlan: !!session.strategic_plan,
  });

  if (wantsStrategy) {
    await callEdgeFunction<StrategicPlan>(
      'strategy',
      {
        session_id: input.sessionId,
        phase_readiness: readiness,
        signal_interpretation: signal,
      },
      jwt,
    );
    // strategy fonksiyonu sessions tablosunu güncelliyor
  }

  // En güncel session'ı çek (strategy değişmiş olabilir)
  const { data: refreshedSession } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', input.sessionId)
    .single();
  const newSession = refreshedSession as Session;
  const phaseChanged = newSession.current_phase !== session.current_phase;

  // 8) Hamle Katmanı
  const newMove = await callEdgeFunction<MoveResult>(
    'move',
    {
      session_id: input.sessionId,
      signal_interpretation: signal,
    },
    jwt,
  );

  const { data: lastSeqRow } = await supabase
    .from('messages')
    .select('sequence_no')
    .eq('session_id', input.sessionId)
    .order('sequence_no', { ascending: false })
    .limit(1);
  const nextSeq = ((lastSeqRow?.[0]?.sequence_no as number | undefined) ?? -1) + 1;

  const { data: newMsgRow, error: insertErr } = await supabase
    .from('messages')
    .insert({
      session_id: input.sessionId,
      sequence_no: nextSeq,
      move_type: newMove.move.move_type,
      tactic_used: newMove.move.tactic_used,
      question: newMove.move.content,
      analysis_notes: newMove.analysis,
      metrics_before: null,
      metrics_after: null,
    })
    .select()
    .single();
  if (insertErr) throw new Error(insertErr.message);

  // Sayaçları arttır
  await supabase
    .from('sessions')
    .update({
      question_count: newSession.question_count + 1,
      questions_in_phase: phaseChanged ? 1 : newSession.questions_in_phase + 1,
      active_tactic: newMove.move.tactic_used,
    })
    .eq('id', input.sessionId);

  const finalSession = {
    ...newSession,
    question_count: newSession.question_count + 1,
    questions_in_phase: phaseChanged ? 1 : newSession.questions_in_phase + 1,
    active_tactic: newMove.move.tactic_used,
  };

  return {
    analysis,
    signal,
    newMetrics,
    newSession: finalSession,
    newAiMessage: newMsgRow as Message,
    newMove,
    tacticScore,
    phaseChanged,
  };
}

// ---------------------------------------------------------------------
// Anket
// ---------------------------------------------------------------------

export async function saveSurvey(
  sessionId: string,
  responses: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('survey_responses')
    .upsert({ session_id: sessionId, responses }, { onConflict: 'session_id' });
  if (error) throw new Error(error.message);
}
