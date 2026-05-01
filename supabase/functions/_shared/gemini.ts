// =====================================================================
// Gemini 2.5 Flash çağrı sarmalayıcı + JSON Fallback Mekanizması (§7.1)
// =====================================================================

// Birincil yoğun olduğunda sırayla denenir (503/overloaded fallback'i için)
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const endpointFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const RETRYABLE_HTTP = new Set([429, 500, 502, 503, 504]);

interface GeminiContent {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

class GeminiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callGeminiRaw(
  prompt: string,
  apiKey: string,
  temperature = 0.7,
  model = MODELS[0],
): Promise<string> {
  const body: { contents: GeminiContent[]; generationConfig: object } = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(`${endpointFor(model)}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new GeminiHttpError(res.status, `Gemini ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini: boş yanıt');
  return text;
}

// HTTP hatasında (özellikle 503) modeller arasında geçiş yapar.
// JSON parse / boş yanıt gibi hatalar caller tarafından handle edilir.
async function callGeminiWithModelFallback(
  prompt: string,
  apiKey: string,
  temperature: number,
): Promise<string> {
  let lastErr: unknown;
  for (let mi = 0; mi < MODELS.length; mi++) {
    const model = MODELS[mi];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await callGeminiRaw(prompt, apiKey, temperature, model);
      } catch (err) {
        lastErr = err;
        const status = err instanceof GeminiHttpError ? err.status : 0;
        // 503 → bu modelde tekrar deneme anlamsız, hemen sonraki modele geç
        if (status === 503) {
          console.warn('[gemini] 503 overloaded, sonraki modele geçiliyor:', model);
          break;
        }
        // Diğer retry'lanabilir HTTP hatalarında kısa bekleme + aynı modelde tekrar
        if (RETRYABLE_HTTP.has(status) && attempt < 2) {
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        // Retry edilemez hata (4xx auth/format vb.) — fallback modeli denemenin anlamı yok
        if (status && !RETRYABLE_HTTP.has(status)) throw err;
        // Network/timeout — bir sonraki modeli dene
        break;
      }
    }
  }
  throw lastErr ?? new Error('Gemini: tüm modeller başarısız');
}

function cleanJsonString(raw: string): string {
  return raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

/**
 * Gemini'yi 3 kez deneyen, JSON fallback'li sarmalayıcı.
 * Geçersiz JSON gelirse retry; hâlâ başarısızsa fallback değer döner.
 */
export async function callGeminiWithFallback<T>(
  prompt: string,
  fallback: T,
  options: { retries?: number; temperature?: number; apiKey: string } = { apiKey: '' },
): Promise<T> {
  const retries = options.retries ?? 3;
  let currentPrompt = prompt;

  for (let i = 0; i < retries; i++) {
    try {
      const raw = await callGeminiWithModelFallback(
        currentPrompt,
        options.apiKey,
        options.temperature ?? 0.7,
      );
      const cleaned = cleanJsonString(raw);
      try {
        return JSON.parse(cleaned) as T;
      } catch {
        if (i === retries - 1) {
          console.error('[gemini] JSON parse başarısız, fallback dönülüyor', cleaned.slice(0, 200));
          return fallback;
        }
        currentPrompt =
          prompt + '\n\nÖNCEKİ YANIT GEÇERSİZ JSON İÇERİYORDU. YALNIZCA GEÇERLİ JSON ÜRET.';
      }
    } catch (err) {
      if (i === retries - 1) {
        console.error('[gemini] Çağrı başarısız, fallback dönülüyor', err);
        return fallback;
      }
    }
  }
  return fallback;
}

// Katmana özel fallback değerleri (§7.1)
export const FALLBACK_ANALYSIS = {
  contradiction_weight: 0.0,
  contradiction_detail: null as string | null,
  avoidance_weight: 0.0,
  avoidance_type: null as string | null,
  inconsistency_weight: 0.0,
  inconsistency_detail: null as string | null,
  ai_stress_score: 0.0,
};

export const FALLBACK_STRATEGY = {
  phase_assessment: 'Analiz edilemedi — temel sorularla devam et',
  next_phase: null as string | null,
  strategic_goal: 'Şüphelinin tarafındaki boşlukları doldur',
  planned_moves: [
    { tactic: 'funnel_technique', intent: 'Geniş bağlamdan dar detaylara' },
    { tactic: 'story_locking', intent: 'Kronolojik sıraya kilitle' },
  ],
  avoid: 'Çok hızlı suçlamak veya blöf kullanmak' as string | null,
};

const FALLBACK_MOVE_CONTENTS = [
  'O gün tam olarak nerede olduğunu ve kiminle olduğunu tekrar anlatır mısın?',
  'Bana olayın yaşandığı saati daha net bir şekilde açıklar mısın?',
  'Az önce anlattıklarına ek olarak, aklında kalan başka bir detay var mı?',
  'Sana önemli bir soru soracağım: O gece eve döndüğünde ne yaptın?',
  'Bir de şunu merak ediyorum — kurbanı en son ne zaman gördüğünü tarih ve saatle söyler misin?',
];

export const FALLBACK_MOVE = {
  analysis: {
    contradictions: [] as Array<{ type: string; message: string }>,
    stress_interpretation: '',
    strategic_note: '',
  },
  move: {
    tactic_used: 'funnel_technique',
    tactic_step: 'Genel soru',
    move_type: 'question' as const,
    content: FALLBACK_MOVE_CONTENTS[Math.floor(Math.random() * FALLBACK_MOVE_CONTENTS.length)],
  },
  phase_update: null as string | null,
};
