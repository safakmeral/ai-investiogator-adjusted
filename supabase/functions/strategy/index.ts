// =====================================================================
// Edge Function: strategy
// Strateji Katmanı (§7.1) — Her 3-4 soruda bir veya kritik sinyal geldiğinde
// çalışır. Faz değerlendirmesi ve sıradaki 2-3 hamlenin planını yapar.
// =====================================================================

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyAuthHeader } from '../_shared/jwt.ts';
import { getAdminClient } from '../_shared/db.ts';
import { callGeminiWithFallback, FALLBACK_STRATEGY } from '../_shared/gemini.ts';
import { tacticSummariesForPrompt } from '../_shared/tactics.ts';

interface StrategyBody {
  session_id?: string;
  phase_readiness?: {
    next_phase: string | null;
    confidence: number;
    ready: boolean;
    reason: string;
  };
  signal_interpretation?: {
    meaning: string;
    tactical_implication: string;
    suggested_tactic: string;
    is_breaking_point: boolean;
  } | null;
}

function buildStrategyPrompt(args: {
  crimeType: string;
  initialStatement: string;
  crimeSceneNotes: string;
  metrics: {
    contradiction_score: number;
    avoidance_score: number;
    stress_score: number;
    inconsistency_score: number;
  };
  currentPhase: string;
  questionCount: number;
  questionsInPhase: number;
  history: Array<{ q: string; a: string | null }>;
  phaseReadiness: NonNullable<StrategyBody['phase_readiness']>;
  signal: StrategyBody['signal_interpretation'];
  previousPlan: unknown | null;
}): string {
  const historyText = args.history
    .map((h, i) => `S${i + 1}: ${h.q}\nC${i + 1}: ${h.a ?? '(yanıtsız)'}`)
    .join('\n');

  const tacticList = tacticSummariesForPrompt()
    .map((t) => `- ${t.id}: ${t.name} | ${t.when_to_use} | hedef: ${t.goal}`)
    .join('\n');

  const phaseReadinessBlock = `[FAZ HAZIRLIĞI]
Sonraki faz: ${args.phaseReadiness.next_phase ?? '(yok)'}
Geçiş hazırlığı: %${Math.round(args.phaseReadiness.confidence * 100)} ${args.phaseReadiness.ready ? '— KOŞULLAR HAZIR' : '— KOŞULLAR HENÜZ HAZIR DEĞİL'}
Gerekçe: ${args.phaseReadiness.reason}
NOT: Nihai geçiş kararı senin. Bu sadece sinyal.`;

  const signalBlock = args.signal
    ? `[SİNYAL ANALİZİ — son cevap]
Anlam: ${args.signal.meaning}
Taktik yönlendirme: ${args.signal.tactical_implication}
Önerilen taktik: ${args.signal.suggested_tactic}
${args.signal.is_breaking_point ? 'KIRILMA NOKTASI BAYRAĞI VAR.' : ''}`
    : '[SİNYAL ANALİZİ] (yok)';

  return `[SİSTEM]
Sen bir sorgu strateji yöneticisisin. Görevin: nerede olduğunu değerlendirip
sıradaki 2-3 hamlenin planını çıkarmak. Hamleyi sen üretmiyorsun, planı
üretiyorsun. Hamle Katmanı sıradaki tek hamleyi senin planına bakarak yazacak.

[VAKA BAĞLAMI]
Suç türü: ${args.crimeType}
İlk ifade: ${args.initialStatement}
Olay yeri notları: ${args.crimeSceneNotes}

[METRİK DURUMU]
Çelişki: ${args.metrics.contradiction_score.toFixed(1)}/100
Kaçınma: ${args.metrics.avoidance_score.toFixed(1)}/100
Stres: ${args.metrics.stress_score.toFixed(1)}/100
Tutarsızlık: ${args.metrics.inconsistency_score.toFixed(1)}/100

[FAZ DURUMU]
Aktif faz: ${args.currentPhase}
Toplam soru: ${args.questionCount}
Bu fazda soru: ${args.questionsInPhase}

${phaseReadinessBlock}

${signalBlock}

[KONUŞMA GEÇMİŞİ]
${historyText || '(henüz konuşma yok)'}

[ÖNCEKİ STRATEJİ PLANI]
${args.previousPlan ? JSON.stringify(args.previousPlan) : '(yok)'}

[TAKTİK KATALOĞU — SADECE BU ID'LERİ KULLAN]
${tacticList}

[KISITLAMALAR — ZORUNLU]
- Sadece geçerli JSON üret. Markdown fence kullanma. Açıklama yazma.
- next_phase yalnızca: "opening" | "story_locking" | "evidence_pressure" | "confession_approach" | null olabilir.
- planned_moves[].tactic yukarıdaki tactic id listesinden seçilmeli.

[GÖREV]
Yanıtın YALNIZCA şu JSON formatında olsun:
{
  "phase_assessment": "Kısa değerlendirme (1-2 cümle)",
  "next_phase": null veya yeni faz id'si,
  "strategic_goal": "Bu fazda ulaşılmak istenen ana hedef",
  "planned_moves": [
    { "tactic": "tactic_id", "intent": "Bu hamlenin amacı" },
    { "tactic": "tactic_id", "intent": "..." }
  ],
  "avoid": "Kaçınılması gereken (varsa) yoksa null"
}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const jwtSecret = Deno.env.get('MY_JWT_SECRET');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!jwtSecret || !geminiKey) return errorResponse('Sunucu yapılandırma eksik', 500);

  const auth = await verifyAuthHeader(req.headers.get('authorization'), jwtSecret);
  if (!auth) return errorResponse('Yetkisiz', 401);

  let body: StrategyBody;
  try {
    body = (await req.json()) as StrategyBody;
  } catch {
    return errorResponse('Geçersiz JSON');
  }

  const sessionId = body.session_id;
  if (!sessionId) return errorResponse('session_id zorunlu');

  const supabase = getAdminClient();

  const { data: session } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return errorResponse('Sorgu bulunamadı', 404);

  const { data: caseRow } = await supabase
    .from('cases')
    .select('crime_type, initial_statement, crime_scene_notes')
    .eq('id', session.case_id)
    .maybeSingle();

  const { data: history } = await supabase
    .from('messages')
    .select('question, answer, sequence_no')
    .eq('session_id', sessionId)
    .order('sequence_no', { ascending: true });

  const prompt = buildStrategyPrompt({
    crimeType: caseRow?.crime_type ?? '',
    initialStatement: caseRow?.initial_statement ?? '',
    crimeSceneNotes: caseRow?.crime_scene_notes ?? '',
    metrics: {
      contradiction_score: session.contradiction_score,
      avoidance_score: session.avoidance_score,
      stress_score: session.stress_score,
      inconsistency_score: session.inconsistency_score,
    },
    currentPhase: session.current_phase,
    questionCount: session.question_count,
    questionsInPhase: session.questions_in_phase,
    history: (history ?? []).map((h) => ({ q: h.question, a: h.answer })),
    phaseReadiness:
      body.phase_readiness ?? {
        next_phase: null,
        confidence: 0,
        ready: false,
        reason: 'Sinyal verilmedi.',
      },
    signal: body.signal_interpretation ?? null,
    previousPlan: session.strategic_plan,
  });

  const plan = await callGeminiWithFallback(prompt, FALLBACK_STRATEGY, {
    apiKey: geminiKey,
    temperature: 0.6,
  });

  // Strateji planını sessions tablosuna yaz
  await supabase
    .from('sessions')
    .update({
      strategic_plan: plan,
      current_phase: plan.next_phase ?? session.current_phase,
      questions_in_phase:
        plan.next_phase && plan.next_phase !== session.current_phase
          ? 0
          : session.questions_in_phase,
    })
    .eq('id', sessionId);

  return jsonResponse(plan);
});
