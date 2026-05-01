// =====================================================================
// JWT — Edge Function'lar için HS256 imzalama ve doğrulama
// Web Crypto API kullanır (Deno yerleşik)
// =====================================================================

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(data: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof data === 'string') {
    bytes = encoder.encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    bytes = new Uint8Array(data);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importHmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

export interface JwtPayload {
  sub: string;            // officer.id
  badge_id: string;
  full_name: string;
  iat: number;
  exp: number;
  [k: string]: unknown;
}

/**
 * HS256 JWT üretir.
 * @param payload  iat/exp dahil etme — fonksiyon ekleyecek
 * @param secret   MY_JWT_SECRET
 * @param expiresInSec varsayılan 30 gün
 */
export async function signJwt(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSec = 60 * 60 * 24 * 30,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = { ...payload, iat: now, exp: now + expiresInSec };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(fullPayload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await importHmacKey(secret, 'sign');
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  const sigB64 = base64UrlEncode(sigBuf);

  return `${signingInput}.${sigB64}`;
}

/**
 * HS256 JWT doğrular ve payload döner. Geçersizse null döner.
 */
export async function verifyJwt(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;

    const key = await importHmacKey(secret, 'verify');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(sigB64),
      encoder.encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;

    const payload = JSON.parse(decoder.decode(base64UrlDecode(payloadB64))) as JwtPayload;
    if (typeof payload.exp !== 'number' || Date.now() / 1000 >= payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Authorization header'ından Bearer token çıkarır ve doğrular.
 */
export async function verifyAuthHeader(
  authHeader: string | null,
  secret: string,
): Promise<JwtPayload | null> {
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return verifyJwt(m[1], secret);
}
