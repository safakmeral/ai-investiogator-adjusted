// =====================================================================
// Otomatik Sinyal Tespiti — Python microservice istemcisi
// /analyze-frames → beden dili (DeepFace + MediaPipe)
// /analyze-voice  → ses tonu (librosa)
// =====================================================================

const SERVICE_URL =
  process.env.EXPO_PUBLIC_PYTHON_SERVICE_URL ??
  // Yedek: aynı makinede Expo Go ile geliştirme yapıyorsan elle override et
  'http://localhost:8001';

const REQUEST_TIMEOUT_MS = 30000;

async function postJsonWithTimeout<T>(
  url: string,
  body: unknown,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`POST ${url} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`POST ${url} threw`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function postMultipartWithTimeout<T>(
  url: string,
  form: FormData,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`POST ${url} failed: ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`POST ${url} threw`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kameradan yakalanan base64 JPEG frame'leri Python servise gönderip
 * tespit edilen beden dili sinyallerini alır. Hata olursa boş dizi döner.
 */
export async function analyzeBodyLanguageFrames(
  frames: string[],
): Promise<string[]> {
  if (!frames || frames.length === 0) return [];
  const res = await postJsonWithTimeout<{ bodyLanguage: string[] }>(
    `${SERVICE_URL}/analyze-frames`,
    { frames },
  );
  return res?.bodyLanguage ?? [];
}

/**
 * Lokal kayıt dosyasının (file:// URI) ses tonu analizini Python servise yaptırır.
 * Whisper transkripsiyonuna paralel çağrılır.
 */
export async function analyzeVoiceTone(localUri: string): Promise<string[]> {
  if (!localUri) return [];
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const form = new FormData();
    // React Native FormData için açıkça ad + tip ver
    form.append('audio', {
      // @ts-expect-error — RN FormData özel obje formatını kabul eder
      uri: localUri,
      name: 'answer.m4a',
      type: 'audio/m4a',
    } as any);
    const res = await postMultipartWithTimeout<{ voiceTone: string[] }>(
      `${SERVICE_URL}/analyze-voice`,
      form,
    );
    return res?.voiceTone ?? [];
  } catch (err) {
    console.warn('analyzeVoiceTone failed', err);
    return [];
  }
}
