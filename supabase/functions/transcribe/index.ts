// =====================================================================
// Edge Function: transcribe
// Mobil tarafça Storage'a yüklenen ses dosyasını OpenAI Whisper'a gönderir,
// transkript metnini döner. (API anahtarı sadece serverda durur.)
// =====================================================================

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyAuthHeader } from '../_shared/jwt.ts';
import { getAdminClient } from '../_shared/db.ts';

interface TranscribeBody {
  audio_path?: string;        // Storage path (örn. "answer-audio/abc.m4a")
  bucket?: string;            // varsayılan: answer-audio
  language?: string;          // örn. "tr"
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const jwtSecret = Deno.env.get('MY_JWT_SECRET');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!jwtSecret || !openaiKey) return errorResponse('Sunucu yapılandırma eksik', 500);

  const auth = await verifyAuthHeader(req.headers.get('authorization'), jwtSecret);
  if (!auth) return errorResponse('Yetkisiz', 401);

  let body: TranscribeBody;
  try {
    body = (await req.json()) as TranscribeBody;
  } catch {
    return errorResponse('Geçersiz JSON');
  }

  const path = body.audio_path;
  const bucket = body.bucket ?? 'answer-audio';
  const language = body.language ?? 'tr';
  if (!path) return errorResponse('audio_path zorunlu');

  const supabase = getAdminClient();

  const { data: file, error } = await supabase.storage.from(bucket).download(path);
  if (error || !file) {
    return errorResponse(`Ses dosyası okunamadı: ${error?.message ?? 'unknown'}`, 404);
  }

  const arr = new Uint8Array(await file.arrayBuffer());
  const blob = new Blob([arr], { type: 'audio/m4a' });

  const form = new FormData();
  form.append('file', blob, 'answer.m4a');
  form.append('model', 'whisper-1');
  form.append('language', language);
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });

  if (!res.ok) {
    const txt = await res.text();
    return errorResponse(`Whisper hatası: ${res.status} ${txt}`, 502);
  }

  const result = (await res.json()) as { text?: string };
  return jsonResponse({ text: result.text ?? '' });
});
