// =====================================================================
// Edge Function: move
// Hamle Katmanı (§7.1, §7.7) — Strateji planına bakarak o anki tek hamleyi
// üretir. Few-shot örnekleri + tam taktik prensibi + sinyal yorumu kullanılır.
// =====================================================================

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyAuthHeader } from '../_shared/jwt.ts';
import { getAdminClient } from '../_shared/db.ts';
import { callGeminiWithFallback, FALLBACK_MOVE } from '../_shared/gemini.ts';
import { TACTIC_MAP } from '../_shared/tactics.ts';
import { formatFewShotForPrompt } from '../_shared/fewshot.ts';

interface MoveBody {
  session_id?: string;
  signal_interpretation?: {
    meaning: string;
    tactical_implication: string;
    suggested_tactic: string;
    is_breaking_point: boolean;
    signals: string[];
  } | null;
}

function buildMovePrompt(args: {
  crimeType: string;
  suspectName: string;
  suspectAge: number;
  suspectGender: string;
  initialStatement: string;
  crimeSceneNotes: string;
  metrics: {
    contradiction_score: number;
    avoidance_score: number;
    stress_score: number;
    inconsistency_score: number;
  };
  signal: MoveBody['signal_interpretation'];
  currentPhase: string;
  strategicGoal: string;
  plannedTactic: string | null;
  avoid: string | null;
  history: Array<{ q: string; a: string | null }>;
  contradictionList: string[];
  inconsistencyList: string[];
  includeFewShot: boolean;
}): string {
  const tactic = args.plannedTactic ? TACTIC_MAP[args.plannedTactic] : null;
  const tacticBlock = tactic
    ? `[TAKTİK: ${tactic.name}]
İD: ${tactic.id}
Açıklama: ${tactic.description}
Ne zaman: ${tactic.when_to_use}
Hedef: ${tactic.goal}
Hamle tipi: ${tactic.move_type}
Prensip: ${tactic.example_lines.slice(0, 1).join(' | ')}`
    : '[TAKTİK] (belirtilmedi — funnel_technique kullan)';

  const signalBlock = args.signal
    ? `[SİNYAL ANALİZİ — bu cevaba özgü]
Gözlemlenen sinyaller: ${args.signal.signals.join(', ')}
Anlam: ${args.signal.meaning}
Taktik yönlendirme: ${args.signal.tactical_implication}
${args.signal.is_breaking_point ? 'KIRILMA NOKTASI BAYRAĞI VAR.' : ''}`
    : '[SİNYAL ANALİZİ] (yok)';

  const historyText = args.history
    .map((h, i) => `S${i + 1}: ${h.q}\nC${i + 1}: ${h.a ?? '(yanıtsız)'}`)
    .join('\n');

  return `[SİSTEM]
Sen deneyimli bir polis sorgulayıcısın. Görevin: strateji planına ve mevcut bağlama
bakarak SADECE BU TURDA SÖYLENECEK TEK BİR HAMLEYİ Türkçe üretmek.

Temel kurallar:
- Hamle bir soru, cümle, empati cümlesi veya yönlendirme olabilir.
- Tüm önceki soru ve cevapları karşılaştır, çelişkileri takip et.
- Strateji planındaki taktiği uygula, başka taktiğe geçme.
- Blöf kullanırken bu cevaba ve bu vakaya özel olsun.
- Tüm çıktı Türkçe olmalı.

[VAKA BAĞLAMI — sabit]
Suç türü: ${args.crimeType}
Şüpheli: ${args.suspectName}, ${args.suspectAge} yaş, ${args.suspectGender}
Olay yeri tutanağı: ${args.crimeSceneNotes}
İlk ifade: ${args.initialStatement}

[METRİK DURUMU]
Çelişki: ${args.metrics.contradiction_score.toFixed(1)}/100
Kaçınma: ${args.metrics.avoidance_score.toFixed(1)}/100
Stres: ${args.metrics.stress_score.toFixed(1)}/100
Tutarsızlık: ${args.metrics.inconsistency_score.toFixed(1)}/100

${signalBlock}

[STRATEJİ PLANI]
Aktif faz: ${args.currentPhase}
Stratejik hedef: ${args.strategicGoal}
Bu hamle için önerilen taktik: ${args.plannedTactic ?? '(yok)'}
Kaçınılması gereken: ${args.avoid ?? '(yok)'}

[KONUŞMA GEÇMİŞİ]
${historyText || '(henüz konuşma yok)'}

[GEÇMİŞ TESPİTLER]
Çelişkiler: ${args.contradictionList.join(' | ') || '(yok)'}
Tutarsızlıklar: ${args.inconsistencyList.join(' | ') || '(yok)'}

[TAKTİK PRENSİPLERİ — Örnek satırları birebir kullanma, prensibi anla ve bu vakaya özgü uygula]
${tacticBlock}

${args.includeFewShot ? `[FEW-SHOT ÖRNEKLERİ — gerçek vakalardan kritik anlar]\n${formatFewShotForPrompt()}` : '[FEW-SHOT ÖRNEKLERİ] (atlandı — yeterli konuşma geçmişi var)'}

[KISITLAMALAR — ZORUNLU]
- Bu hamlede YALNIZCA şu taktiği kullan: ${args.plannedTactic ?? 'funnel_technique'}
- Başka taktiklere geçme. Strateji katmanı bu kararı zaten verdi.
- KESINLIKLE aynı soruyu tekrarlama veya "Biraz daha açar mısın?" gibi sabit cümleler kullanma.
- Her hamle farklı, taze, bu vakaya ve bu cevaba özel olmalı.
- analysis.contradictions[] içine SADECE bu son cevapta YENİ ortaya çıkan
  çelişkileri/tutarsızlıkları yaz. Yukarıdaki "[GEÇMİŞ TESPİTLER]" bölümünde
  zaten listelenmiş bir tespiti TEKRAR YAZMA — boş dizi dön.
- Eğer mevcut bağlamda bu taktiği uygulamak gerçekten mümkün değilse
  (avukat talep ettiyse vb.) tactic_used "TACTIC_BLOCKED" dön.
- Sadece geçerli JSON üret, markdown fence kullanma.

[GÖREV]
Son cevabı analiz et. Yanıtını YALNIZCA şu JSON formatında ver:
{
  "analysis": {
    "contradictions": [
      { "type": "contradiction", "message": "Tespit açıklaması" }
    ],
    "stress_interpretation": "Bu cevaptaki sinyal kombinasyonunun anlamı",
    "strategic_note": "Bu hamleden sonra nereye gidilmeli"
  },
  "move": {
    "tactic_used": "${args.plannedTactic ?? 'funnel_technique'}",
    "tactic_step": "Taktik kataloğundaki hangi adım uygulandı",
    "move_type": "question",
    "content": "Polis tarafından söylenecek veya sorulacak metin"
  },
  "phase_update": null
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

  let body: MoveBody;
  try {
    body = (await req.json()) as MoveBody;
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
    .select('*')
    .eq('id', session.case_id)
    .maybeSingle();
  if (!caseRow) return errorResponse('Vaka bulunamadı', 404);

  const { data: history } = await supabase
    .from('messages')
    .select('question, answer, analysis_notes, sequence_no')
    .eq('session_id', sessionId)
    .order('sequence_no', { ascending: true });

  // Geçmiş analiz notlarından çelişki/tutarsızlık listesi çıkar
  const contradictionList: string[] = [];
  const inconsistencyList: string[] = [];
  for (const m of history ?? []) {
    const notes = m.analysis_notes as { contradictions?: Array<{ type: string; message: string }> } | null;
    if (notes?.contradictions) {
      for (const c of notes.contradictions) {
        if (c.type === 'contradiction') contradictionList.push(c.message);
        if (c.type === 'inconsistency') inconsistencyList.push(c.message);
      }
    }
  }

  const plan = (session.strategic_plan as {
    strategic_goal?: string;
    planned_moves?: Array<{ tactic: string; intent: string }>;
    avoid?: string | null;
  } | null) ?? null;

  const plannedTactic = plan?.planned_moves?.[0]?.tactic ?? 'funnel_technique';
  const strategicGoal = plan?.strategic_goal ?? 'Sorguya devam et';
  const avoid = plan?.avoid ?? null;

  const historyItems = (history ?? []).map((h) => ({ q: h.question, a: h.answer }));

  const prompt = buildMovePrompt({
    crimeType: caseRow.crime_type,
    suspectName: `${caseRow.suspect_name} ${caseRow.suspect_surname}`,
    suspectAge: caseRow.suspect_age,
    suspectGender: caseRow.suspect_gender,
    initialStatement: caseRow.initial_statement,
    crimeSceneNotes: caseRow.crime_scene_notes,
    metrics: {
      contradiction_score: session.contradiction_score,
      avoidance_score: session.avoidance_score,
      stress_score: session.stress_score,
      inconsistency_score: session.inconsistency_score,
    },
    signal: body.signal_interpretation ?? null,
    currentPhase: session.current_phase,
    strategicGoal,
    plannedTactic,
    avoid,
    history: historyItems.slice(-8),
    contradictionList: contradictionList.slice(-5),
    inconsistencyList: inconsistencyList.slice(-5),
    includeFewShot: historyItems.length < 5,
  });

  console.log(
    '[move] prompt uzunluğu:',
    prompt.length,
    'char | taktik:',
    plannedTactic,
    'faz:',
    session.current_phase,
    'soru_sayısı:',
    session.question_count,
  );

  const moveResult = await callGeminiWithFallback(prompt, FALLBACK_MOVE, {
    apiKey: geminiKey,
    temperature: 0.8,
  });

  // Server-side dedupe: AI prompt'a rağmen tekrar dönerse filtrele.
  // Token Jaccard ≥ 0.6 ise aynı kabul et.
  const seen = [...contradictionList, ...inconsistencyList];
  const incoming = moveResult.analysis?.contradictions ?? [];
  const filtered = incoming.filter((c) => !seen.some((prev) => isSimilar(prev, c.message)));
  if (filtered.length !== incoming.length) {
    console.log(
      '[move] dedupe:',
      incoming.length - filtered.length,
      'tekrarlı tespit filtrelendi',
    );
  }

  // strategic_note de aynı şeyi ezberleyebiliyor — son tura kıyasla benzerse boşalt
  const lastNote =
    (history ?? [])
      .map((m) => (m.analysis_notes as { strategic_note?: string } | null)?.strategic_note ?? '')
      .filter(Boolean)
      .pop() ?? '';
  let strategicNote = moveResult.analysis?.strategic_note ?? '';
  if (lastNote && strategicNote && isSimilar(lastNote, strategicNote)) {
    console.log('[move] strategic_note tekrarı temizlendi');
    strategicNote = '';
  }

  moveResult.analysis = {
    ...moveResult.analysis,
    contradictions: filtered,
    strategic_note: strategicNote,
  };

  console.log(
    '[move] üretilen taktik:',
    moveResult.move.tactic_used,
    '| içerik (50ch):',
    moveResult.move.content.slice(0, 50),
  );

  return jsonResponse(moveResult);
});

function normalize(s: string): string[] {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function isSimilar(a: string, b: string): boolean {
  const A = new Set(normalize(a));
  const B = new Set(normalize(b));
  if (A.size === 0 || B.size === 0) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const jaccard = inter / (A.size + B.size - inter);
  return jaccard >= 0.6;
}
