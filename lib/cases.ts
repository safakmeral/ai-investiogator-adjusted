// =====================================================================
// Vakalar API'si — Supabase üzerinden CRUD
// =====================================================================

import { supabase } from './supabase';
import { useAuthStore } from './store';
import type { Case, CaseStatus } from './types';

function generateCaseCode(): string {
  // 4 karakter: harf+rakam karışık, kolay okunur
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function listCases(filter: 'all' | 'open' | 'closed' = 'all'): Promise<Case[]> {
  const officer = useAuthStore.getState().officer;
  if (!officer) throw new Error('Oturum açık değil');

  let q = supabase
    .from('cases')
    .select('*')
    .eq('officer_id', officer.id)
    .order('created_at', { ascending: false });

  if (filter !== 'all') q = q.eq('status', filter);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Case[];
}

export interface NewCaseInput {
  suspect_tc: string;
  suspect_name: string;
  suspect_surname: string;
  suspect_age: number;
  suspect_gender: 'erkek' | 'kadın';
  suspect_photo_url: string | null;
  crime_type: string;
  initial_statement: string;
  crime_scene_notes: string;
}

export async function createCase(input: NewCaseInput): Promise<Case> {
  const officer = useAuthStore.getState().officer;
  if (!officer) throw new Error('Oturum açık değil');

  // Benzersiz vaka kodu oluştur (çakışma olursa retry)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCaseCode();
    const { data, error } = await supabase
      .from('cases')
      .insert({
        case_code: code,
        officer_id: officer.id,
        ...input,
      })
      .select()
      .single();

    if (!error && data) return data as Case;
    if (error && !error.message.includes('case_code')) {
      throw new Error(error.message);
    }
  }
  throw new Error('Vaka kodu üretilemedi, tekrar deneyin');
}

export async function getCase(id: string): Promise<Case | null> {
  const { data, error } = await supabase.from('cases').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Case | null;
}

export async function updateCaseStatus(id: string, status: CaseStatus): Promise<void> {
  const { error } = await supabase.from('cases').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadSuspectPhoto(uri: string, caseHint: string): Promise<string> {
  // Storage'a yükle, public URL dön
  const fileExt = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const fileName = `${caseHint}-${Date.now()}.${fileExt}`;
  const mime =
    fileExt === 'png' ? 'image/png' :
    fileExt === 'webp' ? 'image/webp' :
    fileExt === 'heic' ? 'image/heic' : 'image/jpeg';

  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('suspect-photos')
    .upload(fileName, arrayBuffer, {
      contentType: mime,
      upsert: false,
    });
  if (error) throw new Error(`Fotoğraf yüklenemedi: ${error.message}`);

  const { data } = supabase.storage.from('suspect-photos').getPublicUrl(fileName);
  return data.publicUrl;
}
