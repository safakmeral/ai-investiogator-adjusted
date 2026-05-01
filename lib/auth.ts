// =====================================================================
// Auth API — Edge Function login çağrısı + JWT yönetimi
// =====================================================================

import { callEdgeFunction } from './supabase';
import { useAuthStore } from './store';
import type { Officer } from './types';

export interface LoginResponse {
  officer: Officer;
  jwt: string;
}

/**
 * Edge Function `login` üzerinden manuel bcrypt + JWT auth.
 * Başarılıysa officer + jwt döner ve store'a yazılır.
 */
export async function login(badgeId: string, password: string): Promise<LoginResponse> {
  const result = await callEdgeFunction<LoginResponse>('login', {
    badge_id: badgeId,
    password,
  });

  if (!result.officer || !result.jwt) {
    throw new Error('Geçersiz yanıt: officer veya jwt eksik');
  }

  useAuthStore.getState().setAuth(result.officer, result.jwt);
  return result;
}

export function logout(): void {
  useAuthStore.getState().clearAuth();
}

/**
 * JWT içindeki payload'u decode eder (doğrulama yapmaz).
 * Token süresi dolmuş mu vb. yüzeyel kontrolü için.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    // base64url -> base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // RN'de atob var (Hermes), güvenli olsun diye padding ekle
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === 'function'
        ? atob(padded)
        : // fallback
          Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isJwtExpired(jwt: string): boolean {
  const payload = decodeJwtPayload(jwt);
  if (!payload || typeof payload.exp !== 'number') return true;
  return Date.now() / 1000 >= payload.exp;
}
