// =====================================================================
// Edge Function: extract-text
// Mobil tarafça base64 olarak gönderilen bir dosyayı (PDF/DOC/görsel/metin)
// Gemini 2.5 Flash'a gönderir, OCR + parse yapıp düz metin geri döner.
// Kullanım: Olay yeri tutanağı, ifade tutanağı vb. dosyaları içe aktarmak.
// =====================================================================

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyAuthHeader } from '../_shared/jwt.ts';

interface ExtractBody {
  file_base64?: string;
  mime_type?: string;
  file_name?: string;
}

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
  'text/markdown',
]);

// Birincil model yoğun olduğunda sırayla denenir
const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
const endpointFor = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const EXTRACT_PROMPT = `Sen bir metin çıkarma asistanısın. Verilen dosyadaki TÜM metni
hiçbir yorum, başlık veya özet eklemeden, orijinal düzenini olabildiğince
koruyarak düz metin olarak çıkar. Türkçe karakterleri doğru kullan.
Tablolar varsa satır satır metne dönüştür. Hiçbir markdown fence kullanma.
SADECE çıkarılan ham metni döndür, başka hiçbir şey yazma.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const jwtSecret = Deno.env.get('MY_JWT_SECRET');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!jwtSecret || !geminiKey) return errorResponse('Sunucu yapılandırma eksik', 500);

  const auth = await verifyAuthHeader(req.headers.get('authorization'), jwtSecret);
  if (!auth) return errorResponse('Yetkisiz', 401);

  let body: ExtractBody;
  try {
    body = (await req.json()) as ExtractBody;
  } catch {
    return errorResponse('Geçersiz JSON');
  }

  const { file_base64, mime_type, file_name } = body;
  if (!file_base64 || !mime_type) {
    return errorResponse('file_base64 ve mime_type zorunlu');
  }
  if (!SUPPORTED_MIME.has(mime_type)) {
    return errorResponse(
      `Desteklenmeyen dosya türü: ${mime_type}. Desteklenen: PDF, görsel, düz metin.`,
      415,
    );
  }

  // Boyut kontrolü — base64 ~33% şişer, 8MB ham dosya (~10.7MB base64) limiti
  const sizeBytes = Math.floor((file_base64.length * 3) / 4);
  if (sizeBytes > 8 * 1024 * 1024) {
    return errorResponse('Dosya çok büyük (8MB üstü). Daha küçük dosya kullanın.', 413);
  }

  const reqBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: EXTRACT_PROMPT },
          { inline_data: { mime_type, data: file_base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.0,
      topP: 0.95,
      maxOutputTokens: 8192,
      responseMimeType: 'text/plain',
    },
  };

  console.log(
    '[extract-text] dosya:',
    file_name ?? '(adsız)',
    '| mime:',
    mime_type,
    '| boyut(KB):',
    Math.round(sizeBytes / 1024),
  );

  // 503 = Gemini sunucu yoğunluğu (dosya boyutu/kota ile alakasız).
  // Aynı modelde 2 retry, sonra bir sonraki modele geç.
  const RETRYABLE = new Set([429, 500, 502, 503, 504]);
  const ATTEMPTS_PER_MODEL = 2;
  let res: Response | null = null;
  let lastStatus = 0;
  let usedModel = MODELS[0];

  outer: for (const model of MODELS) {
    usedModel = model;
    for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
      try {
        res = await fetch(`${endpointFor(model)}?key=${geminiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        });
      } catch (e) {
        console.error('[extract-text] fetch hata', model, 'deneme', attempt, ':', String(e).slice(0, 200));
        if (attempt < ATTEMPTS_PER_MODEL) {
          await new Promise((r) => setTimeout(r, 500 * attempt));
          continue;
        }
        res = null;
        continue outer; // bir sonraki modele geç
      }

      if (res.ok) break outer;

      lastStatus = res.status;
      const errBody = await res.text();
      console.error('[extract-text] Gemini hata', model, res.status, errBody.slice(0, 300), 'deneme:', attempt);

      // Retry edilemez hata (4xx, kota dışı): direkt çık
      if (!RETRYABLE.has(res.status)) break outer;
      // 503/overloaded ise aynı modelde tekrar denemeye gerek yok, fallback'e geç
      if (res.status === 503) continue outer;
      if (attempt < ATTEMPTS_PER_MODEL) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  if (!res || !res.ok) {
    const userMsg =
      lastStatus === 503
        ? 'Gemini sunucuları şu anda yoğun (tüm modeller denendi). Birkaç dakika sonra tekrar deneyin.'
        : lastStatus === 429
          ? 'Gemini API kullanım limiti aşıldı (proje bazlı). Biraz bekleyip tekrar deneyin.'
          : `Metin çıkarma başarısız: ${lastStatus || 'bağlantı hatası'}`;
    return errorResponse(userMsg, 502);
  }
  console.log('[extract-text] başarılı model:', usedModel);

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };

  if (data.promptFeedback?.blockReason) {
    return errorResponse(`Gemini reddetti: ${data.promptFeedback.blockReason}`, 422);
  }

  const text =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';

  if (!text) {
    return errorResponse('Dosyadan metin çıkarılamadı (boş yanıt).', 422);
  }

  return jsonResponse({ text, char_count: text.length });
});
