// =====================================================================
// Edge Function: analyze
// Analiz Katmanı (§7.8) — Sadece ölçer, hamle üretmez.
// Girdi: session_id + son cevap
// Çıktı: contradiction/avoidance/inconsistency ağırlıkları + ai_stress
// =====================================================================

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyAuthHeader } from '../_shared/jwt.ts';
import { getAdminClient } from '../_shared/db.ts';
import { callGeminiWithFallback, FALLBACK_ANALYSIS } from '../_shared/gemini.ts';

interface AnalyzeBody {
  session_id?: string;
  last_question?: string;
  last_answer?: string;
}

function buildAnalysisPrompt(args: {
  initialStatement: string;
  history: Array<{ q: string; a: string | null }>;
  lastQuestion: string;
  lastAnswer: string;
}): string {
  const historyText = args.history
    .map((h, i) => `S${i + 1}: ${h.q}\nC${i + 1}: ${h.a ?? '(yanıtsız)'}`)
    .join('\n');

  return `[SİSTEM]
Sen bir sorgu analisti. Görevin sadece ölçmek ve sınıflandırmak.
Hamle üretmiyorsun, yorum yapmıyorsun, tavsiye vermiyorsun.

[VAKA BAĞLAMI]
İlk ifade: ${args.initialStatement}

[KONUŞMA GEÇMİŞİ — tamamı]
${historyText || '(henüz konuşma yok)'}

[SON CEVAP — analiz edilecek]
Soru: "${args.lastQuestion}"
Cevap: "${args.lastAnswer}"

[KISITLAMALAR — ZORUNLU]
- Sadece aşağıdaki JSON formatını üret, başka hiçbir şey yazma.
- Preamble, açıklama, yorum ekleme.
- Ağırlık değerleri için sadece tanımlı seçenekleri kullan.

[GÖREV]
{
  "contradiction_weight": 0.0,
  "contradiction_detail": null,
  "avoidance_weight": 0.0,
  "avoidance_type": null,
  "inconsistency_weight": 0.0,
  "inconsistency_detail": null,
  "ai_stress_score": 0.0
}

Ağırlık değerleri:
contradiction_weight: 0.0 | 0.2 | 0.5 | 1.0
avoidance_weight: 0.0 | 0.5 | 0.7 | 0.8 | 1.0
avoidance_type: "konu_degistirme" | "soruyla_cevap" | "bilmiyorum" | "yanıtsız" | null
inconsistency_weight: 0.0 | 0.2 | 0.5 | 0.7 | 0.8
ai_stress_score: 0.0 ile 1.0 arası ondalıklı sayı`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const jwtSecret = Deno.env.get('MY_JWT_SECRET');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!jwtSecret || !geminiKey) {
    return errorResponse('Sunucu yapılandırma eksik', 500);
  }

  const auth = await verifyAuthHeader(req.headers.get('authorization'), jwtSecret);
  if (!auth) return errorResponse('Yetkisiz', 401);

  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return errorResponse('Geçersiz JSON');
  }

  const { session_id: sessionId, last_question: lastQuestion, last_answer: lastAnswer } = body;
  if (!sessionId || !lastQuestion || !lastAnswer) {
    return errorResponse('session_id, last_question, last_answer zorunlu');
  }

  const supabase = getAdminClient();

  // Vaka + geçmiş mesajlar
  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, case_id')
    .eq('id', sessionId)
    .maybeSingle();
  if (sErr || !session) return errorResponse('Sorgu bulunamadı', 404);

  const { data: caseRow } = await supabase
    .from('cases')
    .select('initial_statement')
    .eq('id', session.case_id)
    .maybeSingle();

  const { data: history } = await supabase
    .from('messages')
    .select('question, answer, sequence_no')
    .eq('session_id', sessionId)
    .order('sequence_no', { ascending: true });

  const prompt = buildAnalysisPrompt({
    initialStatement: caseRow?.initial_statement ?? '',
    history: (history ?? []).map((h) => ({ q: h.question, a: h.answer })),
    lastQuestion,
    lastAnswer,
  });

  const result = await callGeminiWithFallback(prompt, FALLBACK_ANALYSIS, {
    apiKey: geminiKey,
    temperature: 0.2,
  });

  return jsonResponse(result);
});
