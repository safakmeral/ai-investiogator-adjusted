// =====================================================================
// Edge Function: seed-officer
// İlk officer'ı oluşturmak için yardımcı (geliştirme amaçlı).
// Body: { badge_id, password, full_name, admin_secret }
// admin_secret env'deki ADMIN_SEED_SECRET ile eşleşmeli.
// =====================================================================

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';
import { hashPassword } from '../_shared/bcrypt.ts';
import { getAdminClient } from '../_shared/db.ts';

interface SeedBody {
  badge_id?: string;
  password?: string;
  full_name?: string;
  admin_secret?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  const adminSecret = Deno.env.get('ADMIN_SEED_SECRET');
  if (!adminSecret) {
    return errorResponse('ADMIN_SEED_SECRET tanımlı değil', 500);
  }

  let body: SeedBody;
  try {
    body = (await req.json()) as SeedBody;
  } catch {
    return errorResponse('Geçersiz JSON');
  }

  if (body.admin_secret !== adminSecret) {
    return errorResponse('Yetkisiz', 401);
  }

  const badgeId = body.badge_id?.trim();
  const password = body.password ?? '';
  const fullName = body.full_name?.trim();

  if (!badgeId || !password || !fullName) {
    return errorResponse('badge_id, password, full_name zorunlu');
  }

  const supabase = getAdminClient();
  const passwordHash = await hashPassword(password);

  const { data, error } = await supabase
    .from('officers')
    .upsert(
      { badge_id: badgeId, password_hash: passwordHash, full_name: fullName },
      { onConflict: 'badge_id' },
    )
    .select('id, badge_id, full_name, created_at')
    .single();

  if (error) return errorResponse(error.message, 500);
  return jsonResponse({ officer: data });
});
