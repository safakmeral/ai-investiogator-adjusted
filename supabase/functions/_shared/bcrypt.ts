// Deno için bcrypt sarmalayıcı
// Deno standart kütüphanesinde bcrypt yok; jsr / npm üzerinden eklenir.
// Edge Function deploy edilirken `npm:bcryptjs` kullanılır (Supabase Deno
// runtime npm: spesifikasyonunu destekler).

import bcrypt from 'npm:bcryptjs@2.4.3';

export async function hashPassword(plain: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plain, salt);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(plain, hash);
}
