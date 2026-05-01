// =====================================================================
// Edge Function: login
// badge_id + password alır, officers tablosunda bcrypt doğrulaması yapar,
// HS256 JWT üretip officer + jwt döner.
// =====================================================================

import { corsHeaders, errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { verifyPassword } from '../_shared/bcrypt.ts';
import { signJwt } from '../_shared/jwt.ts';
import { getAdminClient } from '../_shared/db.ts';

interface LoginBody {
  badge_id?: string;
  password?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return errorResponse('Geçersiz JSON');
  }

  const badgeId = body.badge_id?.trim();
  const password = body.password ?? '';

  if (!badgeId || !password) {
    return errorResponse('Rozet numarası ve şifre gereklidir');
  }

  const jwtSecret = Deno.env.get('MY_JWT_SECRET');
  if (!jwtSecret) {
    return errorResponse('JWT secret yapılandırılmamış', 500);
  }

  const supabase = getAdminClient();

  const { data: officer, error } = await supabase
    .from('officers')
    .select('id, badge_id, password_hash, full_name, created_at')
    .eq('badge_id', badgeId)
    .maybeSingle();

  if (error) {
    return errorResponse(`Veritabanı hatası: ${error.message}`, 500);
  }
  if (!officer) {
    // Bilgi sızıntısını önlemek için aynı mesaj
    return errorResponse('Geçersiz rozet numarası veya şifre', 401);
  }

  const valid = await verifyPassword(password, officer.password_hash);
  if (!valid) {
    return errorResponse('Geçersiz rozet numarası veya şifre', 401);
  }

  const jwt = await signJwt(
    {
      sub: officer.id,
      badge_id: officer.badge_id,
      full_name: officer.full_name,
    },
    jwtSecret,
  );

  // password_hash'i client'a göndermiyoruz
  const safeOfficer = {
    id: officer.id,
    badge_id: officer.badge_id,
    full_name: officer.full_name,
    created_at: officer.created_at,
  };

  return jsonResponse({ officer: safeOfficer, jwt });
});
